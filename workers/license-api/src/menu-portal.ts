import type { PortalEnv } from "./portal";
import { portalCorsOrigin, portalOptions, verifyLicenseDeviceToken } from "./portal";

type D1Database = any;

const MAX_MENU_PUSH_BYTES = 1_200_000;
const MAX_PRODUCTS = 400;
const INFO_RATE = 60;
const INFO_WINDOW_MS = 60_000;

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

function err(message: string, code: string, status = 400, origin?: string | null): Response {
  return json({ ok: false, error: code, message }, status, origin);
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
}

export interface MenuPortalPayload {
  business_name?: string;
  menu_slug?: string;
  logo_data_url?: string;
  whatsapp?: string | null;
  currency?: string;
  products: MenuPortalProduct[];
  pushed_at?: string;
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

function sanitizeWhatsApp(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
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
        ? row.description.trim().slice(0, 280)
        : null;
    const image_data_url = sanitizeProductImageDataUrl(row.image_data_url);
    products.push({
      id,
      name,
      price,
      category,
      description,
      is_daily_menu: row.is_daily_menu === true || row.is_daily_menu === 1,
      ...(image_data_url ? { image_data_url } : {}),
    });
  }

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
    pushed_at: typeof o.pushed_at === "string" ? o.pushed_at.slice(0, 40) : undefined,
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

  const slug = snapshot.menu_slug || "carta";
  const updatedAt = new Date().toISOString();
  const payloadJson = JSON.stringify(snapshot);

  await env.DB.prepare(
    `INSERT INTO menu_portal_snapshots (license_id, menu_slug, payload, business_name, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(license_id) DO UPDATE SET
       menu_slug = excluded.menu_slug,
       payload = excluded.payload,
       business_name = excluded.business_name,
       updated_at = excluded.updated_at`,
  )
    .bind(
      resolved.licenseId,
      slug,
      payloadJson,
      snapshot.business_name ?? null,
      updatedAt,
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
    `SELECT business_name, updated_at, payload FROM menu_portal_snapshots WHERE menu_slug = ?1`,
  )
    .bind(slug)
    .first<{ business_name: string | null; updated_at: string; payload: string }>();

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

  return json(
    {
      ok: true,
      business_name: row.business_name || snapshot.business_name || "Mi local",
      updated_at: row.updated_at,
      logo_data_url: snapshot.logo_data_url,
      whatsapp: snapshot.whatsapp,
      currency: snapshot.currency || "$",
      products: snapshot.products,
      pushed_at: snapshot.pushed_at,
    },
    200,
    origin,
  );
}
