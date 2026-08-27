/** Panel web del dueño: sesión + push de snapshot + dashboard solo lectura. */

type D1Database = any;

export interface PortalEnv {
  DB: D1Database;
  LICENSE_ADMIN_SECRET: string;
  LICENSE_PUBLIC_KEY_HEX: string;
}

const SESSION_TTL_SECS = 60 * 60 * 24 * 14; // 14 días
const TOKEN_PREFIX = "WP1";
const MAX_PUSH_BYTES = 120_000;
const MAX_RECENT_SALES = 20;
const MAX_LOW_STOCK = 30;
const MAX_REGISTERS = 20;

/** Rate limit en memoria del isolate (suficiente para MVP). */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function json(data: unknown, status = 200, origin?: string | null): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": portalCorsOrigin(origin) || "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
  return new Response(JSON.stringify(data), { status, headers });
}

function err(
  message: string,
  code: string,
  status = 400,
  origin?: string | null,
): Response {
  return json({ ok: false, error: code, message }, status, origin);
}

export function portalCorsOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  const o = origin.trim().toLowerCase();
  if (
    o === "https://walqo.pro" ||
    o === "https://www.walqo.pro" ||
    o === "https://walphur.github.io" ||
    o.startsWith("http://localhost:") ||
    o.startsWith("http://127.0.0.1:")
  ) {
    return origin;
  }
  return null;
}

export function portalOptions(req: Request): Response {
  const origin = portalCorsOrigin(req.headers.get("origin"));
  return new Response(null, {
    headers: {
      "access-control-allow-origin": origin || "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-max-age": "86400",
    },
  });
}

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = rateBuckets.get(key);
  if (!cur || now >= cur.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(email: string, password: string): Promise<string> {
  return sha256Hex(`pw:${email}:${password}`);
}

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else {
    bytes = new Uint8Array(data);
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64url(sig);
}

interface SessionPayload {
  v: number;
  aid: string;
  lid: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

async function mintSession(
  env: PortalEnv,
  account: { id: string; name: string; email: string; license_id: string },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    aid: account.id,
    lid: account.license_id,
    email: account.email,
    name: account.name,
    iat: now,
    exp: now + SESSION_TTL_SECS,
  };
  const body = b64url(JSON.stringify(payload));
  const signed = `${TOKEN_PREFIX}.${body}`;
  const sig = await hmacSign(env.LICENSE_ADMIN_SECRET, signed);
  return `${signed}.${sig}`;
}

async function verifySession(
  env: PortalEnv,
  token: string,
): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const signed = `${parts[0]}.${parts[1]}`;
  const expected = await hmacSign(env.LICENSE_ADMIN_SECRET, signed);
  if (expected !== parts[2]) return null;
  try {
    const raw = new TextDecoder().decode(b64urlDecode(parts[1]));
    const payload = JSON.parse(raw) as SessionPayload;
    if (payload.v !== 1 || !payload.aid || !payload.lid) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (!clean || clean.length % 2 !== 0) {
    throw new Error("LICENSE_PUBLIC_KEY_HEX inválida");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("LICENSE_PUBLIC_KEY_HEX inválida");
    out[i] = byte;
  }
  return out;
}

/** Valida el token de licencia de la app (GC1.*) y devuelve license_id + machine_id del payload. */
async function verifyLicenseDeviceToken(
  env: PortalEnv,
  token: string,
): Promise<{ lid: string; machine_id: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "GC1") return null;
  const signed = `${parts[0]}.${parts[1]}`;
  try {
    const payloadBytes = b64urlDecode(parts[1]);
    const sigBytes = b64urlDecode(parts[2]);
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      lid?: string;
      machine_id?: string;
      exp?: number;
    };
    if (!payload.lid || !payload.machine_id) return null;
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const pubRaw = hexToBytes(env.LICENSE_PUBLIC_KEY_HEX);
    const pubKey = await crypto.subtle.importKey(
      "raw",
      pubRaw,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "Ed25519",
      pubKey,
      sigBytes,
      new TextEncoder().encode(signed),
    );
    return ok ? { lid: payload.lid, machine_id: payload.machine_id } : null;
  } catch {
    return null;
  }
}

async function upsertPortalSnapshot(
  env: PortalEnv,
  licenseId: string,
  payloadJson: string,
  deviceName: string,
  updatedAt: string,
): Promise<void> {
  // Solo espejar si la licencia existe (evita 500 por FK huérfana).
  const exists = await env.DB.prepare("SELECT id FROM licenses WHERE id = ?1")
    .bind(licenseId)
    .first<{ id: string }>();
  if (!exists) return;

  await env.DB.prepare(
    `INSERT INTO portal_snapshots (license_id, payload, device_name, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(license_id) DO UPDATE SET
       payload = excluded.payload,
       device_name = excluded.device_name,
       updated_at = excluded.updated_at`,
  )
    .bind(licenseId, payloadJson, deviceName, updatedAt)
    .run();
}

/** También escribe el snapshot bajo la licencia de la cuenta (si la PC está vinculada). */
async function mirrorSnapshotToAccountLicenses(
  env: PortalEnv,
  machineId: string,
  primaryLicenseId: string,
  payloadJson: string,
  deviceName: string,
  updatedAt: string,
): Promise<void> {
  try {
    const rows = await env.DB.prepare(
      `SELECT DISTINCT a.license_id AS license_id
       FROM account_devices ad
       INNER JOIN accounts a ON a.id = ad.account_id
       INNER JOIN licenses l ON l.id = a.license_id
       WHERE ad.machine_id = ?1
         AND a.license_id IS NOT NULL
         AND a.license_id != ?2`,
    )
      .bind(machineId, primaryLicenseId)
      .all<{ license_id: string }>();

    const list = Array.isArray(rows?.results) ? rows.results : [];
    for (const row of list) {
      if (!row?.license_id) continue;
      try {
        await upsertPortalSnapshot(env, row.license_id, payloadJson, deviceName, updatedAt);
      } catch (e) {
        console.error("portal mirror row failed", row.license_id, e);
      }
    }
  } catch (e) {
    // El push principal no debe fallar por el espejo a otra licencia.
    console.error("portal mirror query failed", e);
  }
}

async function findSnapshotForAccount(
  env: PortalEnv,
  accountId: string,
  accountLicenseId: string,
): Promise<{ payload: string; device_name: string | null; updated_at: string } | null> {
  const direct = await env.DB.prepare(
    "SELECT payload, device_name, updated_at FROM portal_snapshots WHERE license_id = ?1",
  )
    .bind(accountLicenseId)
    .first<{ payload: string; device_name: string | null; updated_at: string }>();
  if (direct) return direct;

  // Pro+ en la PC vs licencia free de la cuenta: buscar por máquinas vinculadas.
  return env.DB.prepare(
    `SELECT ps.payload, ps.device_name, ps.updated_at
     FROM portal_snapshots ps
     INNER JOIN activations act ON act.license_id = ps.license_id
     INNER JOIN account_devices ad ON ad.machine_id = act.machine_id
     WHERE ad.account_id = ?1
     ORDER BY ps.updated_at DESC
     LIMIT 1`,
  )
    .bind(accountId)
    .first<{ payload: string; device_name: string | null; updated_at: string }>();
}

export async function handlePortalLogin(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const ip = clientIp(req);
  if (!rateLimit(`portal-login:${ip}`, 20, 60_000)) {
    return err("Demasiados intentos. Probá en un minuto.", "rate_limited", 429, origin);
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  if (!body) return err("JSON inválido", "bad_json", 400, origin);

  const email = normalizeEmail(body.email || "");
  const password = body.password || "";
  if (!isValidEmail(email)) return err("Email inválido", "bad_email", 400, origin);
  if (password.length < 8) return err("Contraseña inválida", "bad_password", 400, origin);

  const account = await env.DB.prepare(
    `SELECT id, name, verified, password_hash, business_name, license_id, license_key
     FROM accounts WHERE email = ?1`,
  )
    .bind(email)
    .first<{
      id: string;
      name: string;
      verified: number;
      password_hash: string | null;
      business_name: string | null;
      license_id: string | null;
      license_key: string | null;
    }>();

  if (!account || !account.password_hash) {
    return err("Email o contraseña incorrectos", "bad_credentials", 401, origin);
  }
  if (!account.verified) {
    return err("Verificá tu email antes de entrar al panel", "not_verified", 403, origin);
  }

  const hash = await hashPassword(email, password);
  if (hash !== account.password_hash) {
    return err("Email o contraseña incorrectos", "bad_credentials", 401, origin);
  }

  if (!account.license_id) {
    return err(
      "Tu cuenta aún no tiene licencia vinculada. Abrí la app de escritorio e iniciá sesión ahí primero.",
      "no_license",
      403,
      origin,
    );
  }

  const token = await mintSession(env, {
    id: account.id,
    name: account.name,
    email,
    license_id: account.license_id,
  });

  return json(
    {
      ok: true,
      token,
      email,
      name: account.name,
      business_name: account.business_name ?? undefined,
      expires_in: SESSION_TTL_SECS,
    },
    200,
    origin,
  );
}

export async function handlePortalLogout(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  // Token es stateless (HMAC); el cliente borra el Bearer. Endpoint por simetría.
  void env;
  void req;
  return json({ ok: true }, 200, origin);
}

export async function handlePortalMe(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const token = bearerToken(req);
  if (!token) return err("Sesión requerida", "unauthorized", 401, origin);
  const session = await verifySession(env, token);
  if (!session) return err("Sesión inválida o vencida", "unauthorized", 401, origin);

  const account = await env.DB.prepare(
    "SELECT business_name, name, email FROM accounts WHERE id = ?1",
  )
    .bind(session.aid)
    .first<{ business_name: string | null; name: string; email: string }>();

  return json(
    {
      ok: true,
      email: account?.email || session.email,
      name: account?.name || session.name,
      business_name: account?.business_name ?? undefined,
    },
    200,
    origin,
  );
}

export interface PortalSnapshotPayload {
  business_name?: string;
  sales_today_total?: number;
  sales_today_count?: number;
  products_total?: number;
  low_stock_count?: number;
  recent_sales?: Array<{
    at?: string;
    total?: number;
    device?: string;
    payment_method?: string;
  }>;
  sales_by_register?: Array<{
    device_code?: string;
    device_name?: string | null;
    count?: number;
    total?: number;
  }>;
  low_stock?: Array<{
    name?: string;
    stock?: number;
    min_stock?: number;
  }>;
  pushed_at?: string;
  device_name?: string;
}

function sanitizePayload(raw: unknown): PortalSnapshotPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const recent = Array.isArray(o.recent_sales) ? o.recent_sales : [];
  const registers = Array.isArray(o.sales_by_register) ? o.sales_by_register : [];
  const low = Array.isArray(o.low_stock) ? o.low_stock : [];

  return {
    business_name:
      typeof o.business_name === "string" ? o.business_name.slice(0, 120) : undefined,
    sales_today_total:
      typeof o.sales_today_total === "number" && Number.isFinite(o.sales_today_total)
        ? o.sales_today_total
        : 0,
    sales_today_count:
      typeof o.sales_today_count === "number" && Number.isFinite(o.sales_today_count)
        ? Math.max(0, Math.floor(o.sales_today_count))
        : 0,
    products_total:
      typeof o.products_total === "number" && Number.isFinite(o.products_total)
        ? Math.max(0, Math.floor(o.products_total))
        : 0,
    low_stock_count:
      typeof o.low_stock_count === "number" && Number.isFinite(o.low_stock_count)
        ? Math.max(0, Math.floor(o.low_stock_count))
        : 0,
    recent_sales: recent.slice(0, MAX_RECENT_SALES).map((s) => {
      const row = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      return {
        at: typeof row.at === "string" ? row.at.slice(0, 40) : "",
        total: typeof row.total === "number" && Number.isFinite(row.total) ? row.total : 0,
        device: typeof row.device === "string" ? row.device.slice(0, 64) : "",
        payment_method:
          typeof row.payment_method === "string" ? row.payment_method.slice(0, 32) : undefined,
      };
    }),
    sales_by_register: registers.slice(0, MAX_REGISTERS).map((r) => {
      const row = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return {
        device_code:
          typeof row.device_code === "string" ? row.device_code.slice(0, 16) : "—",
        device_name:
          typeof row.device_name === "string" ? row.device_name.slice(0, 64) : null,
        count:
          typeof row.count === "number" && Number.isFinite(row.count)
            ? Math.max(0, Math.floor(row.count))
            : 0,
        total: typeof row.total === "number" && Number.isFinite(row.total) ? row.total : 0,
      };
    }),
    low_stock: low.slice(0, MAX_LOW_STOCK).map((p) => {
      const row = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      return {
        name: typeof row.name === "string" ? row.name.slice(0, 120) : "?",
        stock: typeof row.stock === "number" && Number.isFinite(row.stock) ? row.stock : 0,
        min_stock:
          typeof row.min_stock === "number" && Number.isFinite(row.min_stock) ? row.min_stock : 0,
      };
    }),
    pushed_at: typeof o.pushed_at === "string" ? o.pushed_at.slice(0, 40) : undefined,
    device_name: typeof o.device_name === "string" ? o.device_name.slice(0, 80) : undefined,
  };
}

export async function handlePortalPush(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  try {
    return await handlePortalPushInner(req, env, origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("portal push failed", msg);
    return err(
      `No se pudo guardar el resumen: ${msg.slice(0, 180)}`,
      "push_failed",
      500,
      origin,
    );
  }
}

async function handlePortalPushInner(
  req: Request,
  env: PortalEnv,
  origin: string | null,
): Promise<Response> {
  const ip = clientIp(req);
  if (!rateLimit(`portal-push:${ip}`, 60, 60_000)) {
    return err("Demasiadas subidas. Esperá un momento.", "rate_limited", 429, origin);
  }

  if (!env.LICENSE_PUBLIC_KEY_HEX?.trim()) {
    return err(
      "Servidor sin clave pública de licencia. Contactá a WalQo.",
      "misconfigured",
      500,
      origin,
    );
  }

  const text = await req.text();
  if (text.length > MAX_PUSH_BYTES) {
    return err("Payload demasiado grande", "too_large", 413, origin);
  }

  let body: {
    token?: string | null;
    license_key?: string | null;
    machine_id?: string;
    device_name?: string;
    account_email?: string;
    snapshot?: unknown;
  };
  try {
    body = JSON.parse(text);
  } catch {
    return err("JSON inválido", "bad_json", 400, origin);
  }

  const machineId = (body.machine_id || "").trim();
  if (machineId.length < 8) {
    return err("Faltan datos de dispositivo", "bad_request", 400, origin);
  }

  let licenseId: string | null = null;

  const deviceToken = typeof body.token === "string" ? body.token.trim() : "";
  if (deviceToken.startsWith("GC1.")) {
    const verified = await verifyLicenseDeviceToken(env, deviceToken);
    if (!verified) {
      return err("Token de licencia inválido o vencido", "invalid_token", 401, origin);
    }
    if (verified.machine_id !== machineId) {
      return err("El token no corresponde a esta PC", "machine_mismatch", 403, origin);
    }
    const license = await env.DB.prepare("SELECT id, revoked FROM licenses WHERE id = ?1")
      .bind(verified.lid)
      .first<{ id: string; revoked: number }>();
    if (!license) return err("Licencia incorrecta", "invalid_key", 404, origin);
    if (license.revoked) return err("Licencia revocada", "revoked", 403, origin);
    licenseId = license.id;
  } else {
    const key =
      typeof body.license_key === "string" ? body.license_key.trim().toUpperCase() : "";
    if (!key) {
      return err(
        "Falta licencia activa. Reiniciá la app o reactivá la clave en Configuración.",
        "bad_request",
        400,
        origin,
      );
    }
    const license = await env.DB.prepare(
      "SELECT id, revoked FROM licenses WHERE license_key = ?1",
    )
      .bind(key)
      .first<{ id: string; revoked: number }>();
    if (!license) return err("Licencia incorrecta", "invalid_key", 404, origin);
    if (license.revoked) return err("Licencia revocada", "revoked", 403, origin);
    licenseId = license.id;
  }

  const activation = await env.DB.prepare(
    "SELECT id FROM activations WHERE license_id = ?1 AND machine_id = ?2",
  )
    .bind(licenseId, machineId)
    .first<{ id: string }>();
  if (!activation) {
    return err(
      "Esta PC no está activada con esa licencia. Activá la licencia en Configuración primero.",
      "not_activated",
      403,
      origin,
    );
  }

  const snapshot = sanitizePayload(body.snapshot ?? body);
  if (!snapshot) return err("Snapshot inválido", "bad_snapshot", 400, origin);

  const deviceName =
    (typeof body.device_name === "string" && body.device_name.trim()) ||
    snapshot.device_name ||
    "PC";
  snapshot.device_name = deviceName.slice(0, 80);
  if (!snapshot.pushed_at) {
    snapshot.pushed_at = new Date().toISOString();
  }

  const updatedAt = new Date().toISOString();
  const payloadJson = JSON.stringify(snapshot);
  const deviceShort = deviceName.slice(0, 80);

  try {
    await upsertPortalSnapshot(env, licenseId, payloadJson, deviceShort, updatedAt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(`No se pudo guardar en la nube: ${msg.slice(0, 160)}`, "db_write", 500, origin);
  }

  await mirrorSnapshotToAccountLicenses(
    env,
    machineId,
    licenseId,
    payloadJson,
    deviceShort,
    updatedAt,
  );

  const email = normalizeEmail(body.account_email || "");
  if (isValidEmail(email)) {
    try {
      const acc = await env.DB.prepare(
        `SELECT a.license_id AS license_id
         FROM accounts a
         INNER JOIN licenses l ON l.id = a.license_id
         WHERE a.email = ?1 AND a.verified = 1`,
      )
        .bind(email)
        .first<{ license_id: string | null }>();
      if (acc?.license_id && acc.license_id !== licenseId) {
        await upsertPortalSnapshot(
          env,
          acc.license_id,
          payloadJson,
          deviceShort,
          updatedAt,
        );
      }
    } catch (e) {
      console.error("portal email mirror failed", e);
    }
  }

  return json({ ok: true, updated_at: updatedAt }, 200, origin);
}

export async function handlePortalDashboard(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const token = bearerToken(req);
  if (!token) return err("Sesión requerida", "unauthorized", 401, origin);
  const session = await verifySession(env, token);
  if (!session) return err("Sesión inválida o vencida", "unauthorized", 401, origin);

  const row = await findSnapshotForAccount(env, session.aid, session.lid);

  if (!row) {
    return json(
      {
        ok: true,
        empty: true,
        message:
          "Todavía no hay datos. En la PC del comercio activá «Panel web del dueño» en Configuración.",
      },
      200,
      origin,
    );
  }

  let snapshot: PortalSnapshotPayload = {};
  try {
    snapshot = JSON.parse(row.payload) as PortalSnapshotPayload;
  } catch {
    snapshot = {};
  }

  const account = await env.DB.prepare(
    "SELECT business_name, name FROM accounts WHERE id = ?1",
  )
    .bind(session.aid)
    .first<{ business_name: string | null; name: string }>();

  return json(
    {
      ok: true,
      empty: false,
      business_name:
        snapshot.business_name ||
        account?.business_name ||
        account?.name ||
        "Mi comercio",
      device_name: row.device_name || snapshot.device_name || null,
      updated_at: row.updated_at,
      sales_today_total: snapshot.sales_today_total ?? 0,
      sales_today_count: snapshot.sales_today_count ?? 0,
      products_total: snapshot.products_total ?? 0,
      low_stock_count: snapshot.low_stock_count ?? 0,
      sales_by_register: snapshot.sales_by_register ?? [],
      recent_sales: snapshot.recent_sales ?? [],
      low_stock: snapshot.low_stock ?? [],
      pushed_at: snapshot.pushed_at ?? row.updated_at,
    },
    200,
    origin,
  );
}
