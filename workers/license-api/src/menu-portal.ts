import type { PortalEnv } from "./portal";
import { portalCorsOrigin, portalOptions, verifyLicenseDeviceToken } from "./portal";
import {
  checkMpToken,
  createMpPreference,
  encryptMpToken,
  expireMpPreference,
  loadMpCredential,
  markMpCredentialInvalid,
  mpCredentialStatus,
  mpTokenKeyReady,
  randomHex,
  safeEqual,
  syncMpPayment,
  verifyMpSignature,
  type MpEnv,
} from "./menu-portal-mp";
import { resolveUsdQuote, sanitizeUsd, storePrices, type MenuPortalUsd } from "./menu-portal-usd";

type D1Database = any;

const MAX_MENU_PUSH_BYTES = 1_200_000;
const MAX_PRODUCTS = 400;
const INFO_RATE = 60;
const INFO_WINDOW_MS = 60_000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function json(data: unknown, status = 200, origin?: string | null): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": portalCorsOrigin(origin) || "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
  return new Response(JSON.stringify(data), { status, headers });
}

export function err(message: string, code: string, status = 400, origin?: string | null): Response {
  return json({ ok: false, error: code, message }, status, origin);
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
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

function slugify(raw: string): string {
  const base = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "carta";
}

export interface MenuPortalProduct {
  id: number;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  is_daily_menu: boolean;
  image_data_url?: string;
  /** false = sin stock. Nunca se publica la cantidad. */
  available?: boolean;
  /** Hashes de la galería (menu_portal_photos), la primera es la principal. */
  photos?: string[];
  /** Precio en dólares: si hay cotización, el servidor arma `price` con el dólar del comercio. */
  price_usd?: number;
  /** Precio de lista (antes), en pesos; solo se muestra si es mayor al de venta. */
  list_price?: number;
  /** Precio de lista en dólares (productos en US$). */
  list_price_usd?: number;
  /** Celulares: equipos disponibles (sin cantidad ni IMEI). */
  units?: MenuPortalUnit[];
}

export interface MenuPortalUnit {
  capacity?: string;
  color?: string;
  condition: "nuevo" | "usado" | "reacondicionado";
  battery?: number;
}

export interface MenuPortalStore {
  color?: string;
  cover_data_url?: string;
  hours?: string;
  pickup: boolean;
  delivery: boolean;
  delivery_cost?: number | null;
  orders_enabled: boolean;
  hide_out_of_stock: boolean;
  /** El comercio quiere cobrar online con Mercado Pago (además hace falta su token en el servidor). */
  mp_online: boolean;
}

export interface MenuPortalPayload {
  business_name?: string;
  menu_slug?: string;
  logo_data_url?: string;
  whatsapp?: string | null;
  currency?: string;
  products: MenuPortalProduct[];
  store?: MenuPortalStore;
  usd?: MenuPortalUsd;
  pushed_at?: string;
}

const DEFAULT_STORE: MenuPortalStore = {
  pickup: true,
  delivery: false,
  orders_enabled: false,
  hide_out_of_stock: false,
  mp_online: false,
};

function sanitizeStore(raw: unknown): MenuPortalStore {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STORE };
  const o = raw as Record<string, unknown>;
  const color =
    typeof o.color === "string" && /^#[0-9a-fA-F]{6}$/.test(o.color.trim())
      ? o.color.trim().toLowerCase()
      : undefined;
  const cover =
    typeof o.cover_data_url === "string" &&
    o.cover_data_url.startsWith("data:image/") &&
    o.cover_data_url.length <= 130_000
      ? o.cover_data_url
      : undefined;
  const hours =
    typeof o.hours === "string" && o.hours.trim()
      ? o.hours
          .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 8)
          .join("\n")
          .slice(0, 300)
      : undefined;
  const cost =
    typeof o.delivery_cost === "number" && Number.isFinite(o.delivery_cost) && o.delivery_cost > 0
      ? Math.min(Math.round(o.delivery_cost * 100) / 100, 10_000_000)
      : null;
  let pickup = o.pickup !== false;
  const delivery = o.delivery === true;
  if (!pickup && !delivery) pickup = true;
  return {
    ...(color ? { color } : {}),
    ...(cover ? { cover_data_url: cover } : {}),
    ...(hours ? { hours } : {}),
    pickup,
    delivery,
    delivery_cost: delivery ? cost : null,
    orders_enabled: o.orders_enabled === true,
    hide_out_of_stock: o.hide_out_of_stock === true,
    mp_online: o.mp_online === true,
  };
}

function sanitizeLogoDataUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s.startsWith("data:image/")) return undefined;
  if (s.length > 140_000) return undefined;
  return s;
}

function sanitizeProductImageDataUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s.startsWith("data:image/")) return undefined;
  if (s.length > 32_000) return undefined;
  return s;
}

const PHOTO_HASH_RE = /^[0-9a-f]{16,40}$/;
const MAX_PHOTOS_PER_PRODUCT = 4;
const MAX_UNITS_PER_PRODUCT = 12;

function sanitizePhotoHashes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const h of raw) {
    if (typeof h === "string" && PHOTO_HASH_RE.test(h) && !out.includes(h)) out.push(h);
    if (out.length >= MAX_PHOTOS_PER_PRODUCT) break;
  }
  return out;
}

function sanitizeUnits(raw: unknown): MenuPortalUnit[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuPortalUnit[] = [];
  for (const u of raw.slice(0, MAX_UNITS_PER_PRODUCT)) {
    if (!u || typeof u !== "object") continue;
    const r = u as Record<string, unknown>;
    const condition =
      r.condition === "usado" || r.condition === "reacondicionado" ? r.condition : "nuevo";
    const capacity = cleanText(r.capacity, 30);
    const color = cleanText(r.color, 30);
    const battery =
      typeof r.battery === "number" && Number.isFinite(r.battery) && r.battery > 0 && r.battery <= 100
        ? Math.round(r.battery)
        : undefined;
    out.push({
      condition,
      ...(capacity ? { capacity } : {}),
      ...(color ? { color } : {}),
      ...(battery && condition !== "nuevo" ? { battery } : {}),
    });
  }
  return out;
}

function sanitizeWhatsApp(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

function positiveMoney(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(Math.round(v * 100) / 100, 10_000_000) : 0;
}

function sanitizeMenuPayload(raw: unknown): MenuPortalPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const productsRaw = Array.isArray(o.products) ? o.products : [];
  const products: MenuPortalProduct[] = [];

  for (const p of productsRaw.slice(0, MAX_PRODUCTS)) {
    if (!p || typeof p !== "object") continue;
    const row = p as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 160) : "";
    if (!name) continue;
    const id = typeof row.id === "number" && Number.isFinite(row.id) ? Math.floor(row.id) : 0;
    const price =
      typeof row.price === "number" && Number.isFinite(row.price) ? Math.max(0, row.price) : 0;
    const category =
      typeof row.category === "string" && row.category.trim()
        ? row.category.trim().slice(0, 80)
        : null;
    const description =
      typeof row.description === "string" && row.description.trim()
        ? row.description.trim().slice(0, 800)
        : null;
    const image_data_url = sanitizeProductImageDataUrl(row.image_data_url);
    const photos = sanitizePhotoHashes(row.photos);
    const units = sanitizeUnits(row.units);
    const priceUsd = positiveMoney(row.price_usd);
    const listPrice = priceUsd ? 0 : positiveMoney(row.list_price);
    const listPriceUsd = priceUsd ? positiveMoney(row.list_price_usd) : 0;
    products.push({
      id,
      name,
      price,
      category,
      description,
      is_daily_menu: row.is_daily_menu === true || row.is_daily_menu === 1,
      ...(image_data_url ? { image_data_url } : {}),
      available: row.available !== false && row.available !== 0,
      ...(photos.length ? { photos } : {}),
      ...(priceUsd ? { price_usd: priceUsd } : {}),
      ...(listPrice ? { list_price: listPrice } : {}),
      ...(listPriceUsd ? { list_price_usd: listPriceUsd } : {}),
      ...(units.length ? { units } : {}),
    });
  }
  const usd = sanitizeUsd(o.usd);

  const slugRaw =
    typeof o.menu_slug === "string"
      ? o.menu_slug
      : typeof o.workshop_slug === "string"
        ? o.workshop_slug
        : "carta";

  return {
    business_name:
      typeof o.business_name === "string" ? o.business_name.trim().slice(0, 120) : undefined,
    menu_slug: slugify(slugRaw),
    logo_data_url: sanitizeLogoDataUrl(o.logo_data_url),
    whatsapp: sanitizeWhatsApp(o.whatsapp),
    currency:
      typeof o.currency === "string" && o.currency.trim()
        ? o.currency.trim().slice(0, 8)
        : "$",
    products,
    store: sanitizeStore(o.store),
    ...(usd ? { usd } : {}),
    pushed_at: typeof o.pushed_at === "string" ? o.pushed_at.slice(0, 40) : undefined,
  };
}

/** Lo mínimo para validar un pedido sin parsear las fotos del snapshot. */
interface OrderCatalog {
  currency: string;
  whatsapp: string | null;
  business_name: string;
  store: MenuPortalStore;
  usd?: MenuPortalUsd;
  products: { id: number; name: string; price: number; price_usd?: number; available: boolean }[];
}

function buildOrderCatalog(snapshot: MenuPortalPayload): OrderCatalog {
  const store = snapshot.store ?? { ...DEFAULT_STORE };
  return {
    currency: snapshot.currency || "$",
    whatsapp: snapshot.whatsapp ?? null,
    business_name: snapshot.business_name || "Mi local",
    store: { ...store, cover_data_url: undefined },
    ...(snapshot.usd ? { usd: snapshot.usd } : {}),
    products: snapshot.products
      .filter((p) => p.id > 0 && (!store.hide_out_of_stock || p.available !== false))
      .map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        ...(p.price_usd ? { price_usd: p.price_usd } : {}),
        available: p.available !== false,
      })),
  };
}

async function resolvePushLicense(
  env: PortalEnv,
  body: {
    token?: string | null;
    license_key?: string | null;
    machine_id?: string;
  },
  origin: string | null,
): Promise<{ licenseId: string } | Response> {
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
      return err("Falta licencia activa en esta PC.", "bad_request", 400, origin);
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
    return err("Esta PC no está activada con esa licencia.", "not_activated", 403, origin);
  }

  return { licenseId };
}

export function menuPortalOptions(req: Request): Response {
  return portalOptions(req);
}

export async function handleMenuPortalPush(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const ip = clientIp(req);
  if (!rateLimit(`menu-push:${ip}`, 40, 60_000)) {
    return err("Demasiadas subidas. Esperá un momento.", "rate_limited", 429, origin);
  }

  const text = await req.text();
  if (text.length > MAX_MENU_PUSH_BYTES) {
    return err("Payload demasiado grande", "too_large", 413, origin);
  }

  let body: {
    token?: string | null;
    license_key?: string | null;
    machine_id?: string;
    snapshot?: unknown;
  };
  try {
    body = JSON.parse(text);
  } catch {
    return err("JSON inválido", "bad_json", 400, origin);
  }

  const resolved = await resolvePushLicense(env, body, origin);
  if (resolved instanceof Response) return resolved;

  const snapshot = sanitizeMenuPayload(body.snapshot ?? body);
  if (!snapshot) return err("Snapshot inválido", "bad_snapshot", 400, origin);
  if (!snapshot.pushed_at) snapshot.pushed_at = new Date().toISOString();
  await reconcilePhotos(env, resolved.licenseId, snapshot);

  const slug = snapshot.menu_slug || "carta";
  const updatedAt = new Date().toISOString();
  const payloadJson = JSON.stringify(snapshot);
  const catalogJson = JSON.stringify(buildOrderCatalog(snapshot));

  await env.DB.prepare(
    `INSERT INTO menu_portal_snapshots (license_id, menu_slug, payload, business_name, updated_at, order_catalog)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(license_id) DO UPDATE SET
       menu_slug = excluded.menu_slug,
       payload = excluded.payload,
       business_name = excluded.business_name,
       updated_at = excluded.updated_at,
       order_catalog = excluded.order_catalog`,
  )
    .bind(
      resolved.licenseId,
      slug,
      payloadJson,
      snapshot.business_name ?? null,
      updatedAt,
      catalogJson,
    )
    .run();

  return json({ ok: true, menu_slug: slug, updated_at: updatedAt }, 200, origin);
}

export async function handleMenuPortalInfo(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const ip = clientIp(req);
  if (!rateLimit(`menu-info:${ip}`, INFO_RATE, INFO_WINDOW_MS)) {
    return err("Demasiados intentos. Esperá un minuto.", "rate_limited", 429, origin);
  }

  const url = new URL(req.url);
  const slug = slugify(url.searchParams.get("slug") || url.searchParams.get("t") || "");
  if (!slug) return err("Falta el código de la carta", "bad_request", 400, origin);

  const row = await env.DB.prepare(
    `SELECT s.license_id, s.business_name, s.updated_at, s.payload, c.status AS mp_status
     FROM menu_portal_snapshots s
     LEFT JOIN menu_portal_mp_credentials c ON c.license_id = s.license_id
     WHERE s.menu_slug = ?1`,
  )
    .bind(slug)
    .first<{
      license_id: string;
      business_name: string | null;
      updated_at: string;
      payload: string;
      mp_status: string | null;
    }>();

  if (!row) {
    return err("Carta no encontrada o aún no publicada.", "not_found", 404, origin);
  }

  let snapshot: MenuPortalPayload | null = null;
  try {
    snapshot = sanitizeMenuPayload(JSON.parse(row.payload));
  } catch {
    return err("Datos de carta inválidos", "bad_payload", 500, origin);
  }
  if (!snapshot) return err("Datos de carta inválidos", "bad_payload", 500, origin);

  const store = snapshot.store ?? { ...DEFAULT_STORE };
  const listed = store.hide_out_of_stock
    ? snapshot.products.filter((p) => p.available !== false)
    : snapshot.products;
  const quote = listed.some((p) => p.price_usd) ? await resolveUsdQuote(env, snapshot.usd) : null;
  const products = listed.map((p) => {
    const { list_price: _lp, list_price_usd: _lpu, ...rest } = p;
    return { ...rest, ...storePrices(p, quote?.rate ?? null) };
  });
  const payOnline = store.orders_enabled && store.mp_online && row.mp_status === "ok";
  const tableInfo = await tableForInfo(env, row.license_id, url);

  return json(
    {
      ok: true,
      business_name: row.business_name || snapshot.business_name || "Mi local",
      updated_at: row.updated_at,
      logo_data_url: snapshot.logo_data_url,
      whatsapp: snapshot.whatsapp,
      currency: snapshot.currency || "$",
      products,
      store: { ...store, mp_online: undefined, pay_online: payOnline },
      ...(quote ? { usd: { rate: Math.round(quote.rate * 100) / 100, updated_at: quote.updated_at } } : {}),
      ...tableInfo,
      pushed_at: snapshot.pushed_at,
    },
    200,
    origin,
  );
}

/** Carta publicada para el celular del mozo: sin fotos, con los sin stock marcados. */
export async function loadWaiterMenu(env: PortalEnv, licenseId: string) {
  const row = await env.DB.prepare(`SELECT business_name, payload FROM menu_portal_snapshots WHERE license_id = ?1`)
    .bind(licenseId)
    .first<{ business_name: string | null; payload: string }>();
  if (!row) return null;
  let snapshot: MenuPortalPayload | null = null;
  try {
    snapshot = sanitizeMenuPayload(JSON.parse(row.payload));
  } catch {
    snapshot = null;
  }
  if (!snapshot) return null;
  const listed = snapshot.products.filter((p) => p.id > 0);
  const quote = listed.some((p) => p.price_usd) ? await resolveUsdQuote(env, snapshot.usd) : null;
  return {
    business_name: row.business_name || snapshot.business_name || "Mi local",
    currency: snapshot.currency || "$",
    color: snapshot.store?.color ?? null,
    products: listed.map((p) => ({
      id: p.id,
      name: p.name,
      price: storePrices(p, quote?.rate ?? null).price,
      category: p.category,
      description: p.description ? p.description.slice(0, 200) : null,
      available: p.available !== false,
      is_daily_menu: p.is_daily_menu,
    })),
  };
}

/** Catálogo liviano para validar una comanda (id → nombre y precio publicado). */
export async function loadWaiterCatalog(
  env: PortalEnv,
  licenseId: string,
): Promise<Map<number, { name: string; price: number; available: boolean }> | null> {
  const row = await env.DB.prepare(`SELECT order_catalog FROM menu_portal_snapshots WHERE license_id = ?1`)
    .bind(licenseId)
    .first<{ order_catalog: string | null }>();
  if (!row?.order_catalog) return null;
  let catalog: OrderCatalog;
  try {
    catalog = JSON.parse(row.order_catalog) as OrderCatalog;
  } catch {
    return null;
  }
  const quote = catalog.products.some((p) => p.price_usd) ? await resolveUsdQuote(env, catalog.usd) : null;
  return new Map(
    catalog.products.map((p) => [
      p.id,
      { name: p.name, price: storePrices(p, quote?.rate ?? null).price, available: p.available },
    ]),
  );
}

const MAX_ORDER_BYTES = 8_000;
const MAX_ORDER_LINES = 40;
const MAX_LINE_QTY = 99;
const ORDER_IP_LIMIT = 5;
const ORDER_IP_WINDOW_MS = 10 * 60_000;
const ORDER_LICENSE_HOURLY_LIMIT = 60;
const MAX_PENDING_PER_LICENSE = 200;
const ORDER_RETENTION_DAYS = 45;
const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";

export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function orderCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

interface OrderLine {
  id: number;
  name: string;
  qty: number;
  price: number;
  cook: string | null;
}

/** Pedido público desde la tienda web. Los precios salen del catálogo publicado, no del navegador. */
export async function handleMenuPortalOrderCreate(req: Request, env: MpEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const ip = clientIp(req);
  if (!rateLimit(`menu-order:${ip}`, ORDER_IP_LIMIT * 4, ORDER_IP_WINDOW_MS)) {
    return err("Ya mandaste varios pedidos. Esperá unos minutos.", "rate_limited", 429, origin);
  }

  const text = await req.text();
  if (text.length > MAX_ORDER_BYTES) {
    return err("El pedido es demasiado largo.", "too_large", 413, origin);
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("bad");
    body = parsed as Record<string, unknown>;
  } catch {
    return err("Pedido inválido.", "bad_json", 400, origin);
  }

  if (typeof body.website === "string" && body.website.trim()) {
    return err("Pedido inválido.", "bad_request", 400, origin);
  }

  const slug = slugify(typeof body.slug === "string" ? body.slug : "");
  if (!slug || slug === "carta") return err("Falta el local.", "bad_request", 400, origin);

  const name = cleanText(body.name, 60);
  const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const fulfillment = body.fulfillment === "delivery" ? "delivery" : "pickup";
  const payOnline = body.pay === "mercadopago";
  const address = cleanText(body.address, 160);
  const note = cleanText(body.note, 280);
  if (name.length < 2) return err("Escribí tu nombre.", "bad_name", 400, origin);
  if (phone.length < 8 || phone.length > 15) {
    return err("Escribí un teléfono válido, con característica.", "bad_phone", 400, origin);
  }
  if (fulfillment === "delivery" && address.length < 4) {
    return err("Escribí la dirección para el envío.", "bad_address", 400, origin);
  }

  const row = await env.DB.prepare(
    `SELECT s.license_id, s.order_catalog
     FROM menu_portal_snapshots s
     JOIN licenses l ON l.id = s.license_id
     WHERE s.menu_slug = ?1 AND l.revoked = 0`,
  )
    .bind(slug)
    .first<{ license_id: string; order_catalog: string | null }>();
  if (!row || !row.order_catalog) {
    return err("Este local no recibe pedidos por acá.", "not_found", 404, origin);
  }
  let catalog: OrderCatalog;
  try {
    catalog = JSON.parse(row.order_catalog) as OrderCatalog;
  } catch {
    return err("Este local no recibe pedidos por acá.", "not_found", 404, origin);
  }
  if (!catalog.store?.orders_enabled) {
    return err("Este local no recibe pedidos por acá.", "orders_disabled", 403, origin);
  }
  if (fulfillment === "delivery" && !catalog.store.delivery) {
    return err("Este local no hace envíos. Elegí retirar.", "no_delivery", 400, origin);
  }
  if (fulfillment === "pickup" && !catalog.store.pickup) {
    return err("Este local solo hace envíos.", "no_pickup", 400, origin);
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) return err("El pedido está vacío.", "empty", 400, origin);
  if (rawItems.length > MAX_ORDER_LINES) {
    return err("El pedido tiene demasiados productos.", "too_many_lines", 400, origin);
  }
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const quote = catalog.products.some((p) => p.price_usd) ? await resolveUsdQuote(env, catalog.usd) : null;
  const lines: OrderLine[] = [];
  const missing: string[] = [];
  const noStock: string[] = [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const id = typeof r.id === "number" && Number.isInteger(r.id) ? r.id : 0;
    const qty = typeof r.qty === "number" && Number.isInteger(r.qty) ? r.qty : 0;
    if (qty < 1 || qty > MAX_LINE_QTY) {
      return err("Revisá las cantidades del pedido.", "bad_qty", 400, origin);
    }
    const p = byId.get(id);
    if (!p) {
      missing.push(cleanText(r.name, 60) || "un producto");
      continue;
    }
    if (!p.available) {
      noStock.push(p.name);
      continue;
    }
    const cook = r.cook === "Frita" || r.cook === "Al horno" ? r.cook : null;
    lines.push({ id: p.id, name: p.name, qty, price: storePrices(p, quote?.rate ?? null).price, cook });
  }
  if (noStock.length > 0) {
    return json(
      {
        ok: false,
        error: "no_stock",
        message: `Sin stock: ${noStock.slice(0, 5).join(", ")}. Sacalo del pedido.`,
        items: noStock.slice(0, 20),
      },
      409,
      origin,
    );
  }
  if (missing.length > 0 || lines.length === 0) {
    return err(
      "Algunos productos ya no están en la tienda. Recargá la página y armá el pedido de nuevo.",
      "missing_items",
      409,
      origin,
    );
  }

  const ipHash = (await sha256Hex(`walqo-order|${ip}`)).slice(0, 32);
  const now = Date.now();
  const sinceIp = new Date(now - ORDER_IP_WINDOW_MS).toISOString();
  const sinceHour = new Date(now - 60 * 60_000).toISOString();
  const counts = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM menu_portal_orders WHERE ip_hash = ?1 AND created_at >= ?2) AS by_ip,
       (SELECT COUNT(*) FROM menu_portal_orders WHERE license_id = ?3 AND created_at >= ?4) AS by_hour,
       (SELECT COUNT(*) FROM menu_portal_orders WHERE license_id = ?3 AND status = 'pending') AS pending`,
  )
    .bind(ipHash, sinceIp, row.license_id, sinceHour)
    .first<{ by_ip: number; by_hour: number; pending: number }>();
  if ((counts?.by_ip ?? 0) >= ORDER_IP_LIMIT) {
    return err("Ya mandaste varios pedidos. Esperá unos minutos.", "rate_limited", 429, origin);
  }
  if (
    (counts?.by_hour ?? 0) >= ORDER_LICENSE_HOURLY_LIMIT ||
    (counts?.pending ?? 0) >= MAX_PENDING_PER_LICENSE
  ) {
    return err(
      "El local tiene muchos pedidos ahora. Escribile por WhatsApp.",
      "busy",
      429,
      origin,
    );
  }

  const total = Math.round(lines.reduce((acc, l) => acc + l.price * l.qty, 0) * 100) / 100;
  const deliveryCost =
    fulfillment === "delivery" && catalog.store.delivery_cost ? catalog.store.delivery_cost : null;
  const id = crypto.randomUUID();
  const code = orderCode();
  const createdAt = new Date(now).toISOString();

  let pay: { preferenceId: string; initPoint: string } | null = null;
  if (payOnline) {
    const unavailable = () =>
      err(
        "Este local no está cobrando online ahora. Elegí pagar al retirar o al recibir.",
        "mp_unavailable",
        409,
        origin,
      );
    if (!catalog.store.mp_online) return unavailable();
    const cred = await loadMpCredential(env, row.license_id);
    if (!cred || cred.status !== "ok") return unavailable();
    if (total + (deliveryCost ?? 0) <= 0) return unavailable();
    const workerOrigin = new URL(req.url).origin;
    const pref = await createMpPreference(cred.token, {
      orderId: id,
      code,
      businessName: catalog.business_name,
      lines,
      deliveryCost,
      notificationUrl:
        `${workerOrigin}/v1/menu-portal/mp/webhook?source_news=webhooks` +
        `&l=${encodeURIComponent(row.license_id)}&k=${cred.webhookKey}`,
      backUrl: `https://walqo.pro/carta/?t=${encodeURIComponent(slug)}&pedido=${id}`,
    });
    if (!pref.ok) {
      if (pref.reason === "auth") {
        await markMpCredentialInvalid(env, row.license_id, "preference 401");
        return unavailable();
      }
      return err(
        "No se pudo abrir Mercado Pago. Probá de nuevo o elegí pagar al retirar.",
        "mp_error",
        502,
        origin,
      );
    }
    pay = { preferenceId: pref.preferenceId, initPoint: pref.initPoint };
  }

  await env.DB.prepare(
    `INSERT INTO menu_portal_orders
       (id, license_id, menu_slug, code, status, customer_name, customer_phone, fulfillment,
        address, note, items_json, total, delivery_cost, currency, ip_hash, created_at, updated_at,
        payment_method, payment_status, mp_preference_id, mp_init_point)
     VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15,
        ?16, ?17, ?18, ?19)`,
  )
    .bind(
      id,
      row.license_id,
      slug,
      code,
      name,
      phone,
      fulfillment,
      fulfillment === "delivery" ? address : null,
      note || null,
      JSON.stringify(lines),
      total,
      deliveryCost,
      catalog.currency || "$",
      ipHash,
      createdAt,
      pay ? "mercadopago" : "cash",
      pay ? "awaiting" : null,
      pay?.preferenceId ?? null,
      pay?.initPoint ?? null,
    )
    .run();

  return json(
    {
      ok: true,
      order: {
        id,
        code,
        total,
        delivery_cost: deliveryCost,
        fulfillment,
        items: lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price, cook: l.cook })),
      },
      ...(pay ? { pay_url: pay.initPoint } : {}),
    },
    200,
    origin,
  );
}

export async function readLicenseBody(
  req: Request,
  env: PortalEnv,
  origin: string | null,
  rate: { key: string; limit: number } = { key: "menu-orders-pc", limit: 30 },
): Promise<{ licenseId: string; body: Record<string, unknown> } | Response> {
  const ip = clientIp(req);
  if (!rateLimit(`${rate.key}:${ip}`, rate.limit, 60_000)) {
    return err("Demasiadas consultas. Esperá un momento.", "rate_limited", 429, origin);
  }
  const text = await req.text();
  if (text.length > 64_000) return err("Payload demasiado grande", "too_large", 413, origin);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("bad");
    body = parsed as Record<string, unknown>;
  } catch {
    return err("JSON inválido", "bad_json", 400, origin);
  }
  const resolved = await resolvePushLicense(
    env,
    {
      token: typeof body.token === "string" ? body.token : null,
      license_key: typeof body.license_key === "string" ? body.license_key : null,
      machine_id: typeof body.machine_id === "string" ? body.machine_id : "",
    },
    origin,
  );
  if (resolved instanceof Response) return resolved;
  return { licenseId: resolved.licenseId, body };
}

/** La PC baja los pedidos web pendientes de su licencia. */
export async function handleMenuPortalOrdersPull(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const auth = await readLicenseBody(req, env, origin);
  if (auth instanceof Response) return auth;

  const cutoff = new Date(Date.now() - ORDER_RETENTION_DAYS * 86_400_000).toISOString();
  await env.DB.prepare(`DELETE FROM menu_portal_orders WHERE license_id = ?1 AND created_at < ?2`)
    .bind(auth.licenseId, cutoff)
    .run();

  const rows = await env.DB.prepare(
    `SELECT id, code, customer_name, customer_phone, fulfillment, address, note, items_json,
            total, delivery_cost, currency, notified_at, created_at,
            payment_method, payment_status, mp_payment_id, paid_amount, paid_at
     FROM menu_portal_orders
     WHERE license_id = ?1 AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT 100`,
  )
    .bind(auth.licenseId)
    .all<{
      id: string;
      code: string;
      customer_name: string;
      customer_phone: string;
      fulfillment: string;
      address: string | null;
      note: string | null;
      items_json: string;
      total: number;
      delivery_cost: number | null;
      currency: string | null;
      notified_at: string | null;
      created_at: string;
      payment_method: string | null;
      payment_status: string | null;
      mp_payment_id: string | null;
      paid_amount: number | null;
      paid_at: string | null;
    }>();

  const orders = (rows.results ?? []).map((r) => {
    let items: OrderLine[] = [];
    try {
      items = JSON.parse(r.items_json) as OrderLine[];
    } catch {
      items = [];
    }
    return {
      id: r.id,
      code: r.code,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      fulfillment: r.fulfillment,
      address: r.address,
      note: r.note,
      items,
      total: r.total,
      delivery_cost: r.delivery_cost,
      currency: r.currency || "$",
      notified_at: r.notified_at,
      created_at: r.created_at,
      payment_method: r.payment_method === "mercadopago" ? "mercadopago" : "cash",
      payment_status: r.payment_method === "mercadopago" ? r.payment_status : null,
      mp_payment_id: r.mp_payment_id,
      paid_amount: r.paid_amount,
      paid_at: r.paid_at,
    };
  });

  const mp_status = await mpCredentialStatus(env, auth.licenseId);
  const table_requests = await pendingTableRequests(env, auth.licenseId);
  return json({ ok: true, orders, mp_status, table_requests }, 200, origin);
}

/** La PC marca pedidos como cobrados, rechazados o avisados. */
export async function handleMenuPortalOrdersUpdate(req: Request, env: MpEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const auth = await readLicenseBody(req, env, origin);
  if (auth instanceof Response) return auth;

  const updates = Array.isArray(auth.body.updates) ? auth.body.updates.slice(0, 50) : [];
  const now = new Date().toISOString();
  let applied = 0;
  const closedOnline: string[] = [];
  for (const u of updates) {
    if (!u || typeof u !== "object") continue;
    const r = u as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim().slice(0, 64) : "";
    if (!id) continue;
    if (r.status === "notified") {
      const res = await env.DB.prepare(
        `UPDATE menu_portal_orders SET notified_at = ?1, updated_at = ?1
         WHERE id = ?2 AND license_id = ?3`,
      )
        .bind(now, id, auth.licenseId)
        .run();
      applied += res.meta?.changes ?? 0;
      continue;
    }
    if (r.status === "table_received" || r.status === "table_closed") {
      applied += await applyTableUpdate(env, auth.licenseId, r.status, id, now).catch(() => 0);
      continue;
    }
    if (r.status !== "charged" && r.status !== "rejected") continue;
    const reason = r.status === "rejected" ? cleanText(r.reason, 200) || null : null;
    const res = await env.DB.prepare(
      `UPDATE menu_portal_orders SET status = ?1, reject_reason = ?2, updated_at = ?3
       WHERE id = ?4 AND license_id = ?5 AND status = 'pending'`,
    )
      .bind(r.status, reason, now, id, auth.licenseId)
      .run();
    const changed = res.meta?.changes ?? 0;
    applied += changed;
    if (changed > 0) closedOnline.push(id);
  }

  if (closedOnline.length > 0) {
    const open = await env.DB.prepare(
      `SELECT mp_preference_id FROM menu_portal_orders
       WHERE license_id = ?1 AND mp_preference_id IS NOT NULL
         AND payment_status IN ('awaiting', 'rejected')
         AND id IN (SELECT value FROM json_each(?2))`,
    )
      .bind(auth.licenseId, JSON.stringify(closedOnline))
      .all<{ mp_preference_id: string }>();
    const prefs: string[] = (open.results ?? [])
      .map((x: { mp_preference_id: string }) => x.mp_preference_id)
      .filter(Boolean);
    if (prefs.length > 0) {
      const cred = await loadMpCredential(env, auth.licenseId);
      if (cred) await Promise.all(prefs.slice(0, 10).map((p) => expireMpPreference(cred.token, p)));
    }
  }
  return json({ ok: true, applied }, 200, origin);
}

const MP_TOKEN_RE = /^[A-Za-z0-9_-]{20,300}$/;

/**
 * La PC sube (`set`) o borra (`clear`) el token de Mercado Pago del comercio.
 * Se guarda cifrado y nunca se devuelve.
 */
export async function handleMenuPortalMpCredentials(req: Request, env: MpEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const auth = await readLicenseBody(req, env, origin);
  if (auth instanceof Response) return auth;
  const { licenseId, body } = auth;

  if (body.action === "clear") {
    await env.DB.prepare(`DELETE FROM menu_portal_mp_credentials WHERE license_id = ?1`)
      .bind(licenseId)
      .run();
    return json({ ok: true, status: "none" }, 200, origin);
  }
  if (body.action !== "set") return err("Acción inválida.", "bad_request", 400, origin);

  if (!rateLimit(`menu-mp-cred:${licenseId}`, 10, 10 * 60_000)) {
    return err("Demasiados intentos. Esperá unos minutos.", "rate_limited", 429, origin);
  }
  const token = typeof body.access_token === "string" ? body.access_token.trim() : "";
  if (!MP_TOKEN_RE.test(token)) {
    return err("Falta la conexión con Mercado Pago.", "bad_token", 400, origin);
  }
  if (!(await mpTokenKeyReady(env))) {
    return err("El cobro online no está disponible ahora. Probá más tarde.", "mp_not_ready", 503, origin);
  }
  const check = await checkMpToken(token);
  if (!check) {
    return err("Mercado Pago no responde. Probá de nuevo en un rato.", "mp_down", 502, origin);
  }
  if (!check.ok) {
    await markMpCredentialInvalid(env, licenseId, "users/me 401");
    return err(
      "Mercado Pago rechazó la conexión. Volvé a conectar Mercado Pago.",
      "mp_token_invalid",
      400,
      origin,
    );
  }
  const tokenEnc = await encryptMpToken(env, licenseId, token);
  if (!tokenEnc) {
    return err("El cobro online no está disponible ahora. Probá más tarde.", "mp_not_ready", 503, origin);
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO menu_portal_mp_credentials
       (license_id, token_enc, mp_user_id, status, status_detail, webhook_key, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'ok', NULL, ?4, ?5, ?5)
     ON CONFLICT(license_id) DO UPDATE SET
       token_enc = excluded.token_enc,
       mp_user_id = excluded.mp_user_id,
       status = 'ok',
       status_detail = NULL,
       updated_at = excluded.updated_at`,
  )
    .bind(licenseId, tokenEnc, check.userId, randomHex(24), now)
    .run();
  return json({ ok: true, status: "ok" }, 200, origin);
}

/** Aviso de Mercado Pago: responde enseguida y anota el pago tras consultarlo a la API. */
export async function handleMenuPortalMpWebhook(req: Request, env: MpEnv): Promise<Response> {
  const ip = clientIp(req);
  const plain = (status: number) => new Response(null, { status });
  if (!rateLimit(`menu-mp-hook:${ip}`, 240, 60_000)) return plain(429);

  const url = new URL(req.url);
  const licenseId = (url.searchParams.get("l") || "").trim().slice(0, 64);
  const key = (url.searchParams.get("k") || "").trim().slice(0, 64);
  if (!licenseId || !/^[0-9a-f]{48}$/.test(key)) return plain(401);

  const text = await req.text();
  if (text.length > 16_000) return plain(413);
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }

  const type = url.searchParams.get("type") || url.searchParams.get("topic") || (typeof body.type === "string" ? body.type : "");
  const bodyData = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
  const dataId =
    url.searchParams.get("data.id") ||
    (type === "payment" ? url.searchParams.get("id") : null) ||
    (bodyData && bodyData.id != null ? String(bodyData.id) : "");
  if (type !== "payment" || !dataId) return plain(200);
  if (!/^\d{1,20}$/.test(dataId)) return plain(400);

  const row = await env.DB.prepare(
    `SELECT webhook_key FROM menu_portal_mp_credentials WHERE license_id = ?1`,
  )
    .bind(licenseId)
    .first<{ webhook_key: string }>();
  if (!row) return plain(200);
  if (!safeEqual(row.webhook_key, key)) return plain(401);

  const secret = (env.MP_WEBHOOK_SECRET || "").trim();
  const signature = req.headers.get("x-signature");
  if (secret && signature) {
    const valid = await verifyMpSignature(secret, signature, req.headers.get("x-request-id"), dataId);
    if (!valid) return plain(401);
  }

  const r = await syncMpPayment(env, licenseId, dataId);
  return plain(r.result === "retry" ? 502 : 200);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** La tienda consulta cómo quedó el pago al volver de Mercado Pago. */
export async function handleMenuPortalOrderStatus(req: Request, env: MpEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const ip = clientIp(req);
  if (!rateLimit(`menu-order-status:${ip}`, 30, 60_000)) {
    return err("Demasiadas consultas. Esperá un momento.", "rate_limited", 429, origin);
  }
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim().toLowerCase();
  if (!UUID_RE.test(id)) return err("Pedido inválido.", "bad_request", 400, origin);
  const paymentId = (url.searchParams.get("payment_id") || "").trim();

  const load = () =>
    env.DB.prepare(
      `SELECT license_id, code, status, total, delivery_cost, payment_method, payment_status, mp_init_point
       FROM menu_portal_orders WHERE id = ?1`,
    )
      .bind(id)
      .first<{
        license_id: string;
        code: string;
        status: string;
        total: number;
        delivery_cost: number | null;
        payment_method: string | null;
        payment_status: string | null;
        mp_init_point: string | null;
      }>();

  let order = await load();
  if (!order || order.payment_method !== "mercadopago") {
    return err("No encontramos el pedido.", "not_found", 404, origin);
  }
  if (
    /^\d{1,20}$/.test(paymentId) &&
    order.payment_status !== "approved" &&
    rateLimit(`menu-order-sync:${id}`, 6, 60_000)
  ) {
    const r = await syncMpPayment(env, order.license_id, paymentId);
    if (r.result === "applied") order = (await load()) ?? order;
  }

  const canRetry =
    order.status === "pending" &&
    (order.payment_status === "awaiting" || order.payment_status === "rejected") &&
    typeof order.mp_init_point === "string";
  const res = json(
    {
      ok: true,
      code: order.code,
      payment_status: order.payment_status,
      total: Math.round((order.total + (order.delivery_cost ?? 0)) * 100) / 100,
      ...(canRetry ? { pay_url: order.mp_init_point } : {}),
    },
    200,
    origin,
  );
  res.headers.set("cache-control", "no-store");
  return res;
}

/* ---------- Galería de fotos de la tienda ---------- */

const MAX_PHOTOS_BODY = 1_100_000;
const MAX_PHOTOS_PER_PUT = 12;
const MAX_PHOTO_B64 = 280_000;
const PHOTO_BUDGET_BYTES = 30_000_000;
const PHOTO_KEEP_UNUSED_MS = 3 * 86_400_000;
const PHOTO_DATA_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;
const PHOTO_MAGIC: Record<string, string> = {
  "image/webp": "UklGR",
  "image/jpeg": "/9j/",
  "image/png": "iVBORw0KGgo",
};

/** Deja en el snapshot solo las fotos que el servidor tiene y borra las que nadie usa hace días. */
async function reconcilePhotos(
  env: PortalEnv,
  licenseId: string,
  snapshot: MenuPortalPayload,
): Promise<void> {
  let have: Set<string>;
  try {
    const rows = await env.DB.prepare(`SELECT hash FROM menu_portal_photos WHERE license_id = ?1`)
      .bind(licenseId)
      .all<{ hash: string }>();
    have = new Set((rows.results ?? []).map((r: { hash: string }) => r.hash));
  } catch {
    for (const p of snapshot.products) delete p.photos;
    return;
  }
  const used = new Set<string>();
  for (const p of snapshot.products) {
    if (!p.photos) continue;
    const ok = p.photos.filter((h) => have.has(h));
    if (ok.length) {
      p.photos = ok;
      for (const h of ok) used.add(h);
    } else {
      delete p.photos;
    }
  }
  const now = Date.now();
  const usedJson = JSON.stringify([...used]);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE menu_portal_photos SET used_at = ?1
       WHERE license_id = ?2 AND hash IN (SELECT value FROM json_each(?3))`,
    ).bind(new Date(now).toISOString(), licenseId, usedJson),
    env.DB.prepare(
      `DELETE FROM menu_portal_photos
       WHERE license_id = ?1 AND used_at < ?2 AND hash NOT IN (SELECT value FROM json_each(?3))`,
    ).bind(licenseId, new Date(now - PHOTO_KEEP_UNUSED_MS).toISOString(), usedJson),
  ]);
}

/** La PC lista (`list`) o sube (`put`) fotos de la galería, ya comprimidas. */
export async function handleMenuPortalPhotos(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const ip = clientIp(req);
  if (!rateLimit(`menu-photos:${ip}`, 60, 60_000)) {
    return err("Demasiadas subidas. Esperá un momento.", "rate_limited", 429, origin);
  }
  const text = await req.text();
  if (text.length > MAX_PHOTOS_BODY) return err("Payload demasiado grande", "too_large", 413, origin);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("bad");
    body = parsed as Record<string, unknown>;
  } catch {
    return err("JSON inválido", "bad_json", 400, origin);
  }
  const resolved = await resolvePushLicense(
    env,
    {
      token: typeof body.token === "string" ? body.token : null,
      license_key: typeof body.license_key === "string" ? body.license_key : null,
      machine_id: typeof body.machine_id === "string" ? body.machine_id : "",
    },
    origin,
  );
  if (resolved instanceof Response) return resolved;
  const licenseId = resolved.licenseId;

  const usage = await env.DB.prepare(
    `SELECT COALESCE(SUM(bytes), 0) AS used FROM menu_portal_photos WHERE license_id = ?1`,
  )
    .bind(licenseId)
    .first<{ used: number }>();
  let used = Number(usage?.used) || 0;

  if (body.action === "list") {
    const rows = await env.DB.prepare(`SELECT hash FROM menu_portal_photos WHERE license_id = ?1`)
      .bind(licenseId)
      .all<{ hash: string }>();
    return json(
      {
        ok: true,
        hashes: (rows.results ?? []).map((r: { hash: string }) => r.hash),
        bytes_used: used,
        bytes_max: PHOTO_BUDGET_BYTES,
      },
      200,
      origin,
    );
  }
  if (body.action !== "put") return err("Acción inválida.", "bad_request", 400, origin);

  const items = Array.isArray(body.photos) ? body.photos.slice(0, MAX_PHOTOS_PER_PUT) : [];
  const saved: string[] = [];
  let full = false;
  const now = new Date().toISOString();
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const hash = typeof r.h === "string" ? r.h : "";
    const m = typeof r.data_url === "string" ? PHOTO_DATA_RE.exec(r.data_url) : null;
    if (!PHOTO_HASH_RE.test(hash) || !m) continue;
    const mime = m[1];
    const b64 = m[2];
    if (b64.length > MAX_PHOTO_B64 || !b64.startsWith(PHOTO_MAGIC[mime] ?? "#")) continue;
    const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
    if (used + bytes > PHOTO_BUDGET_BYTES) {
      full = true;
      break;
    }
    await env.DB.prepare(
      `INSERT INTO menu_portal_photos (license_id, hash, mime, data, bytes, created_at, used_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT(license_id, hash) DO UPDATE SET
         mime = excluded.mime, data = excluded.data, bytes = excluded.bytes, used_at = excluded.used_at`,
    )
      .bind(licenseId, hash, mime, b64, bytes, now)
      .run();
    used += bytes;
    saved.push(hash);
  }
  return json({ ok: true, saved, full }, 200, origin);
}

/** Foto pública de la galería. El hash cambia con la foto, así que se puede guardar en caché. */
export async function handleMenuPortalPhoto(req: Request, env: PortalEnv): Promise<Response> {
  const ip = clientIp(req);
  const plain = (status: number) =>
    new Response(null, {
      status,
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    });
  if (!rateLimit(`menu-photo:${ip}`, 600, 60_000)) return plain(429);
  const url = new URL(req.url);
  const slug = slugify(url.searchParams.get("t") || "");
  const hash = (url.searchParams.get("h") || "").trim().toLowerCase();
  if (!slug || !PHOTO_HASH_RE.test(hash)) return plain(400);

  const row = await env.DB.prepare(
    `SELECT ph.mime, ph.data
     FROM menu_portal_photos ph
     JOIN menu_portal_snapshots s ON s.license_id = ph.license_id
     WHERE s.menu_slug = ?1 AND ph.hash = ?2`,
  )
    .bind(slug, hash)
    .first<{ mime: string; data: string }>();
  if (!row) return plain(404);

  const bin = atob(row.data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Response(out, {
    status: 200,
    headers: {
      "content-type": row.mime,
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
      "x-content-type-options": "nosniff",
    },
  });
}

/* ---------- Mesas con QR ---------- */

const MAX_TABLES = 300;
const TABLE_TOKEN_RE = /^[A-Za-z0-9_-]{16}$/;
const TABLE_IP_LIMIT = 15;
const TABLE_IP_WINDOW_MS = 10 * 60_000;
const TABLE_LICENSE_HOURLY_LIMIT = 300;
const TABLE_CALL_DEDUP_MS = 2 * 60_000;
const TABLE_STATUS_WINDOW_MS = 6 * 60 * 60_000;
const TABLE_REQUEST_RETENTION_DAYS = 3;

interface PortalTable {
  number: number;
  name: string | null;
}

/** Código del QR de una mesa: HMAC con el secreto del comercio, así nadie arma el de otra mesa. */
async function tableToken(secret: string, licenseId: string, number: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`mesa:${licenseId}:${number}`)),
  );
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 16);
}

async function loadTableSetup(
  env: PortalEnv,
  licenseId: string,
): Promise<{ secret: string; tables: PortalTable[] } | null> {
  const row = await env.DB.prepare(`SELECT secret, tables_json FROM menu_portal_tables WHERE license_id = ?1`)
    .bind(licenseId)
    .first<{ secret: string; tables_json: string }>()
    .catch(() => null);
  if (!row) return null;
  try {
    const tables = JSON.parse(row.tables_json) as PortalTable[];
    return { secret: row.secret, tables: Array.isArray(tables) ? tables : [] };
  } catch {
    return { secret: row.secret, tables: [] };
  }
}

async function resolveTableAccess(
  env: PortalEnv,
  licenseId: string,
  mesaRaw: unknown,
  tokenRaw: unknown,
): Promise<PortalTable | null> {
  const number = typeof mesaRaw === "number" ? mesaRaw : Number(mesaRaw);
  if (!Number.isInteger(number) || number < 1 || number > 9999) return null;
  if (typeof tokenRaw !== "string" || !TABLE_TOKEN_RE.test(tokenRaw)) return null;
  const setup = await loadTableSetup(env, licenseId);
  const table = setup?.tables.find((t) => t.number === number);
  if (!setup || !table) return null;
  const expected = await tableToken(setup.secret, licenseId, number);
  return safeEqual(expected, tokenRaw) ? table : null;
}

/** La PC sube las mesas del salón y recibe el código de cada QR. `rotate` invalida los QR impresos. */
export async function handleMenuPortalTablesSync(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const auth = await readLicenseBody(req, env, origin);
  if (auth instanceof Response) return auth;
  const { licenseId, body } = auth;

  const raw = Array.isArray(body.tables) ? body.tables.slice(0, MAX_TABLES) : [];
  const seen = new Set<number>();
  const tables: PortalTable[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const r = t as Record<string, unknown>;
    const number = typeof r.number === "number" ? r.number : NaN;
    if (!Number.isInteger(number) || number < 1 || number > 9999 || seen.has(number)) continue;
    seen.add(number);
    tables.push({ number, name: cleanText(r.name, 40) || null });
  }

  const current = await loadTableSetup(env, licenseId);
  const secret = !current || body.rotate === true ? randomHex(32) : current.secret;
  await env.DB.prepare(
    `INSERT INTO menu_portal_tables (license_id, secret, tables_json, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(license_id) DO UPDATE SET
       secret = excluded.secret, tables_json = excluded.tables_json, updated_at = excluded.updated_at`,
  )
    .bind(licenseId, secret, JSON.stringify(tables), new Date().toISOString())
    .run();

  const slugRow = await env.DB.prepare(`SELECT menu_slug FROM menu_portal_snapshots WHERE license_id = ?1`)
    .bind(licenseId)
    .first<{ menu_slug: string }>();
  const links = await Promise.all(
    tables.map(async (t) => ({ number: t.number, token: await tableToken(secret, licenseId, t.number) })),
  );
  return json({ ok: true, tables: links, menu_slug: slugRow?.menu_slug ?? null }, 200, origin);
}

/** Datos de la mesa para la carta (`/info?mesa=&k=`). */
async function tableForInfo(
  env: PortalEnv,
  licenseId: string,
  url: URL,
): Promise<{ table?: PortalTable | null }> {
  const mesa = url.searchParams.get("mesa");
  const k = url.searchParams.get("k");
  if (!mesa || !k) return {};
  return { table: await resolveTableAccess(env, licenseId, mesa, k) };
}

async function tableLicense(
  env: PortalEnv,
  slugRaw: unknown,
): Promise<{ license_id: string; order_catalog: string | null } | null> {
  const slug = slugify(typeof slugRaw === "string" ? slugRaw : "");
  if (!slug || slug === "carta") return null;
  return env.DB.prepare(
    `SELECT s.license_id, s.order_catalog
     FROM menu_portal_snapshots s
     JOIN licenses l ON l.id = s.license_id
     WHERE s.menu_slug = ?1 AND l.revoked = 0`,
  )
    .bind(slug)
    .first<{ license_id: string; order_catalog: string | null }>();
}

const INVALID_TABLE_MESSAGE = "Este QR ya no es válido. Pedile al mozo.";

/** Pedido, llamado al mozo o pedido de cuenta desde el QR de una mesa. No se cobra online. */
export async function handleMenuPortalTableRequest(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const ip = clientIp(req);
  if (!rateLimit(`menu-table:${ip}`, TABLE_IP_LIMIT * 2, TABLE_IP_WINDOW_MS)) {
    return err("Mandaste muchos avisos. Esperá unos minutos o llamá al mozo.", "rate_limited", 429, origin);
  }
  const text = await req.text();
  if (text.length > MAX_ORDER_BYTES) return err("El pedido es demasiado largo.", "too_large", 413, origin);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("bad");
    body = parsed as Record<string, unknown>;
  } catch {
    return err("Pedido inválido.", "bad_json", 400, origin);
  }
  if (typeof body.website === "string" && body.website.trim()) {
    return err("Pedido inválido.", "bad_request", 400, origin);
  }
  const kind = body.kind === "waiter" || body.kind === "bill" || body.kind === "order" ? body.kind : null;
  if (!kind) return err("Pedido inválido.", "bad_request", 400, origin);

  const row = await tableLicense(env, body.slug);
  if (!row) return err("No encontramos el local.", "not_found", 404, origin);
  const table = await resolveTableAccess(env, row.license_id, body.mesa, body.k);
  if (!table) return err(INVALID_TABLE_MESSAGE, "bad_table", 403, origin);

  const ipHash = (await sha256Hex(`walqo-table|${ip}`)).slice(0, 32);
  const now = Date.now();
  const counts = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM menu_portal_table_requests WHERE ip_hash = ?1 AND created_at >= ?2) AS by_ip,
       (SELECT COUNT(*) FROM menu_portal_table_requests WHERE license_id = ?3 AND created_at >= ?4) AS by_hour`,
  )
    .bind(
      ipHash,
      new Date(now - TABLE_IP_WINDOW_MS).toISOString(),
      row.license_id,
      new Date(now - 60 * 60_000).toISOString(),
    )
    .first<{ by_ip: number; by_hour: number }>();
  if ((counts?.by_ip ?? 0) >= TABLE_IP_LIMIT) {
    return err("Mandaste muchos avisos. Esperá unos minutos o llamá al mozo.", "rate_limited", 429, origin);
  }
  if ((counts?.by_hour ?? 0) >= TABLE_LICENSE_HOURLY_LIMIT) {
    return err("El local tiene muchos pedidos ahora. Llamá al mozo.", "busy", 429, origin);
  }

  const createdAt = new Date(now).toISOString();
  const id = crypto.randomUUID();

  if (kind !== "order") {
    const recent = await env.DB.prepare(
      `SELECT id FROM menu_portal_table_requests
       WHERE license_id = ?1 AND table_number = ?2 AND kind = ?3 AND status = 'pending' AND created_at >= ?4
       LIMIT 1`,
    )
      .bind(row.license_id, table.number, kind, new Date(now - TABLE_CALL_DEDUP_MS).toISOString())
      .first<{ id: string }>();
    if (!recent) {
      await env.DB.prepare(
        `INSERT INTO menu_portal_table_requests
           (id, license_id, table_number, kind, status, ip_hash, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?6)`,
      )
        .bind(id, row.license_id, table.number, kind, ipHash, createdAt)
        .run();
    }
    return json({ ok: true, request: { id: recent?.id ?? id, kind } }, 200, origin);
  }

  let catalog: OrderCatalog;
  try {
    catalog = JSON.parse(row.order_catalog || "") as OrderCatalog;
  } catch {
    return err("La carta no está publicada. Llamá al mozo.", "not_found", 404, origin);
  }
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) return err("El pedido está vacío.", "empty", 400, origin);
  if (rawItems.length > MAX_ORDER_LINES) {
    return err("El pedido tiene demasiados productos.", "too_many_lines", 400, origin);
  }
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const quote = catalog.products.some((p) => p.price_usd) ? await resolveUsdQuote(env, catalog.usd) : null;
  const lines: OrderLine[] = [];
  const noStock: string[] = [];
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const pid = typeof r.id === "number" && Number.isInteger(r.id) ? r.id : 0;
    const qty = typeof r.qty === "number" && Number.isInteger(r.qty) ? r.qty : 0;
    if (qty < 1 || qty > MAX_LINE_QTY) return err("Revisá las cantidades del pedido.", "bad_qty", 400, origin);
    const p = byId.get(pid);
    if (!p) {
      return err(
        "Algunos productos ya no están en la carta. Recargá la página y armá el pedido de nuevo.",
        "missing_items",
        409,
        origin,
      );
    }
    if (!p.available) {
      noStock.push(p.name);
      continue;
    }
    const cook = r.cook === "Frita" || r.cook === "Al horno" ? r.cook : null;
    lines.push({ id: p.id, name: p.name, qty, price: storePrices(p, quote?.rate ?? null).price, cook });
  }
  if (noStock.length > 0) {
    return json(
      {
        ok: false,
        error: "no_stock",
        message: `Sin stock: ${noStock.slice(0, 5).join(", ")}. Sacalo del pedido.`,
        items: noStock.slice(0, 20),
      },
      409,
      origin,
    );
  }
  if (lines.length === 0) return err("El pedido está vacío.", "empty", 400, origin);
  const total = Math.round(lines.reduce((acc, l) => acc + l.price * l.qty, 0) * 100) / 100;
  const note = cleanText(body.note, 200);
  const name = cleanText(body.name, 40);

  await env.DB.prepare(
    `INSERT INTO menu_portal_table_requests
       (id, license_id, table_number, kind, status, items_json, total, note, customer_name, ip_hash,
        created_at, updated_at)
     VALUES (?1, ?2, ?3, 'order', 'pending', ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
  )
    .bind(id, row.license_id, table.number, JSON.stringify(lines), total, note || null, name || null, ipHash, createdAt)
    .run();

  return json(
    {
      ok: true,
      request: {
        id,
        kind,
        total,
        items: lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price, cook: l.cook })),
      },
    },
    200,
    origin,
  );
}

/** «Mi mesa»: lo que se pidió desde el QR desde que se abrió la mesa (hasta 6 h). */
export async function handleMenuPortalTableStatus(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const ip = clientIp(req);
  if (!rateLimit(`menu-info:${ip}`, INFO_RATE, INFO_WINDOW_MS)) {
    return err("Demasiados intentos. Esperá un minuto.", "rate_limited", 429, origin);
  }
  const url = new URL(req.url);
  const row = await tableLicense(env, url.searchParams.get("slug") || url.searchParams.get("t"));
  if (!row) return err("No encontramos el local.", "not_found", 404, origin);
  const table = await resolveTableAccess(env, row.license_id, url.searchParams.get("mesa"), url.searchParams.get("k"));
  if (!table) return err(INVALID_TABLE_MESSAGE, "bad_table", 403, origin);

  const rows = await env.DB.prepare(
    `SELECT id, kind, status, items_json, total, created_at
     FROM menu_portal_table_requests
     WHERE license_id = ?1 AND table_number = ?2 AND status IN ('pending', 'received') AND created_at >= ?3
     ORDER BY created_at ASC
     LIMIT 60`,
  )
    .bind(row.license_id, table.number, new Date(Date.now() - TABLE_STATUS_WINDOW_MS).toISOString())
    .all<{ id: string; kind: string; status: string; items_json: string | null; total: number | null; created_at: string }>();

  const orders: { id: string; status: string; total: number; items: OrderLine[]; created_at: string }[] = [];
  const calls: { kind: string; status: string; created_at: string }[] = [];
  for (const r of rows.results ?? []) {
    if (r.kind === "order") {
      let items: OrderLine[] = [];
      try {
        items = JSON.parse(r.items_json || "[]") as OrderLine[];
      } catch {
        items = [];
      }
      orders.push({ id: r.id, status: r.status, total: r.total ?? 0, items, created_at: r.created_at });
    } else {
      calls.push({ kind: r.kind, status: r.status, created_at: r.created_at });
    }
  }
  return json({ ok: true, table, orders, calls }, 200, origin);
}

/** Lo que la PC todavía no bajó de los QR de las mesas. */
async function pendingTableRequests(env: PortalEnv, licenseId: string) {
  try {
    const cutoff = new Date(Date.now() - TABLE_REQUEST_RETENTION_DAYS * 86_400_000).toISOString();
    await env.DB.prepare(`DELETE FROM menu_portal_table_requests WHERE license_id = ?1 AND created_at < ?2`)
      .bind(licenseId, cutoff)
      .run();
    const rows = await env.DB.prepare(
      `SELECT id, table_number, kind, items_json, note, customer_name, created_at
       FROM menu_portal_table_requests
       WHERE license_id = ?1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 100`,
    )
      .bind(licenseId)
      .all<{
        id: string;
        table_number: number;
        kind: string;
        items_json: string | null;
        note: string | null;
        customer_name: string | null;
        created_at: string;
      }>();
    return (rows.results ?? []).map((r) => {
      let items: OrderLine[] | undefined;
      if (r.kind === "order") {
        try {
          items = JSON.parse(r.items_json || "[]") as OrderLine[];
        } catch {
          items = [];
        }
      }
      return {
        id: r.id,
        table_number: r.table_number,
        kind: r.kind,
        ...(items ? { items } : {}),
        note: r.note,
        customer_name: r.customer_name,
        created_at: r.created_at,
      };
    });
  } catch {
    return [];
  }
}

async function applyTableUpdate(
  env: PortalEnv,
  licenseId: string,
  status: "table_received" | "table_closed",
  id: string,
  now: string,
): Promise<number> {
  if (status === "table_received") {
    const res = await env.DB.prepare(
      `UPDATE menu_portal_table_requests SET status = 'received', updated_at = ?1
       WHERE id = ?2 AND license_id = ?3 AND status = 'pending'`,
    )
      .bind(now, id, licenseId)
      .run();
    return res.meta?.changes ?? 0;
  }
  const number = Number(id);
  if (!Number.isInteger(number) || number < 1) return 0;
  const res = await env.DB.prepare(
    `UPDATE menu_portal_table_requests SET status = 'closed', updated_at = ?1
     WHERE license_id = ?2 AND table_number = ?3 AND status IN ('pending', 'received') AND created_at <= ?1`,
  )
    .bind(now, licenseId, number)
    .run();
  return res.meta?.changes ?? 0;
}
