import type { PortalEnv } from "./portal";
import { portalCorsOrigin, portalOptions, verifyLicenseDeviceToken } from "./portal";

type D1Database = any;

const MAX_WORKSHOP_PUSH_BYTES = 400_000;
const MAX_ORDERS = 3000;
const MAX_ITEMS_PER_ORDER = 40;
const LOOKUP_RATE = 30;
const LOOKUP_WINDOW_MS = 60_000;

const lookupBuckets = new Map<string, { count: number; resetAt: number }>();

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
  const cur = lookupBuckets.get(key);
  if (!cur || now >= cur.resetAt) {
    lookupBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeDocument(raw: string): string {
  return raw.replace(/\D/g, "");
}

function slugify(raw: string): string {
  const base = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "taller";
}

export interface WorkshopPortalOrderItem {
  name: string;
  qty: number;
  is_labor: boolean;
}

export interface WorkshopPortalOrder {
  order_number: string;
  date: string;
  title: string;
  status: string;
  odometer_km?: number | null;
  items: WorkshopPortalOrderItem[];
}

export interface WorkshopPortalVehicle {
  plate: string;
  plate_norm: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  document_norm?: string | null;
  orders: WorkshopPortalOrder[];
}

export interface WorkshopPortalPayload {
  business_name?: string;
  workshop_slug?: string;
  vehicles: WorkshopPortalVehicle[];
  pushed_at?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En reparación",
  waiting_parts: "Espera repuestos",
  ready: "Listo para retirar",
  delivered: "Entregado",
  cancelled: "Cancelada",
};

function sanitizeWorkshopPayload(raw: unknown): WorkshopPortalPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const vehiclesRaw = Array.isArray(o.vehicles) ? o.vehicles : [];
  const vehicles: WorkshopPortalVehicle[] = [];

  for (const v of vehiclesRaw.slice(0, 5000)) {
    if (!v || typeof v !== "object") continue;
    const row = v as Record<string, unknown>;
    const plate = typeof row.plate === "string" ? row.plate.trim().slice(0, 16) : "";
    const plateNorm =
      typeof row.plate_norm === "string"
        ? normalizePlate(row.plate_norm)
        : normalizePlate(plate);
    if (!plateNorm) continue;

    const ordersRaw = Array.isArray(row.orders) ? row.orders : [];
    const orders: WorkshopPortalOrder[] = [];
    for (const ord of ordersRaw.slice(0, MAX_ORDERS)) {
      if (!ord || typeof ord !== "object") continue;
      const or = ord as Record<string, unknown>;
      const status = typeof or.status === "string" ? or.status : "pending";
      if (status === "cancelled") continue;
      const itemsRaw = Array.isArray(or.items) ? or.items : [];
      const items: WorkshopPortalOrderItem[] = [];
      for (const it of itemsRaw.slice(0, MAX_ITEMS_PER_ORDER)) {
        if (!it || typeof it !== "object") continue;
        const ir = it as Record<string, unknown>;
        const name = typeof ir.name === "string" ? ir.name.trim().slice(0, 160) : "";
        if (!name) continue;
        items.push({
          name,
          qty: typeof ir.qty === "number" && Number.isFinite(ir.qty) ? ir.qty : 1,
          is_labor: ir.is_labor === true || ir.is_labor === 1,
        });
      }
      orders.push({
        order_number:
          typeof or.order_number === "string" ? or.order_number.slice(0, 32) : "—",
        date: typeof or.date === "string" ? or.date.slice(0, 40) : "",
        title: typeof or.title === "string" ? or.title.slice(0, 200) : "Trabajo",
        status,
        odometer_km:
          typeof or.odometer_km === "number" && Number.isFinite(or.odometer_km)
            ? or.odometer_km
            : null,
        items,
      });
    }
    if (orders.length === 0) continue;
    orders.sort((a, b) => (a.date < b.date ? 1 : -1));

    const docNorm =
      typeof row.document_norm === "string"
        ? normalizeDocument(row.document_norm)
        : "";

    vehicles.push({
      plate: plate || plateNorm,
      plate_norm: plateNorm,
      brand: typeof row.brand === "string" ? row.brand.slice(0, 64) : null,
      model: typeof row.model === "string" ? row.model.slice(0, 64) : null,
      year:
        typeof row.year === "number" && Number.isFinite(row.year)
          ? Math.floor(row.year)
          : null,
      document_norm: docNorm || null,
      orders: orders.slice(0, 80),
    });
  }

  const slug =
    typeof o.workshop_slug === "string" ? slugify(o.workshop_slug) : "taller";

  return {
    business_name:
      typeof o.business_name === "string" ? o.business_name.slice(0, 120) : undefined,
    workshop_slug: slug,
    vehicles,
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

export function workshopPortalOptions(req: Request): Response {
  return portalOptions(req);
}

export async function handleWorkshopPortalPush(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const ip = clientIp(req);
  if (!rateLimit(`workshop-push:${ip}`, 40, 60_000)) {
    return err("Demasiadas subidas. Esperá un momento.", "rate_limited", 429, origin);
  }

  const text = await req.text();
  if (text.length > MAX_WORKSHOP_PUSH_BYTES) {
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

  const snapshot = sanitizeWorkshopPayload(body.snapshot ?? body);
  if (!snapshot) return err("Snapshot inválido", "bad_snapshot", 400, origin);
  if (!snapshot.pushed_at) snapshot.pushed_at = new Date().toISOString();

  const slug = snapshot.workshop_slug || "taller";
  const updatedAt = new Date().toISOString();
  const payloadJson = JSON.stringify(snapshot);

  await env.DB.prepare(
    `INSERT INTO workshop_portal_snapshots (license_id, workshop_slug, payload, business_name, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(license_id) DO UPDATE SET
       workshop_slug = excluded.workshop_slug,
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

  return json({ ok: true, workshop_slug: slug, updated_at: updatedAt }, 200, origin);
}

export async function handleWorkshopPortalInfo(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  const slug = slugify(url.searchParams.get("slug") || url.searchParams.get("t") || "");
  if (!slug) return err("Falta el código del taller", "bad_request", 400, origin);

  const row = await env.DB.prepare(
    `SELECT business_name, updated_at FROM workshop_portal_snapshots WHERE workshop_slug = ?1`,
  )
    .bind(slug)
    .first<{ business_name: string | null; updated_at: string }>();

  if (!row) {
    return err("Taller no encontrado o sin datos publicados aún.", "not_found", 404, origin);
  }

  return json(
    {
      ok: true,
      business_name: row.business_name || "Taller",
      updated_at: row.updated_at,
    },
    200,
    origin,
  );
}

export async function handleWorkshopPortalLookup(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const ip = clientIp(req);
  if (!rateLimit(`workshop-lookup:${ip}`, LOOKUP_RATE, LOOKUP_WINDOW_MS)) {
    return err("Demasiados intentos. Esperá un minuto.", "rate_limited", 429, origin);
  }

  const url = new URL(req.url);
  const slug = slugify(url.searchParams.get("slug") || url.searchParams.get("t") || "");
  const query = (url.searchParams.get("q") || url.searchParams.get("query") || "").trim();
  const mode = (url.searchParams.get("mode") || "plate").toLowerCase();

  if (!slug) return err("Falta el código del taller", "bad_request", 400, origin);
  if (!query) return err("Ingresá patente o DNI", "bad_request", 400, origin);

  const row = await env.DB.prepare(
    `SELECT payload, business_name, updated_at FROM workshop_portal_snapshots WHERE workshop_slug = ?1`,
  )
    .bind(slug)
    .first<{ payload: string; business_name: string | null; updated_at: string }>();

  if (!row) {
    return err("Taller no encontrado o sin historial publicado.", "not_found", 404, origin);
  }

  let payload: WorkshopPortalPayload;
  try {
    payload = JSON.parse(row.payload) as WorkshopPortalPayload;
  } catch {
    return err("Datos del taller corruptos", "server_error", 500, origin);
  }

  const plateNorm = normalizePlate(query);
  const docNorm = normalizeDocument(query);
  const matches: WorkshopPortalVehicle[] = [];

  for (const v of payload.vehicles || []) {
    if (mode === "document" || mode === "dni") {
      if (docNorm && v.document_norm === docNorm) matches.push(v);
    } else if (plateNorm && v.plate_norm === plateNorm) {
      matches.push(v);
    }
  }

  // Si buscaron patente y no hubo match, probar DNI por si pegaron el documento.
  if (matches.length === 0 && plateNorm.length >= 6 && /^\d+$/.test(plateNorm)) {
    for (const v of payload.vehicles || []) {
      if (v.document_norm === plateNorm) matches.push(v);
    }
  }

  if (matches.length === 0) {
    return json(
      {
        ok: true,
        found: false,
        business_name: row.business_name || payload.business_name || "Taller",
        updated_at: row.updated_at,
        vehicles: [],
      },
      200,
      origin,
    );
  }

  const vehicles = matches.map((v) => ({
    plate: v.plate,
    brand: v.brand,
    model: v.model,
    year: v.year,
    orders: v.orders.map((o) => ({
      ...o,
      status_label: STATUS_LABELS[o.status] || o.status,
    })),
  }));

  return json(
    {
      ok: true,
      found: true,
      business_name: row.business_name || payload.business_name || "Taller",
      updated_at: row.updated_at,
      vehicles,
    },
    200,
    origin,
  );
}

export { slugify as workshopSlugify };
