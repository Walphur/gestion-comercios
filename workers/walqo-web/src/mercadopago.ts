/**
 * Mercado Pago en WalQo Web: la conexión (OAuth, con la clave secreta de la app) y el cobro con QR
 * corren en el servidor, con la misma lógica que mercadopago.rs y mercadopago_oauth.rs de la PC.
 * Los tokens del comercio quedan en _walqo_meta: el navegador nunca los ve.
 */
import { getDb } from "../../../src/db/index";
import { currentEnv, currentStorage } from "./context";
import { deleteMeta, readMeta, writeMeta } from "./meta";

type Args = Record<string, unknown>;
type Json = Record<string, unknown>;

const MP_API = "https://api.mercadopago.com";
const MP_AUTH_URL = "https://auth.mercadopago.com/authorization";
/** La única dirección de vuelta registrada en Mercado Pago Developers (la misma que usa la PC). */
const DEFAULT_REDIRECT_URI = "https://walphur.github.io/gestion-comercios/oauth/callback.html";
/** docs/oauth/callback.html manda a walqo.pro/web/ las autorizaciones con este prefijo; el resto, a la PC. */
const WEB_STATE_PREFIX = "w.";
const OAUTH_PENDING_MS = 10 * 60_000;
const QR_MIN_AMOUNT = 10;

interface MpTokens {
  access_token: string;
  refresh_token: string;
  /** Milisegundos. */
  expires_at: number;
  user_id: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// --- Configuración y settings ---------------------------------------------------------

function appConfig() {
  const env = currentEnv();
  const id = env.MP_CLIENT_ID?.trim();
  const secret = env.MP_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  return { id, secret, redirect: env.MP_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI };
}

function requireConfig() {
  const cfg = appConfig();
  if (!cfg) throw new Error("La conexión con Mercado Pago todavía no está habilitada en WalQo Web.");
  return cfg;
}

async function readSetting(key: string): Promise<string> {
  const db = await getDb();
  const rows = await db.select<{ value: string | null }[]>("SELECT value FROM settings WHERE key = ?1", [key]);
  return (rows[0]?.value ?? "").trim();
}

async function readFlag(key: string): Promise<boolean> {
  const v = (await readSetting(key)).toLowerCase();
  return v === "1" || v === "true";
}

async function writeSettings(values: Record<string, string>): Promise<void> {
  const db = await getDb();
  for (const [key, value] of Object.entries(values)) {
    await db.execute(
      "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  }
}

// --- HTTP ---------------------------------------------------------------------------

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const randomB64 = (size: number) => b64url(crypto.getRandomValues(new Uint8Array(size)));

/** Algunas respuestas de error repiten el token: nunca sale en un mensaje. */
const hideTokens = (text: string) => text.replace(/\b(APP_USR|TG|TEST)-[\w-]+/g, "•••");

async function mpFetch(
  path: string,
  opts: { token?: string; body?: unknown; idempotency?: string } = {},
): Promise<{ ok: boolean; status: number; body: Json }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotency) headers["X-Idempotency-Key"] = opts.idempotency;
  let res: Response;
  try {
    res = await fetch(`${MP_API}${path}`, {
      method: opts.body === undefined ? "GET" : "POST",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new Error("Sin conexión con Mercado Pago. Probá de nuevo en unos segundos.");
  }
  const body = (await res.json().catch(() => ({}))) as Json;
  return { ok: res.ok, status: res.status, body: body && typeof body === "object" ? body : {} };
}

function mpErrorText(body: Json): string {
  const parts: string[] = [];
  const push = (v: unknown) => {
    const text = typeof v === "string" ? v.trim() : "";
    if (text && !parts.some((p) => p.toLowerCase() === text.toLowerCase())) parts.push(text);
  };
  push(body.message);
  push(body.error);
  for (const cause of list(body.cause)) {
    push(cause.code);
    push(cause.description);
  }
  for (const err of Array.isArray(body.errors) ? body.errors : []) {
    push(typeof err === "string" ? err : (err as Json)?.code);
  }
  return hideTokens(parts.join(" — ") || "Error de Mercado Pago (sin detalle).");
}

// --- Tokens del comercio ------------------------------------------------------------

function readTokens(): MpTokens | null {
  const tokens = parseJson<MpTokens>(readMeta("mp_oauth"));
  return tokens?.access_token ? tokens : null;
}

async function requestToken(params: Record<string, string>): Promise<MpTokens> {
  const cfg = requireConfig();
  const res = await mpFetch("/oauth/token", {
    body: { client_id: cfg.id, client_secret: cfg.secret, ...params },
  });
  if (!res.ok || typeof res.body.access_token !== "string") throw new Error(mpErrorText(res.body));
  const prev = readTokens();
  return {
    access_token: res.body.access_token,
    refresh_token: str(res.body.refresh_token) || prev?.refresh_token || "",
    expires_at: Date.now() + (Number(res.body.expires_in) || 180 * 86400) * 1000,
    user_id: res.body.user_id != null ? String(res.body.user_id) : (prev?.user_id ?? ""),
  };
}

/** Mercado Pago cambia el refresh token en cada renovación: dos renovaciones a la vez dejarían uno inválido. */
const refreshing = new WeakMap<DurableObjectStorage, Promise<string>>();

async function accessToken(): Promise<string> {
  const tokens = readTokens();
  if (!tokens) {
    const manual = await readSetting("mp_access_token");
    if (manual) return manual;
    throw new Error("Conectá Mercado Pago en Administración → Negocio y caja.");
  }
  if (Date.now() < tokens.expires_at - 5 * 60_000 || !tokens.refresh_token) return tokens.access_token;
  const storage = currentStorage();
  const running = refreshing.get(storage);
  if (running) return running;
  const job = requestToken({ grant_type: "refresh_token", refresh_token: tokens.refresh_token })
    .then((next) => {
      writeMeta("mp_oauth", JSON.stringify(next));
      return next.access_token;
    })
    .catch((error: Error) => {
      throw new Error(`No se pudo renovar la conexión con Mercado Pago. Volvé a conectarlo. (${error.message})`);
    })
    .finally(() => refreshing.delete(storage));
  refreshing.set(storage, job);
  return job;
}

// --- Sucursal y caja QR (igual que ensure_store_and_pos) -----------------------------

const AR_STATES: [code: string, official: string, plain?: string][] = [
  ["AR-B", "Buenos Aires"],
  ["AR-C", "Capital Federal"],
  ["AR-K", "Catamarca"],
  ["AR-H", "Chaco"],
  ["AR-U", "Chubut"],
  ["AR-W", "Corrientes"],
  ["AR-X", "Córdoba", "Cordoba"],
  ["AR-E", "Entre Ríos", "Entre Rios"],
  ["AR-P", "Formosa"],
  ["AR-Y", "Jujuy"],
  ["AR-L", "La Pampa"],
  ["AR-F", "La Rioja"],
  ["AR-M", "Mendoza"],
  ["AR-N", "Misiones"],
  ["AR-Q", "Neuquén", "Neuquen"],
  ["AR-R", "Río Negro", "Rio Negro"],
  ["AR-A", "Salta"],
  ["AR-J", "San Juan"],
  ["AR-D", "San Luis"],
  ["AR-Z", "Santa Cruz"],
  ["AR-S", "Santa Fe"],
  ["AR-G", "Santiago del Estero"],
  ["AR-V", "Tierra del Fuego"],
  ["AR-T", "Tucumán", "Tucuman"],
];

type Place = [street: string, number: string, city: string, state: string, lat: number, lng: number];

/** Pares que el validador de sucursales acepta: si la ciudad del comercio no pasa, se prueban estos. */
const STORE_LOCATION_CATALOG: Place[] = [
  ["Av Illia", "100", "San Luis", "San Luis", -33.3017, -66.3378],
  ["Av Colon", "100", "Córdoba", "Córdoba", -31.4201, -64.1888],
  ["Av Corrientes", "1000", "Palermo", "Capital Federal", -34.588, -58.43],
  ["Av Cabildo", "2000", "Belgrano", "Capital Federal", -34.562, -58.456],
  ["San Martin", "100", "La Plata", "Buenos Aires", -34.921, -57.954],
  ["San Martin", "100", "Mendoza", "Mendoza", -32.8895, -68.8458],
  ["San Martin", "100", "Santa Fe", "Santa Fe", -31.6333, -60.7],
  ["San Martin", "100", "Rosario", "Santa Fe", -32.9442, -60.6505],
  ["San Martin", "100", "Salta", "Salta", -24.7821, -65.4232],
  ["San Martin", "100", "San Juan", "San Juan", -31.5375, -68.5364],
  ["San Martin", "100", "Corrientes", "Corrientes", -27.4692, -58.8306],
  ["San Martin", "100", "Resistencia", "Chaco", -27.4514, -58.9867],
  ["San Martin", "100", "Posadas", "Misiones", -27.3621, -55.9008],
  ["San Martin", "100", "Paraná", "Entre Ríos", -31.7333, -60.5333],
  ["San Martin", "100", "Neuquén", "Neuquén", -38.9516, -68.0591],
  ["San Martin", "100", "Viedma", "Río Negro", -40.8135, -62.9967],
  ["San Martin", "100", "San Miguel de Tucumán", "Tucumán", -26.8083, -65.2176],
  ["San Martin", "100", "Tucumán", "Tucumán", -26.8083, -65.2176],
  ["San Martin", "100", "San Salvador de Jujuy", "Jujuy", -24.1858, -65.2995],
  ["San Martin", "100", "Catamarca", "Catamarca", -28.4696, -65.7795],
  ["San Martin", "100", "La Rioja", "La Rioja", -29.4131, -66.8563],
  ["San Martin", "100", "Santa Rosa", "La Pampa", -36.6203, -64.2906],
  ["San Martin", "100", "Formosa", "Formosa", -26.1775, -58.1781],
  ["San Martin", "100", "Rawson", "Chubut", -43.3002, -65.1023],
  ["San Martin", "100", "Río Gallegos", "Santa Cruz", -51.623, -69.2168],
  ["San Martin", "100", "Ushuaia", "Tierra del Fuego", -54.8019, -68.303],
  ["San Martin", "100", "Santiago del Estero", "Santiago del Estero", -27.7951, -64.2615],
];

const withoutAccents = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function fold(v: string): string {
  return withoutAccents(v)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function resolveState(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const folded = fold(trimmed);
  const capital = ["capital federal", "caba", "ciudad autonoma de buenos aires", "ciudad de buenos aires", "ciudad autonoma", "cf"];
  if (capital.includes(folded) || trimmed.toUpperCase() === "AR-C") return "Capital Federal";
  const byCode = AR_STATES.find(([code]) => code === trimmed.toUpperCase());
  if (byCode) return byCode[1];
  return AR_STATES.find(([, official]) => fold(official) === folded)?.[1] ?? trimmed;
}

const plainState = (state: string) => AR_STATES.find(([, official]) => fold(official) === fold(state))?.[2];

function stateCoords(state: string): [number, number] {
  const place = STORE_LOCATION_CATALOG.find((p) => fold(p[3]) === fold(state));
  return place ? [place[4], place[5]] : [-34.6037, -58.3816];
}

function sanitizeStreet(name: string): string {
  const cleaned = name.replace(/[^A-Za-z\s]/g, "").split(/\s+/).filter(Boolean).join(" ");
  return cleaned.length < 3 ? "San Martin" : cleaned.slice(0, 40);
}

const sanitizeStreetNumber = (raw: string) => raw.replace(/\D/g, "").slice(0, 6) || "100";

function jsonText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") {
    const o = v as Json;
    for (const key of ["name", "city_name", "state_name"]) {
      const text = jsonText(o[key]);
      if (text) return text;
    }
    return str(o.id).trim();
  }
  return "";
}

const addressText = (address: Json, keys: string[]) =>
  keys.map((k) => jsonText(address[k])).find(Boolean) ?? "";

class LocationAttempts {
  readonly out: Json[] = [];
  private readonly seen = new Set<string>();

  private push(city: string, state: string, street: string, number: string, lat: number, lng: number) {
    city = city.trim();
    state = state.trim();
    if (!city || !state) return;
    const key = `${city.toLowerCase()}|${state.toLowerCase()}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.out.push({
      street_name: street,
      street_number: number,
      city_name: city,
      state_name: state,
      latitude: lat,
      longitude: lng,
      reference: "Local",
    });
  }

  /** Ciudad del comercio primero. Después la grafía oficial y, si lleva tilde, la variante sin tilde. */
  spellings(city: string, state: string, street: string, number: string, lat: number, lng: number) {
    const official = resolveState(state);
    if (!official) return;
    const cityIsState = fold(city) === fold(official);
    this.push(city, official, street, number, lat, lng);
    if (cityIsState) this.push(official, official, street, number, lat, lng);
    const plain = plainState(official);
    if (plain) {
      this.push(cityIsState ? plain : withoutAccents(city), plain, street, number, lat, lng);
    } else if (withoutAccents(city) !== city) {
      this.push(withoutAccents(city), official, street, number, lat, lng);
    }
  }

  place(p: Place) {
    this.spellings(p[2], p[3], p[0], p[1], p[4], p[5]);
  }
}

async function firstSetting(keys: string[]): Promise<string> {
  for (const key of keys) {
    const value = await readSetting(key);
    if (value) return value;
  }
  return "";
}

async function storeLocationAttempts(profile: Json | null): Promise<Json[]> {
  const attempts = new LocationAttempts();
  let preferred = "";
  const address = profile?.address && typeof profile.address === "object" ? (profile.address as Json) : null;
  if (address) {
    const city = addressText(address, ["city", "city_name"]);
    const state = addressText(address, ["state", "state_name"]);
    if (city && state) {
      preferred = resolveState(state);
      const [lat, lng] = stateCoords(preferred);
      attempts.spellings(
        city,
        state,
        sanitizeStreet(addressText(address, ["street_name", "address"])),
        sanitizeStreetNumber(addressText(address, ["street_number"])),
        lat,
        lng,
      );
    }
  }
  const city = await firstSetting(["business_city", "ciudad", "business_ciudad", "business_localidad"]);
  const state = await firstSetting(["business_province", "provincia", "business_provincia", "business_state"]);
  if (city && state) {
    if (!preferred) preferred = resolveState(state);
    const [lat, lng] = stateCoords(state);
    attempts.spellings(city, state, "San Martin", "100", lat, lng);
  }
  if (preferred) {
    for (const p of STORE_LOCATION_CATALOG) if (fold(p[3]) === fold(preferred)) attempts.place(p);
  }
  for (const p of STORE_LOCATION_CATALOG) attempts.place(p);
  return attempts.out;
}

function externalIds(userId: string) {
  const digits = userId.replace(/\D/g, "");
  const store = `GC${digits || userId.replace(/[^A-Za-z0-9]/g, "")}`;
  return { store, pos: `${store}P1` };
}

function numericId(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

function storeEntry(entry: Json | undefined): { id: number; external: string } | null {
  const id = entry ? numericId(entry.id) : null;
  return id == null ? null : { id, external: str(entry?.external_id) };
}

function firstStoreIn(body: Json | null) {
  if (!body) return null;
  const found = storeEntry(list(body.results)[0]) ?? storeEntry(body);
  if (found) return found;
  for (const entry of list(body)) {
    const inner = storeEntry(list(entry.results)[0]) ?? storeEntry(entry);
    if (inner) return inner;
  }
  return null;
}

async function getJson(path: string, token: string): Promise<Json | null> {
  const res = await mpFetch(path, { token }).catch(() => null);
  return res?.ok ? res.body : null;
}

async function searchPos(token: string, query: string): Promise<string | null> {
  const ext = list((await getJson(`/pos?${query}`, token))?.results)[0]?.external_id;
  return typeof ext === "string" && ext ? ext : null;
}

async function findExistingStore(token: string, userId: string, externalStoreId: string) {
  const byExternal = await getJson(
    `/users/${userId}/stores/search?external_id=${encodeURIComponent(externalStoreId)}`,
    token,
  );
  const found = storeEntry(list(byExternal?.results)[0]);
  if (found) return { id: found.id, external: externalStoreId };
  return firstStoreIn(await getJson(`/users/${userId}/stores/search?limit=10`, token));
}

function errorIgnorable(body: Json): boolean {
  if (str(body.error).toLowerCase() === "validation_error") return false;
  const msg = str(body.message).toLowerCase();
  if (msg.includes("validation")) return false;
  if (/already|exist|duplic/.test(msg)) return true;
  return list(body.cause).some((c) =>
    ["point_of_sale_exists", "store_already_exists", "duplicate"].includes(str(c.code).toLowerCase()),
  );
}

function isLocationValidationError(body: Json): boolean {
  const raw = JSON.stringify(body).toLowerCase();
  const place = ["city_name", "state_name", "location.city", "location.state"].some((k) => raw.includes(k));
  return place && (raw.includes("invalid") || raw.includes("validation"));
}

function sanitizeStoreName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z\s]/g, "").split(/\s+/).filter(Boolean).join(" ");
  return cleaned ? cleaned.slice(0, 45) : "Mi Comercio";
}

async function ensureStoreId(token: string, userId: string, externalStoreId: string, profile: Json | null) {
  const existing = await findExistingStore(token, userId, externalStoreId);
  if (existing) return existing.id;
  const name = sanitizeStoreName((await readSetting("business_name")) || "Mi Comercio");
  let firstErr = "";
  for (const location of await storeLocationAttempts(profile)) {
    const res = await mpFetch(`/users/${userId}/stores`, {
      token,
      body: { name, external_id: externalStoreId, location },
    });
    const id = res.ok ? numericId(res.body.id) : null;
    if (id != null) return id;
    if (errorIgnorable(res.body)) {
      const again = await findExistingStore(token, userId, externalStoreId);
      if (again) return again.id;
    }
    if (!firstErr) firstErr = `sucursal: ${mpErrorText(res.body)}`;
    if (isLocationValidationError(res.body) || errorIgnorable(res.body)) continue;
    const again = await findExistingStore(token, userId, externalStoreId);
    if (again) return again.id;
    throw new Error(`sucursal: ${mpErrorText(res.body)}`);
  }
  const again = await findExistingStore(token, userId, externalStoreId);
  if (again) return again.id;
  throw new Error(firstErr || "Mercado Pago no devolvió la sucursal.");
}

async function createPos(token: string, storeId: number, externalStoreId: string, externalPosId: string) {
  const base = { name: "Caja1", fixed_amount: true, external_id: externalPosId };
  const attempts = [
    { ...base, store_id: storeId, external_store_id: externalStoreId },
    { ...base, store_id: storeId, external_store_id: externalStoreId, category: 621102 },
    { ...base, store_id: storeId },
    { ...base, external_store_id: externalStoreId },
  ];
  const lookup = async () =>
    (await searchPos(token, `external_id=${encodeURIComponent(externalPosId)}`)) ??
    (await searchPos(token, `external_store_id=${encodeURIComponent(externalStoreId)}`));
  let lastErr = "";
  for (const payload of attempts) {
    const res = await mpFetch("/pos", { token, body: payload });
    if (res.ok) return str(res.body.external_id) || externalPosId;
    if (errorIgnorable(res.body)) {
      const found = await lookup();
      if (found) return found;
    } else {
      lastErr = `caja QR: ${mpErrorText(res.body)}`;
    }
  }
  const found = await lookup();
  if (found) return found;
  throw new Error(lastErr || "caja QR: Mercado Pago no devolvió la caja.");
}

async function ensureStoreAndPos(token: string, userId: string, profile: Json | null) {
  const ids = externalIds(userId);
  const pos =
    (await searchPos(token, `external_id=${encodeURIComponent(ids.pos)}`)) ??
    (await searchPos(token, `external_store_id=${encodeURIComponent(ids.store)}`));
  if (pos) return { store: ids.store, pos };

  const existing = await findExistingStore(token, userId, ids.store);
  if (existing) {
    const store = existing.external || ids.store;
    return { store, pos: await createPos(token, existing.id, store, ids.pos) };
  }

  const anyPos = list((await getJson("/pos?limit=50", token))?.results)[0];
  if (anyPos && str(anyPos.external_id)) {
    return { store: str(anyPos.external_store_id) || ids.store, pos: str(anyPos.external_id) };
  }

  const storeId = await ensureStoreId(token, userId, ids.store, profile);
  return { store: ids.store, pos: await createPos(token, storeId, ids.store, ids.pos) };
}

async function fetchProfile(token: string): Promise<Json> {
  const res = await mpFetch("/users/me", { token });
  if (!res.ok || numericId(res.body.id) == null) throw new Error("No se pudo leer tu perfil de Mercado Pago.");
  return res.body;
}

async function repairStoreAndPos(): Promise<string> {
  const token = await accessToken();
  const profile = await fetchProfile(token).catch(() => null);
  let userId = await readSetting("mp_user_id");
  if (!userId) {
    if (!profile) throw new Error("No se pudo leer el perfil de Mercado Pago.");
    userId = String(profile.id);
  }
  const { store, pos } = await ensureStoreAndPos(token, userId, profile);
  await writeSettings({ mp_user_id: userId, mp_external_store_id: store, mp_external_pos_id: pos, mp_enabled: "1" });
  return pos;
}

// --- Conectar ----------------------------------------------------------------------

interface PendingOAuth {
  state: string;
  verifier: string;
  exp: number;
}

async function oauthStart() {
  const cfg = requireConfig();
  const state = WEB_STATE_PREFIX + randomB64(18);
  const verifier = randomB64(32);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  writeMeta("mp_oauth_pending", JSON.stringify({ state, verifier, exp: Date.now() + OAUTH_PENDING_MS }));
  const query = new URLSearchParams({
    response_type: "code",
    client_id: cfg.id,
    platform_id: "mp",
    state,
    redirect_uri: cfg.redirect,
    scope: "offline_access read write",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return { url: `${MP_AUTH_URL}?${query.toString().replace(/\+/g, "%20")}` };
}

/** Lo llama la pestaña que vuelve de Mercado Pago, con la sesión de la cuenta de este navegador. */
async function oauthFinish(args: Args) {
  const cfg = requireConfig();
  const pending = parseJson<PendingOAuth>(readMeta("mp_oauth_pending"));
  const state = str(args.state).trim();
  if (!pending || pending.state !== state || Date.now() > pending.exp) {
    throw new Error("Esta autorización venció o es de otro intento. Volvé a tocar «Conectar con Mercado Pago».");
  }
  deleteMeta("mp_oauth_pending");
  const code = str(args.code).trim();
  if (!code) throw new Error("Mercado Pago no mandó la autorización. Intentá de nuevo.");

  let tokens: MpTokens;
  try {
    tokens = await requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirect,
      code_verifier: pending.verifier,
    });
  } catch (error) {
    throw new Error(`No se pudo autorizar la cuenta: ${(error as Error).message}`);
  }
  const profile = await fetchProfile(tokens.access_token);
  tokens.user_id = String(profile.id);
  const { store, pos } = await ensureStoreAndPos(tokens.access_token, tokens.user_id, profile);
  writeMeta("mp_oauth", JSON.stringify(tokens));
  const nickname = str(profile.nickname) || str(profile.email) || `Usuario ${profile.id}`;
  await writeSettings({
    mp_user_id: tokens.user_id,
    mp_user_nickname: nickname,
    mp_external_store_id: store,
    mp_external_pos_id: pos,
    mp_oauth_connected: "1",
    mp_simulation: "0",
    mp_enabled: "1",
  });
  return { user_id: tokens.user_id, nickname, external_store_id: store, external_pos_id: pos };
}

async function disconnect() {
  deleteMeta("mp_oauth");
  deleteMeta("mp_oauth_pending");
  await writeSettings({
    mp_access_token: "",
    mp_refresh_token: "",
    mp_token_expires_at: "",
    mp_user_id: "",
    mp_user_nickname: "",
    mp_external_store_id: "",
    mp_external_pos_id: "",
    mp_oauth_connected: "0",
    mp_enabled: "0",
  });
  return null;
}

async function configStatus() {
  const oauthConnected = (await readFlag("mp_oauth_connected")) && readTokens() != null;
  const pos = await readSetting("mp_external_pos_id");
  const token = await readSetting("mp_access_token");
  return {
    enabled: await readFlag("mp_enabled"),
    configured: oauthConnected ? pos !== "" : token !== "" && pos !== "",
    simulation: await readFlag("mp_simulation"),
    oauth_connected: oauthConnected,
    oauth_available: appConfig() != null,
    nickname: oauthConnected ? (await readSetting("mp_user_nickname")) || null : null,
  };
}

// --- Cobro con QR (igual que create_mp_qr_order y check_mp_order_status) ------------

function sanitizeField(value: string, max: number, fallback: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9 _-]/g, "").split(/\s+/).filter(Boolean).join(" ").trim();
  return cleaned ? cleaned.slice(0, max) : fallback;
}

function postQrOrder(token: string, posId: string, amount: number, description: string, reference: string) {
  const total = amount.toFixed(2);
  const title = sanitizeField(description, 150, "Venta");
  return mpFetch("/v1/orders", {
    token,
    idempotency: crypto.randomUUID(),
    body: {
      type: "qr",
      total_amount: total,
      description: title,
      external_reference: sanitizeField(reference, 64, "pos-venta"),
      expiration_time: "PT15M",
      config: { qr: { external_pos_id: posId, mode: "dynamic" } },
      transactions: { payments: [{ amount: total }] },
      items: [{ title, unit_price: total, quantity: 1, unit_measure: "unit" }],
    },
  });
}

function needsPosRepair(status: number, body: Json): boolean {
  return status === 404 || list(body.cause).some((c) => str(c.code).toLowerCase() === "pos_not_found");
}

async function createQrOrder(args: Args) {
  const amount = Number(args.amount);
  const description = str(args.description);
  const reference = str(args.externalReference);
  if (!(amount > 0)) throw new Error("El monto debe ser mayor a cero.");
  if (amount < QR_MIN_AMOUNT) {
    throw new Error(`El monto es muy pequeño para cobrar con Mercado Pago QR. Mínimo: $${QR_MIN_AMOUNT.toFixed(2)}.`);
  }
  if (!(await readFlag("mp_enabled"))) throw new Error("Mercado Pago no está activado en Administración.");

  if (await readFlag("mp_simulation")) {
    return {
      order_id: `SIM-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      external_reference: reference,
      qr_data: `MP-SIM|ref=${reference}|amount=${amount.toFixed(2)}|desc=${description.slice(0, 40)}`,
      simulated: true,
    };
  }

  const token = await accessToken();
  let posId = (await readSetting("mp_external_pos_id")) || (await repairStoreAndPos());
  let res = await postQrOrder(token, posId, amount, description, reference);
  if (!res.ok && needsPosRepair(res.status, res.body)) {
    posId = await repairStoreAndPos();
    res = await postQrOrder(token, posId, amount, description, reference);
  }
  if (!res.ok) {
    const detail =
      res.status === 400 && !res.body.message
        ? "Monto inválido o datos rechazados. Probá con un importe mayor (mín. $10)."
        : mpErrorText(res.body);
    throw new Error(`Mercado Pago (${res.status}): ${detail}`);
  }
  const orderId = str(res.body.id);
  if (!orderId) throw new Error("Mercado Pago no devolvió ID de orden.");
  const typeResponse = (res.body.type_response ?? {}) as Json;
  const qrConfig = ((res.body.config as Json | undefined)?.qr ?? {}) as Json;
  const qrData = str(typeResponse.qr_data) || str(qrConfig.qr_data) || str(res.body.qr_data);
  if (!qrData) throw new Error("Mercado Pago no devolvió el código QR. Volvé a conectar Mercado Pago.");
  return { order_id: orderId, external_reference: reference, qr_data: qrData, simulated: false };
}

function simulatedStatus(orderId: string) {
  const ts = Number(orderId.slice(4).split("-")[0]);
  if (Number.isFinite(ts) && Date.now() - ts >= 3000) {
    return { status: "approved", status_detail: "simulated", payment_id: `SIM-PAY-${orderId}` };
  }
  return { status: "pending", status_detail: "simulated", payment_id: null };
}

async function checkOrderStatus(args: Args) {
  const orderId = str(args.orderId).trim();
  if (args.simulated === true || orderId.startsWith("SIM-")) return simulatedStatus(orderId);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(orderId)) throw new Error("Orden de Mercado Pago inválida.");

  const res = await mpFetch(`/v1/orders/${orderId}`, { token: await accessToken() });
  if (!res.ok) throw new Error(hideTokens(str(res.body.message) || "No se pudo consultar la orden"));

  const payments = list((res.body.transactions as Json | undefined)?.payments);
  const firstPaymentId = str(payments[0]?.id) || null;
  const status = str(res.body.status).toLowerCase();
  if (["paid", "processed", "closed"].includes(status)) {
    return { status: "approved", status_detail: status, payment_id: firstPaymentId };
  }
  if (payments.some((p) => ["approved", "processed"].includes(str(p.status).toLowerCase()))) {
    return { status: "approved", status_detail: "approved", payment_id: firstPaymentId };
  }
  return { status: status || "pending", status_detail: str(res.body.status_detail) || null, payment_id: null };
}

export const MP_COMMANDS: Record<string, (args: Args) => Promise<unknown>> = {
  get_mp_config_status: configStatus,
  mp_oauth_start: oauthStart,
  mp_oauth_finish: oauthFinish,
  disconnect_mp_oauth: disconnect,
  create_mp_qr_order: createQrOrder,
  check_mp_order_status: checkOrderStatus,
};
