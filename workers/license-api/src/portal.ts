/** Panel web del dueño: sesión + push de snapshot + dashboard solo lectura. */

import {
  mintPortalServiceToken,
  verifyPortalServiceToken,
} from "./portalServiceAuth";
import {
  buildPortalIaPayload,
  validatePortalIaPayload,
  PORTAL_IA_PAYLOAD_VERSION,
} from "./portalIaPayload";

type D1Database = any;

export interface PortalEnv {
  DB: D1Database;
  LICENSE_ADMIN_SECRET: string;
  LICENSE_PUBLIC_KEY_HEX: string;
  /** Secreto HMAC para PBS1 (license-api → bi-ia). Distinto de LICENSE_ADMIN_SECRET. */
  PORTAL_BI_SERVICE_SECRET?: string;
  /** Base URL de gestion-bi-ia (sin slash final). Fallback si no hay service binding. */
  PORTAL_BI_IA_URL?: string;
  /** Service binding a gestion-bi-ia (preferido). */
  BI_IA?: { fetch: typeof fetch };
  /**
   * Fetch inyectable (tests). En producción usa global fetch.
   * NO exponer al browser.
   */
  portalBiIaFetch?: typeof fetch;
}

const SESSION_TTL_SECS = 60 * 60 * 24 * 14; // 14 días
const TOKEN_PREFIX = "WP1";
const MAX_PUSH_BYTES = 160_000;
const MAX_RECENT_SALES = 20;
const MAX_LOW_STOCK = 30;
const MAX_REGISTERS = 20;
const MAX_EMPLOYEES = 12;
const MAX_WEEK_DAYS = 7;
const MAX_MONTH_DAYS = 31;
const MAX_SERIES_30 = 30;
const MAX_TOP_PRODUCTS = 8;
const MAX_PAYMENTS = 12;
/** F4C — máximo de alertas BI en snapshot (transporte; no evalúa reglas). */
export const PORTAL_MAX_ALERTS = 20;
const MAX_ALERTS = PORTAL_MAX_ALERTS;
export const PORTAL_MAX_PUSH_BYTES = MAX_PUSH_BYTES;

const PORTAL_ALERT_SEVERITIES = new Set(["critical", "warning", "info"]);
const PORTAL_ALERT_TYPES = new Set([
  "stock_critical",
  "stock_low_coverage",
  "sales_drop",
]);
const PORTAL_ALERT_METRICS = new Set([
  "stock",
  "estimated_days_cover",
  "revenue_change_pct",
]);
const PERIOD_KEYS = ["today", "7d", "30d", "mtd"] as const;

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

/** Emite WP1 (tests / login). */
export async function mintSession(
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

export async function verifySession(
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
export async function verifyLicenseDeviceToken(
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
  sales_yesterday_total?: number;
  sales_yesterday_count?: number;
  products_total?: number;
  low_stock_count?: number;
  stock_summary?: {
    products_total?: number;
    critical_count?: number;
    low_count?: number;
  };
  recent_sales?: Array<{
    at?: string;
    total?: number;
    device?: string;
    payment_method?: string;
    seller?: string;
  }>;
  sales_by_register?: Array<{
    device_code?: string;
    device_name?: string | null;
    count?: number;
    total?: number;
  }>;
  sales_by_employee?: Array<{
    name?: string;
    count?: number;
    total?: number;
  }>;
  sales_last_7_days?: Array<{
    day?: string;
    count?: number;
    total?: number;
  }>;
  sales_last_30_days?: Array<{
    day?: string;
    count?: number;
    total?: number;
  }>;
  sales_month_to_date?: Array<{
    day?: string;
    count?: number;
    total?: number;
  }>;
  period_compare_7d?: {
    current_total?: number;
    current_count?: number;
    previous_total?: number;
    previous_count?: number;
  };
  period_compare_30d?: {
    current_total?: number;
    current_count?: number;
    previous_total?: number;
    previous_count?: number;
  };
  top_products_today?: Array<{
    name?: string;
    qty?: number;
  }>;
  /** F3 */
  sales_by_payment?: {
    today?: Array<{ method?: string; count?: number; total?: number }>;
    "7d"?: Array<{ method?: string; count?: number; total?: number }>;
    "30d"?: Array<{ method?: string; count?: number; total?: number }>;
    mtd?: Array<{ method?: string; count?: number; total?: number }>;
  };
  top_products?: {
    today?: Array<{ name?: string; qty?: number; total?: number }>;
    "7d"?: Array<{ name?: string; qty?: number; total?: number }>;
    "30d"?: Array<{ name?: string; qty?: number; total?: number }>;
    mtd?: Array<{ name?: string; qty?: number; total?: number }>;
  };
  sales_by_register_by_period?: {
    today?: Array<{
      device_code?: string;
      device_name?: string | null;
      name?: string;
      count?: number;
      total?: number;
    }>;
    "7d"?: Array<{
      device_code?: string;
      device_name?: string | null;
      name?: string;
      count?: number;
      total?: number;
    }>;
    "30d"?: Array<{
      device_code?: string;
      device_name?: string | null;
      name?: string;
      count?: number;
      total?: number;
    }>;
    mtd?: Array<{
      device_code?: string;
      device_name?: string | null;
      name?: string;
      count?: number;
      total?: number;
    }>;
  };
  sales_by_employee_by_period?: {
    today?: Array<{ name?: string; count?: number; total?: number }>;
    "7d"?: Array<{ name?: string; count?: number; total?: number }>;
    "30d"?: Array<{ name?: string; count?: number; total?: number }>;
    mtd?: Array<{ name?: string; count?: number; total?: number }>;
  };
  low_stock?: Array<{
    name?: string;
    stock?: number;
    min_stock?: number;
    estimated_days_cover?: number | null;
  }>;
  /** F4C — proyección BI ya evaluada en desktop (solo lectura). */
  alerts?: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    metric: string;
    value: number;
    threshold: number;
  }>;
  alerts_summary?: {
    critical_count: number;
    warning_count: number;
    info_count: number;
  };
  pushed_at?: string;
  device_name?: string;
}

function sanitizeDaySeries(
  raw: unknown,
  max: number,
): Array<{ day: string; count: number; total: number }> {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown, floor = false) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return 0;
    return floor ? Math.max(0, Math.floor(v)) : v;
  };
  return raw.slice(0, max).map((d) => {
    const row = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
    return {
      day: typeof row.day === "string" ? row.day.slice(0, 16) : "",
      count: num(row.count, true),
      total: num(row.total),
    };
  });
}

function sanitizePeriodCompare(raw: unknown): {
  current_total: number;
  current_count: number;
  previous_total: number;
  previous_count: number;
} {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, floor = false) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return 0;
    return floor ? Math.max(0, Math.floor(v)) : v;
  };
  return {
    current_total: num(row.current_total),
    current_count: num(row.current_count, true),
    previous_total: num(row.previous_total),
    previous_count: num(row.previous_count, true),
  };
}

function numField(v: unknown, floor = false): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return floor ? Math.max(0, Math.floor(v)) : v;
}

function sanitizePaymentPeriodMap(raw: unknown): NonNullable<PortalSnapshotPayload["sales_by_payment"]> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: NonNullable<PortalSnapshotPayload["sales_by_payment"]> = {};
  for (const key of PERIOD_KEYS) {
    const arr = Array.isArray(src[key]) ? src[key] : [];
    out[key] = arr.slice(0, MAX_PAYMENTS).map((r) => {
      const row = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const methodRaw =
        typeof row.method === "string"
          ? row.method
          : typeof row.payment_method === "string"
            ? row.payment_method
            : "—";
      return {
        method: methodRaw.slice(0, 64),
        count: numField(row.count, true),
        total: numField(row.total),
      };
    });
  }
  return out;
}

function sanitizeTopProductsPeriodMap(raw: unknown): NonNullable<PortalSnapshotPayload["top_products"]> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: NonNullable<PortalSnapshotPayload["top_products"]> = {};
  for (const key of PERIOD_KEYS) {
    const arr = Array.isArray(src[key]) ? src[key] : [];
    out[key] = arr.slice(0, MAX_TOP_PRODUCTS).map((r) => {
      const row = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return {
        name: typeof row.name === "string" ? row.name.slice(0, 120) : "?",
        qty: numField(row.qty),
        total: numField(row.total),
      };
    });
  }
  return out;
}

function sanitizeRegisterPeriodMap(
  raw: unknown,
): NonNullable<PortalSnapshotPayload["sales_by_register_by_period"]> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: NonNullable<PortalSnapshotPayload["sales_by_register_by_period"]> = {};
  for (const key of PERIOD_KEYS) {
    const arr = Array.isArray(src[key]) ? src[key] : [];
    out[key] = arr.slice(0, MAX_REGISTERS).map((r) => {
      const row = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const device_code =
        typeof row.device_code === "string" ? row.device_code.slice(0, 16) : "—";
      const device_name =
        typeof row.device_name === "string" ? row.device_name.slice(0, 64) : null;
      const name =
        typeof row.name === "string" && row.name.trim()
          ? row.name.slice(0, 64)
          : device_name || (device_code !== "—" ? device_code : "Caja");
      return {
        device_code,
        device_name,
        name,
        count: numField(row.count, true),
        total: numField(row.total),
      };
    });
  }
  return out;
}

function sanitizeEmployeePeriodMap(
  raw: unknown,
): NonNullable<PortalSnapshotPayload["sales_by_employee_by_period"]> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: NonNullable<PortalSnapshotPayload["sales_by_employee_by_period"]> = {};
  for (const key of PERIOD_KEYS) {
    const arr = Array.isArray(src[key]) ? src[key] : [];
    out[key] = arr.slice(0, MAX_EMPLOYEES).map((r) => {
      const row = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return {
        name: typeof row.name === "string" ? row.name.slice(0, 64) : "Sin asignar",
        count: numField(row.count, true),
        total: numField(row.total),
      };
    });
  }
  return out;
}

function sanitizeAlertText(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const cleaned = s
    .replace(/\/(?:productos|reportes|clientes|presupuestos|stock|caja|admin)(?:\/\d+)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return cleaned.length > 0 ? cleaned : null;
}

function finiteNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

/**
 * Sanitiza alertas públicas del portal. No evalúa reglas BI.
 * Ítems inválidos se descartan; ausente → null (compat F2/F3).
 */
export function sanitizePortalAlerts(
  raw: unknown,
  max = MAX_ALERTS,
): NonNullable<PortalSnapshotPayload["alerts"]> | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return null;

  const out: NonNullable<PortalSnapshotPayload["alerts"]> = [];
  const limit = Math.max(0, Math.floor(max));

  for (const item of raw) {
    if (out.length >= limit) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const id = typeof row.id === "string" ? row.id.trim().slice(0, 80) : "";
    if (!id) continue;

    const type = typeof row.type === "string" ? row.type.trim() : "";
    if (!PORTAL_ALERT_TYPES.has(type)) continue;

    const severity = typeof row.severity === "string" ? row.severity.trim() : "";
    if (!PORTAL_ALERT_SEVERITIES.has(severity)) continue;

    const title = sanitizeAlertText(row.title, 120);
    const message = sanitizeAlertText(row.message, 240);
    if (!title || !message) continue;

    const metric = typeof row.metric === "string" ? row.metric.trim() : "";
    if (!PORTAL_ALERT_METRICS.has(metric)) continue;

    const value = finiteNumber(row.value);
    const threshold = finiteNumber(row.threshold);
    if (value === null || threshold === null) continue;

    // Solo esquema público — no copiar link, entity_id, machine_id, etc.
    out.push({
      id,
      type,
      severity,
      title,
      message,
      metric,
      value,
      threshold,
    });
  }

  return out;
}

export function summarizePortalAlerts(
  alerts: NonNullable<PortalSnapshotPayload["alerts"]>,
): NonNullable<PortalSnapshotPayload["alerts_summary"]> {
  let critical_count = 0;
  let warning_count = 0;
  let info_count = 0;
  for (const a of alerts) {
    if (a.severity === "critical") critical_count += 1;
    else if (a.severity === "warning") warning_count += 1;
    else info_count += 1;
  }
  return { critical_count, warning_count, info_count };
}

/**
 * Valida forma de alerts_summary del cliente y la acota a [0, maxAlerts].
 * Persistido: summarizePortalAlerts sobre la lista ya sanitizada.
 */
export function sanitizePortalAlertsSummary(
  raw: unknown,
  maxAlerts = MAX_ALERTS,
): NonNullable<PortalSnapshotPayload["alerts_summary"]> | null {
  if (raw === undefined || raw === null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const clamp = (v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    const n = Math.floor(v);
    if (n < 0) return null;
    if (Math.abs(v - n) > 1e-9) return null;
    return Math.min(n, maxAlerts);
  };
  const critical_count = clamp(o.critical_count);
  const warning_count = clamp(o.warning_count);
  const info_count = clamp(o.info_count);
  if (critical_count === null || warning_count === null || info_count === null) return null;
  return { critical_count, warning_count, info_count };
}

export function sanitizePayload(raw: unknown): PortalSnapshotPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const recent = Array.isArray(o.recent_sales) ? o.recent_sales : [];
  const registers = Array.isArray(o.sales_by_register) ? o.sales_by_register : [];
  const employees = Array.isArray(o.sales_by_employee) ? o.sales_by_employee : [];
  const top = Array.isArray(o.top_products_today) ? o.top_products_today : [];
  const low = Array.isArray(o.low_stock) ? o.low_stock : [];
  const stockRaw =
    o.stock_summary && typeof o.stock_summary === "object"
      ? (o.stock_summary as Record<string, unknown>)
      : null;

  const num = (v: unknown, floor = false) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return 0;
    return floor ? Math.max(0, Math.floor(v)) : v;
  };

  const hasPaymentMap = o.sales_by_payment != null && typeof o.sales_by_payment === "object";
  const hasTopMap = o.top_products != null && typeof o.top_products === "object";
  const hasRegMap =
    o.sales_by_register_by_period != null && typeof o.sales_by_register_by_period === "object";
  const hasEmpMap =
    o.sales_by_employee_by_period != null && typeof o.sales_by_employee_by_period === "object";

  const hasAlertsKey = Object.prototype.hasOwnProperty.call(o, "alerts");
  const sanitizedAlerts = hasAlertsKey ? sanitizePortalAlerts(o.alerts, MAX_ALERTS) : null;
  const alertsBlock =
    sanitizedAlerts != null
      ? {
          alerts: sanitizedAlerts,
          alerts_summary: summarizePortalAlerts(sanitizedAlerts),
        }
      : {};

  return {
    business_name:
      typeof o.business_name === "string" ? o.business_name.slice(0, 120) : undefined,
    sales_today_total: num(o.sales_today_total),
    sales_today_count: num(o.sales_today_count, true),
    sales_yesterday_total: num(o.sales_yesterday_total),
    sales_yesterday_count: num(o.sales_yesterday_count, true),
    products_total: num(o.products_total, true),
    low_stock_count: num(o.low_stock_count, true),
    stock_summary: {
      products_total: num(stockRaw?.products_total ?? o.products_total, true),
      critical_count: num(stockRaw?.critical_count, true),
      low_count: num(stockRaw?.low_count, true),
    },
    recent_sales: recent.slice(0, MAX_RECENT_SALES).map((s) => {
      const row = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      return {
        at: typeof row.at === "string" ? row.at.slice(0, 40) : "",
        total: num(row.total),
        device: typeof row.device === "string" ? row.device.slice(0, 64) : "",
        payment_method:
          typeof row.payment_method === "string" ? row.payment_method.slice(0, 32) : undefined,
        seller: typeof row.seller === "string" ? row.seller.slice(0, 64) : undefined,
      };
    }),
    sales_by_register: registers.slice(0, MAX_REGISTERS).map((r) => {
      const row = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return {
        device_code:
          typeof row.device_code === "string" ? row.device_code.slice(0, 16) : "—",
        device_name:
          typeof row.device_name === "string" ? row.device_name.slice(0, 64) : null,
        count: num(row.count, true),
        total: num(row.total),
      };
    }),
    sales_by_employee: employees.slice(0, MAX_EMPLOYEES).map((e) => {
      const row = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      return {
        name: typeof row.name === "string" ? row.name.slice(0, 64) : "Sin asignar",
        count: num(row.count, true),
        total: num(row.total),
      };
    }),
    sales_last_7_days: sanitizeDaySeries(o.sales_last_7_days, MAX_WEEK_DAYS),
    sales_last_30_days: sanitizeDaySeries(o.sales_last_30_days, MAX_SERIES_30),
    sales_month_to_date: sanitizeDaySeries(o.sales_month_to_date, MAX_MONTH_DAYS),
    period_compare_7d: sanitizePeriodCompare(o.period_compare_7d),
    period_compare_30d: sanitizePeriodCompare(o.period_compare_30d),
    top_products_today: top.slice(0, MAX_TOP_PRODUCTS).map((p) => {
      const row = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      return {
        name: typeof row.name === "string" ? row.name.slice(0, 120) : "?",
        qty: num(row.qty),
      };
    }),
    ...(hasPaymentMap ? { sales_by_payment: sanitizePaymentPeriodMap(o.sales_by_payment) } : {}),
    ...(hasTopMap ? { top_products: sanitizeTopProductsPeriodMap(o.top_products) } : {}),
    ...(hasRegMap
      ? { sales_by_register_by_period: sanitizeRegisterPeriodMap(o.sales_by_register_by_period) }
      : {}),
    ...(hasEmpMap
      ? { sales_by_employee_by_period: sanitizeEmployeePeriodMap(o.sales_by_employee_by_period) }
      : {}),
    low_stock: low.slice(0, MAX_LOW_STOCK).map((p) => {
      const row = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      const cover =
        typeof row.estimated_days_cover === "number" && Number.isFinite(row.estimated_days_cover)
          ? Math.max(0, row.estimated_days_cover)
          : null;
      return {
        name: typeof row.name === "string" ? row.name.slice(0, 120) : "?",
        stock: num(row.stock),
        min_stock: num(row.min_stock),
        estimated_days_cover: cover,
      };
    }),
    ...alertsBlock,
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
    const parsed = JSON.parse(row.payload) as unknown;
    // Re-sanitizar en lectura (defensa en profundidad; no evalúa BI).
    snapshot = sanitizePayload(parsed) ?? {};
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
      sales_yesterday_total: snapshot.sales_yesterday_total ?? 0,
      sales_yesterday_count: snapshot.sales_yesterday_count ?? 0,
      products_total: snapshot.products_total ?? snapshot.stock_summary?.products_total ?? 0,
      low_stock_count: snapshot.low_stock_count ?? 0,
      stock_summary: snapshot.stock_summary ?? {
        products_total: snapshot.products_total ?? 0,
        critical_count: 0,
        low_count: 0,
      },
      sales_by_register: snapshot.sales_by_register ?? [],
      sales_by_employee: snapshot.sales_by_employee ?? [],
      sales_last_7_days: snapshot.sales_last_7_days ?? [],
      sales_last_30_days: snapshot.sales_last_30_days ?? [],
      sales_month_to_date: snapshot.sales_month_to_date ?? [],
      period_compare_7d: snapshot.period_compare_7d ?? null,
      period_compare_30d: snapshot.period_compare_30d ?? null,
      top_products_today: snapshot.top_products_today ?? [],
      sales_by_payment: snapshot.sales_by_payment ?? null,
      top_products: snapshot.top_products ?? null,
      sales_by_register_by_period: snapshot.sales_by_register_by_period ?? null,
      sales_by_employee_by_period: snapshot.sales_by_employee_by_period ?? null,
      recent_sales: snapshot.recent_sales ?? [],
      low_stock: snapshot.low_stock ?? [],
      alerts: snapshot.alerts ?? null,
      alerts_summary: snapshot.alerts_summary ?? null,
      pushed_at: snapshot.pushed_at ?? row.updated_at,
    },
    200,
    origin,
  );
}

const INTERPRET_PERIODS = new Set(["today", "7d", "30d", "mtd"]);

/**
 * Hints UI no sensibles. Ignora metrics/alerts/license_id/etc. del browser.
 */
export function parsePortalInterpretHints(raw: unknown): {
  period: "today" | "7d" | "30d" | "mtd" | null;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { period: null };
  }
  const o = raw as Record<string, unknown>;
  const period =
    typeof o.period === "string" && INTERPRET_PERIODS.has(o.period)
      ? (o.period as "today" | "7d" | "30d" | "mtd")
      : null;
  return { period };
}

const DEFAULT_BI_IA_URL = "https://gestion-bi-ia.walphur.workers.dev";
const PORTAL_IA_BRIDGE_TIMEOUT_MS = 28_000;

/** Cache corta in-memory: key = aid + period + payloadHash (sin contaminación cross-tenant). */
const portalIaCache = new Map<
  string,
  { expiresAt: number; body: Record<string, unknown> }
>();
const PORTAL_IA_CACHE_TTL_MS = 90_000;

/** Límites portal provisionales (espejo bi-ia; bucket separado desktop). */
const PORTAL_IA_PLAN_LIMITS: Record<string, number> = {
  trial: 8,
  free: 8,
  basic: 20,
  pro: 40,
};

export function resetPortalIaCacheForTests(): void {
  portalIaCache.clear();
  rateBuckets.clear();
}

async function resolveLicensePlan(env: PortalEnv, lid: string): Promise<string> {
  try {
    const row = (await env.DB.prepare("SELECT plan FROM licenses WHERE id = ?1")
      .bind(lid)
      .first()) as { plan?: string } | null;
    const plan = String(row?.plan ?? "basic").toLowerCase();
    if (plan === "pro" || plan === "basic" || plan === "free" || plan === "trial") return plan;
  } catch {
    /* ignore */
  }
  return "basic";
}

function portalIaCacheKey(aid: string, period: string, payloadHash: string): string {
  return `${aid}:${period}:${payloadHash}`;
}

/**
 * F4E-3: WP1 → snapshot → portal-1 → PBS1 → gestion-bi-ia → respuesta validada.
 * El browser solo puede elegir `period`. Métricas/tenant del body se ignoran.
 */
export async function handlePortalInterpret(
  req: Request,
  env: PortalEnv,
): Promise<Response> {
  const origin = req.headers.get("origin");
  const token = bearerToken(req);
  if (!token) return err("Sesión requerida", "unauthorized", 401, origin);
  const session = await verifySession(env, token);
  if (!session) return err("Sesión inválida o vencida", "unauthorized", 401, origin);

  let bodyRaw: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) bodyRaw = JSON.parse(text);
  } catch {
    return err("JSON inválido", "bad_json", 400, origin);
  }

  // Ignorar identidad / métricas del browser — solo hint de período.
  const hints = parsePortalInterpretHints(bodyRaw);

  // Snapshot SIEMPRE desde sesión autorizada (misma lógica que dashboard).
  const row = await findSnapshotForAccount(env, session.aid, session.lid);

  if (!row) {
    return err(
      "Todavía no hay datos del comercio para interpretar.",
      "snapshot_empty",
      404,
      origin,
    );
  }

  let snapshot: PortalSnapshotPayload = {};
  try {
    snapshot = sanitizePayload(JSON.parse(row.payload)) ?? {};
  } catch {
    snapshot = {};
  }

  const period = hints.period ?? "today";
  const iaPayload = buildPortalIaPayload(snapshot, {
    period,
    snapshotUpdatedAt: row.updated_at,
  });
  const validated = validatePortalIaPayload(iaPayload);
  if (!validated.ok) {
    console.error("portal-1 payload invalid", validated.errors.slice(0, 5).join("; "));
    return err("Payload de interpretación inválido", "payload_invalid", 422, origin);
  }

  if (!env.PORTAL_BI_SERVICE_SECRET || env.PORTAL_BI_SERVICE_SECRET.length < 16) {
    return err("Servicio de interpretación no configurado", "service_misconfigured", 502, origin);
  }

  const plan = await resolveLicensePlan(env, session.lid);
  const portalLimit = PORTAL_IA_PLAN_LIMITS[plan] ?? PORTAL_IA_PLAN_LIMITS.basic ?? 20;

  const payloadHash = await sha256Hex(JSON.stringify(iaPayload));
  const cacheKey = portalIaCacheKey(session.aid, period, payloadHash);
  const cached = portalIaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return json({ ...cached.body, cached: true }, 200, origin);
  }

  // Rate limit bridge (portal:${aid}) — separado del desktop; bi-ia también aplica el suyo.
  if (!rateLimit(`portal-ia:${session.aid}`, portalLimit, 86_400_000)) {
    return err(
      "Límite diario de interpretaciones del portal alcanzado.",
      "rate_limited",
      429,
      origin,
    );
  }

  let serviceToken: string;
  try {
    serviceToken = await mintPortalServiceToken(env.PORTAL_BI_SERVICE_SECRET, {
      aid: session.aid,
      lid: session.lid,
    });
    const checked = await verifyPortalServiceToken(env.PORTAL_BI_SERVICE_SECRET, serviceToken);
    if (!checked.ok) {
      return err("No se pudo autenticar el puente IA", "service_auth_failed", 502, origin);
    }
  } catch (e) {
    console.error("portal service token mint failed", e instanceof Error ? e.message : e);
    return err("No se pudo autenticar el puente IA", "service_auth_failed", 502, origin);
  }

  const biIaBase = (env.PORTAL_BI_IA_URL || DEFAULT_BI_IA_URL).replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PORTAL_IA_BRIDGE_TIMEOUT_MS);

  const interpretBody = JSON.stringify({
    payload: iaPayload,
    // Hint de plan resuelto server-side (D1). bi-ia no confía en browser.
    plan,
  });
  const interpretHeaders = {
    authorization: `Bearer ${serviceToken}`,
    "content-type": "application/json",
  };

  /** Preferir service binding; fallback URL pública / fetch de tests. */
  const callBiIa = (path: string) => {
    const req = new Request(`https://gestion-bi-ia.internal${path}`, {
      method: "POST",
      headers: interpretHeaders,
      body: interpretBody,
      signal: controller.signal,
    });
    if (env.portalBiIaFetch) return env.portalBiIaFetch(req);
    if (env.BI_IA) return env.BI_IA.fetch(req);
    return fetch(`${biIaBase}${path}`, {
      method: "POST",
      headers: interpretHeaders,
      body: interpretBody,
      signal: controller.signal,
    });
  };

  let upstream: Response;
  let usedPath = "/interpret";
  try {
    upstream = await callBiIa("/interpret");
    // bi-ia también acepta POST /
    if (upstream.status === 404) {
      usedPath = "/";
      upstream = await callBiIa("/");
    }
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && (e.name === "AbortError" || /aborted|timeout/i.test(e.message))) {
      return err("La interpretación tardó demasiado. Probá de nuevo.", "timeout", 504, origin);
    }
    console.error("portal bi-ia fetch failed", e instanceof Error ? e.message : e);
    return err("El proveedor de IA no está disponible ahora.", "provider_unavailable", 502, origin);
  } finally {
    clearTimeout(timer);
  }

  let upstreamJson: Record<string, unknown> = {};
  try {
    upstreamJson = (await upstream.json()) as Record<string, unknown>;
  } catch {
    upstreamJson = {};
  }

  // Nunca reenviar tokens/secrets upstream al browser.
  const safeText = JSON.stringify(upstreamJson);
  if (
    safeText.includes("PBS1.") ||
    safeText.includes("OPENAI") ||
    safeText.includes(env.PORTAL_BI_SERVICE_SECRET) ||
    safeText.includes(env.LICENSE_ADMIN_SECRET)
  ) {
    return err("Respuesta de interpretación inválida", "interpretation_invalid", 422, origin);
  }

  if (upstream.status === 429) {
    return err(
      "Límite diario de interpretaciones del portal alcanzado.",
      "rate_limited",
      429,
      origin,
    );
  }
  if (upstream.status === 504 || upstreamJson.code === "timeout") {
    return err("La interpretación tardó demasiado. Probá de nuevo.", "timeout", 504, origin);
  }
  if (upstream.status === 502 || upstreamJson.code === "provider_unavailable") {
    return err("El proveedor de IA no está disponible ahora.", "provider_unavailable", 502, origin);
  }
  if (upstream.status === 422 || upstreamJson.code === "interpretation_invalid") {
    const detail =
      typeof upstreamJson.detail === "string" ? upstreamJson.detail.slice(0, 200) : undefined;
    return json(
      {
        ok: false,
        error: "interpretation_invalid",
        message: "La interpretación IA no pudo validarse.",
        ...(detail ? { detail } : {}),
      },
      422,
      origin,
    );
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return err("Puente de interpretación no autorizado", "service_auth_failed", 502, origin);
  }
  if (!upstream.ok || upstreamJson.ok !== true) {
    const upstreamCode =
      typeof upstreamJson.code === "string"
        ? upstreamJson.code
        : typeof upstreamJson.error === "string"
          ? upstreamJson.error
          : "unknown";
    console.error(
      "portal bi-ia interpret_failed",
      upstream.status,
      usedPath,
      String(upstreamCode).slice(0, 80),
    );
    return json(
      {
        ok: false,
        error: "interpret_failed",
        message: "No se pudo completar la interpretación",
        upstream_status: upstream.status,
        upstream_code: String(upstreamCode).slice(0, 64),
        upstream_path: usedPath,
      },
      502,
      origin,
    );
  }

  const summary = typeof upstreamJson.summary === "string" ? upstreamJson.summary.trim() : "";
  const insights = Array.isArray(upstreamJson.insights)
    ? upstreamJson.insights.filter((x): x is string => typeof x === "string")
    : [];
  const recommendations = Array.isArray(upstreamJson.recommendations)
    ? upstreamJson.recommendations.filter((x): x is string => typeof x === "string")
    : [];
  const uncertainty = Array.isArray(upstreamJson.uncertainty)
    ? upstreamJson.uncertainty.filter((x): x is string => typeof x === "string")
    : [];
  const engine =
    upstreamJson.engine === "openai" || upstreamJson.engine === "workers-ai"
      ? upstreamJson.engine
      : undefined;
  const model = typeof upstreamJson.model === "string" ? upstreamJson.model.slice(0, 80) : undefined;

  if (!summary) {
    return err("La interpretación IA no pudo validarse.", "interpretation_invalid", 422, origin);
  }

  const body: Record<string, unknown> = {
    ok: true,
    status: "interpreted",
    period,
    payload_version: PORTAL_IA_PAYLOAD_VERSION,
    has_snapshot: true,
    summary: summary.slice(0, 600),
    insights: insights.slice(0, 5),
    recommendations: recommendations.slice(0, 5),
    uncertainty: uncertainty.slice(0, 5),
  };
  if (engine) body.engine = engine;
  if (model) body.model = model;

  portalIaCache.set(cacheKey, {
    expiresAt: Date.now() + PORTAL_IA_CACHE_TTL_MS,
    body,
  });

  return json(body, 200, origin);
}

