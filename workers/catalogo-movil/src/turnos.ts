import type { Env } from "./index";

const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 19 * 60;
const DURATION_MIN = 60;
const STEP_MIN = 30;
const HORIZON_DAYS = 21;
const BOOKABLE = new Set(["estetica", "clinica", "taller"]);
const SERVICE_UNITS = new Set(["servicio", "practica", "sesion"]);

const STATUSES = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const;
type BookingStatus = (typeof STATUSES)[number];

const OCCUPIES = new Set<BookingStatus>(["scheduled", "confirmed", "in_progress", "completed"]);

type Shift = { openMin: number; closeMin: number; open: string; close: string };

type Hours = {
  days: number[];
  shifts: Shift[];
  open: string;
  close: string;
  source: "local" | "default";
};

type Agenda = {
  rubro?: string;
  hours?: { days?: number[]; open?: string; close?: string; open2?: string; close2?: string };
  resources?: { id?: number; name?: string; active?: number }[];
  services?: { sync_id?: string; duration_min?: number; resource_ids?: number[] }[];
  blocks?: {
    local_id?: number;
    resource_id?: number | null;
    resource_name?: string;
    starts_at?: string;
    ends_at?: string;
    status?: string;
    title?: string;
    customer_name?: string;
    customer_phone?: string;
    web_id?: string;
  }[];
  known?: { web_id?: string; local_id?: number; status?: string; known_seq?: number }[];
};

type Span = {
  id: string;
  resource_id: number | null;
  resource_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

function err(error: string, status = 400) {
  return json({ ok: false, error }, status);
}

function text(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function num(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function foldUnit(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isStatus(value: string): value is BookingStatus {
  return (STATUSES as readonly string[]).includes(value);
}

function occupies(status: string) {
  return isStatus(status) && OCCUPIES.has(status);
}

function stampNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return { date, stamp: `${date} ${get("hour")}:${get("minute")}:${get("second")}` };
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addMinutes(starts: string, minutes: number) {
  const [date, time] = starts.split(" ");
  const [h, m] = (time || "00:00:00").split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  return `${date} ${pad(Math.floor(total / 60))}:${pad(total % 60)}:00`;
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

function sameResource(
  aId: number | null,
  aName: string,
  bId: number | null,
  bName: string,
) {
  if (aId && bId) return aId === bId;
  const left = aName.trim().toLowerCase();
  const right = bName.trim().toLowerCase();
  return left !== "" && left === right;
}

function bookable(rubro: string) {
  return BOOKABLE.has(rubro);
}

function weekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

function clockMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function clockLabel(mins: number) {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

function defaultHours(): Hours {
  return {
    days: [0, 1, 2, 3, 4, 5, 6],
    shifts: [{ openMin: OPEN_MIN, closeMin: CLOSE_MIN, open: "09:00", close: "19:00" }],
    open: "09:00",
    close: "19:00",
    source: "default",
  };
}

function shiftFrom(openRaw: unknown, closeRaw: unknown): Shift | null {
  const openMin = clockMinutes(String(openRaw ?? ""));
  const closeMin = clockMinutes(String(closeRaw ?? ""));
  if (openMin == null || closeMin == null || closeMin - openMin < DURATION_MIN) return null;
  return { openMin, closeMin, open: clockLabel(openMin), close: clockLabel(closeMin) };
}

function parseHours(raw: string | null | undefined): Hours {
  if (!raw) return defaultHours();
  try {
    const data = JSON.parse(raw) as { days?: unknown; open?: unknown; close?: unknown; open2?: unknown; close2?: unknown };
    const days = Array.isArray(data.days)
      ? [...new Set(data.days.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6))]
      : [];
    const first = shiftFrom(data.open, data.close);
    if (!days.length || !first) return defaultHours();
    const shifts = [first];
    const second = shiftFrom(data.open2, data.close2);
    if (second && second.openMin >= first.closeMin) shifts.push(second);
    return { days, shifts, open: first.open, close: first.close, source: "local" };
  } catch {
    return defaultHours();
  }
}

function hoursPayload(raw: Agenda["hours"] | undefined) {
  if (!raw) return "";
  const parsed = parseHours(JSON.stringify(raw));
  if (parsed.source !== "local") return "";
  const body: { days: number[]; open: string; close: string; open2?: string; close2?: string } = {
    days: parsed.days,
    open: parsed.shifts[0].open,
    close: parsed.shifts[0].close,
  };
  if (parsed.shifts[1]) {
    body.open2 = parsed.shifts[1].open;
    body.close2 = parsed.shifts[1].close;
  }
  return JSON.stringify(body);
}

function serviceTiming(durationMin: number) {
  const mins = Math.round(durationMin);
  if (mins >= 5 && mins <= 480) return { duration: mins, step: mins };
  return { duration: DURATION_MIN, step: STEP_MIN };
}

function daySlots(date: string, hours: Hours, duration = DURATION_MIN, step = STEP_MIN) {
  const slots: { starts_at: string; ends_at: string }[] = [];
  if (!hours.days.includes(weekday(date))) return slots;
  const size = duration >= 5 ? duration : DURATION_MIN;
  const jump = step >= 5 ? step : STEP_MIN;
  for (const shift of hours.shifts) {
    for (let mins = shift.openMin; mins + size <= shift.closeMin; mins += jump) {
      const starts_at = `${date} ${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;
      slots.push({ starts_at, ends_at: addMinutes(starts_at, size) });
    }
  }
  return slots;
}

function publicCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

async function columnExists(env: Env, table: string, column: string) {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return (info.results ?? []).some((row) => row.name === column);
}

export async function ensureTurnosSchema(env: Env) {
  if (!(await columnExists(env, "tenants", "public_code"))) {
    await env.DB.prepare("ALTER TABLE tenants ADD COLUMN public_code TEXT").run();
  }
  if (!(await columnExists(env, "tenants", "rubro"))) {
    await env.DB.prepare("ALTER TABLE tenants ADD COLUMN rubro TEXT NOT NULL DEFAULT ''").run();
  }
  if (!(await columnExists(env, "tenants", "booking_hours"))) {
    await env.DB.prepare("ALTER TABLE tenants ADD COLUMN booking_hours TEXT").run();
  }
  if (!(await columnExists(env, "tenants", "public_slug"))) {
    await env.DB.prepare("ALTER TABLE tenants ADD COLUMN public_slug TEXT").run();
  }
  await env.DB.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_public_slug ON tenants(public_slug)`,
  ).run();
  await env.DB.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_public_code ON tenants(public_code)`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS booking_services (
      tenant_id TEXT NOT NULL,
      sync_id TEXT NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 0,
      resource_ids TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (tenant_id, sync_id)
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS booking_resources (
      tenant_id TEXT NOT NULL,
      resource_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (tenant_id, resource_id)
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS booking_blocks (
      tenant_id TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      resource_id INTEGER,
      resource_name TEXT NOT NULL DEFAULT '',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      web_id TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (tenant_id, local_id)
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS web_bookings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      resource_id INTEGER,
      resource_name TEXT NOT NULL DEFAULT '',
      service_sync_id TEXT NOT NULL DEFAULT '',
      service_name TEXT NOT NULL,
      service_price REAL NOT NULL DEFAULT 0,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      status_seq INTEGER NOT NULL DEFAULT 1,
      origin TEXT NOT NULL DEFAULT 'web',
      local_id INTEGER,
      acked_seq INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_web_bookings_tenant ON web_bookings (tenant_id, starts_at)`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS booking_status_ops (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      acked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_booking_status_ops ON booking_status_ops (tenant_id, acked)`,
  ).run();
}

const RESERVED_SLUGS = new Set([
  "turnos", "carta", "app", "taller", "legal", "tools", "marketing", "oauth", "assets", "branding",
  "guias", "precios", "celular", "funciones", "recursos", "walqo", "admin",
  "como-funciona", "gestion-de-stock", "sistema-punto-de-venta", "software-para-comercios",
  "software-gestion-comercial", "software-para-kioscos", "software-para-almacenes",
]);

function slugFromName(name: string) {
  const words = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  let slug = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  if (!/^[A-Za-z]/.test(slug)) slug = "Local" + slug;
  slug = slug.slice(0, 24);
  if (slug.length < 3) slug = "Local";
  if (RESERVED_SLUGS.has(slug.toLowerCase())) slug = slug + "Local";
  return slug;
}

export async function ensurePublicSlug(env: Env, tenantId: string) {
  const current = await env.DB.prepare(
    "SELECT business_name, public_slug FROM tenants WHERE id = ?1",
  )
    .bind(tenantId)
    .first<{ business_name: string | null; public_slug: string | null }>();
  if (!current) return "";
  if (current.public_slug) return current.public_slug;
  const base = slugFromName(current.business_name || "Local");
  for (let extra = 0; extra < 30; extra += 1) {
    const candidate = extra === 0 ? base : `${base.slice(0, 20)}${extra + 1}`;
    const taken = await env.DB.prepare(
      "SELECT id FROM tenants WHERE lower(public_slug) = lower(?1) LIMIT 1",
    )
      .bind(candidate)
      .first<{ id: string }>();
    if (taken) continue;
    await env.DB.prepare("UPDATE tenants SET public_slug = ?1 WHERE id = ?2 AND public_slug IS NULL")
      .bind(candidate, tenantId)
      .run();
    const saved = await env.DB.prepare("SELECT public_slug FROM tenants WHERE id = ?1")
      .bind(tenantId)
      .first<{ public_slug: string | null }>();
    if (saved?.public_slug) return saved.public_slug;
  }
  return "";
}

async function tenantByPublicCode(env: Env, code: string) {
  const raw = text(code, 32);
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length >= 6) {
    const byCode = await env.DB.prepare(
      "SELECT id, business_name, COALESCE(rubro, '') AS rubro FROM tenants WHERE public_code = ?1",
    )
      .bind(clean)
      .first<{ id: string; business_name: string; rubro: string }>();
    if (byCode) return byCode;
  }
  const slug = raw.replace(/[^A-Za-z0-9]/g, "");
  if (slug.length < 3) return null;
  return env.DB.prepare(
    "SELECT id, business_name, COALESCE(rubro, '') AS rubro FROM tenants WHERE lower(public_slug) = lower(?1)",
  )
    .bind(slug)
    .first<{ id: string; business_name: string; rubro: string }>();
}

export async function ensurePublicCode(env: Env, tenantId: string, rubro: string) {
  if (!bookable(rubro)) return "";
  const current = await env.DB.prepare("SELECT public_code FROM tenants WHERE id = ?1")
    .bind(tenantId)
    .first<{ public_code: string | null }>();
  if (current?.public_code) return current.public_code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = publicCode();
    try {
      await env.DB.prepare(
        `UPDATE tenants SET public_code = ?1, updated_at = ?2
         WHERE id = ?3 AND (public_code IS NULL OR public_code = '')`,
      )
        .bind(code, new Date().toISOString(), tenantId)
        .run();
    } catch {
      continue;
    }
    const saved = await env.DB.prepare("SELECT public_code FROM tenants WHERE id = ?1")
      .bind(tenantId)
      .first<{ public_code: string | null }>();
    if (saved?.public_code) return saved.public_code;
  }
  return "";
}

async function spansFor(env: Env, tenantId: string, from: string, to: string) {
  const bookings = await env.DB.prepare(
    `SELECT id, resource_id, resource_name, starts_at, ends_at, status
     FROM web_bookings
     WHERE tenant_id = ?1 AND starts_at < ?2 AND ends_at > ?3`,
  )
    .bind(tenantId, to, from)
    .all<Span>();
  const blocks = await env.DB.prepare(
    `SELECT web_id AS id, resource_id, resource_name, starts_at, ends_at, status
     FROM booking_blocks
     WHERE tenant_id = ?1 AND starts_at < ?2 AND ends_at > ?3`,
  )
    .bind(tenantId, to, from)
    .all<Span>();
  const webIds = new Set((bookings.results ?? []).map((row) => row.id));
  const spans = [...(bookings.results ?? [])];
  for (const block of blocks.results ?? []) {
    if (block.id && webIds.has(block.id)) continue;
    spans.push(block);
  }
  return spans.filter((span) => occupies(span.status));
}

function taken(
  spans: Span[],
  resourceId: number | null,
  resourceName: string,
  starts: string,
  ends: string,
  ignoreId = "",
) {
  return spans.some(
    (span) =>
      span.id !== ignoreId &&
      sameResource(resourceId, resourceName, span.resource_id, span.resource_name) &&
      rangesOverlap(starts, ends, span.starts_at, span.ends_at),
  );
}

function resourceIdList(raw: string) {
  return raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function servicesFor(env: Env, tenantId: string) {
  const rows = await env.DB.prepare(
    `SELECT p.sync_id, p.name, p.price, p.unit,
            COALESCE(b.duration_min, 0) AS duration_min,
            COALESCE(b.resource_ids, '') AS resource_ids
     FROM products p
     LEFT JOIN booking_services b ON b.tenant_id = p.tenant_id AND b.sync_id = p.sync_id
     WHERE p.tenant_id = ?1 AND p.active = 1
     ORDER BY p.name COLLATE NOCASE LIMIT 200`,
  )
    .bind(tenantId)
    .all<{
      sync_id: string;
      name: string;
      price: number;
      unit: string;
      duration_min: number;
      resource_ids: string;
    }>();
  return (rows.results ?? [])
    .filter((row) => SERVICE_UNITS.has(foldUnit(row.unit)))
    .slice(0, 80)
    .map((row) => ({
      sync_id: row.sync_id,
      name: row.name,
      price: Number(row.price) || 0,
      duration_min: Math.round(Number(row.duration_min) || 0),
      resource_ids: resourceIdList(row.resource_ids || ""),
    }));
}

async function resourcesFor(env: Env, tenantId: string) {
  const rows = await env.DB.prepare(
    `SELECT resource_id, name FROM booking_resources
     WHERE tenant_id = ?1 AND active = 1
     ORDER BY name COLLATE NOCASE`,
  )
    .bind(tenantId)
    .all<{ resource_id: number; name: string }>();
  return (rows.results ?? []).map((row) => ({ id: row.resource_id, name: row.name }));
}

async function hoursFor(env: Env, tenantId: string) {
  const row = await env.DB.prepare("SELECT booking_hours FROM tenants WHERE id = ?1")
    .bind(tenantId)
    .first<{ booking_hours: string | null }>();
  return parseHours(row?.booking_hours);
}

export async function handlePublicTurnosGet(url: URL, env: Env) {
  const tenant = await tenantByPublicCode(env, url.searchParams.get("t") || "");
  if (!tenant) return err("Ese enlace no corresponde a un local.", 404);
  if (!bookable(tenant.rubro)) {
    return err("Este local no toma turnos por la web.", 404);
  }
  const now = stampNow();
  const horizon = addDays(now.date, HORIZON_DAYS);
  const requested = text(url.searchParams.get("date"), 10);
  const date = validDate(requested) && requested >= now.date && requested <= horizon ? requested : now.date;
  const resourceParam = text(url.searchParams.get("resource"), 12);
  const anyResource = resourceParam === "any";
  const resourceId = anyResource ? 0 : num(resourceParam, 0);
  const services = await servicesFor(env, tenant.id);
  const service = services.find((item) => item.sync_id === text(url.searchParams.get("service"), 64)) ?? null;
  const timing = serviceTiming(service?.duration_min || 0);
  const resources = await resourcesFor(env, tenant.id);
  const allowed = service && service.resource_ids.length
    ? resources.filter((item) => service.resource_ids.includes(item.id))
    : resources;
  const resource = allowed.find((item) => item.id === resourceId) ?? null;
  const hours = await hoursFor(env, tenant.id);
  const spans = resource || anyResource
    ? await spansFor(env, tenant.id, `${now.date} 00:00:00`, `${addDays(horizon, 1)} 00:00:00`)
    : [];
  const openDates: string[] = [];
  let slots: { starts_at: string; ends_at: string; resource_id?: number }[] = [];
  const owners = anyResource ? [...allowed].sort((a, b) => a.id - b.id) : resource ? [resource] : [];
  if (owners.length) {
    for (let cursor = now.date; cursor <= horizon; cursor = addDays(cursor, 1)) {
      const free = daySlots(cursor, hours, timing.duration, timing.step).flatMap((slot) => {
        if (cursor === now.date && slot.starts_at <= now.stamp) return [];
        const owner = owners.find(
          (item) => !taken(spans, item.id, item.name, slot.starts_at, slot.ends_at),
        );
        if (!owner) return [];
        return [{ ...slot, resource_id: owner.id }];
      });
      if (!free.length) continue;
      openDates.push(cursor);
      if (cursor === date) slots = free;
    }
  }
  return json({
    ok: true,
    business_name: tenant.business_name || "El local",
    rubro: tenant.rubro,
    date,
    today: now.date,
    horizon,
    open: hours.open,
    close: hours.close,
    hours: {
      days: hours.days,
      open: hours.open,
      close: hours.close,
      shifts: hours.shifts.map((shift) => ({ open: shift.open, close: shift.close })),
      source: hours.source,
    },
    duration_min: timing.duration,
    needs_resource: resources.length > 0,
    services,
    resources,
    open_dates: openDates,
    slots,
  });
}

export async function handlePublicTurnosPost(request: Request, env: Env) {
  const body = (await request.json().catch(() => ({}))) as {
    t?: string;
    service_sync_id?: string;
    resource_id?: number;
    starts_at?: string;
    customer_name?: string;
    customer_phone?: string;
  };
  const tenant = await tenantByPublicCode(env, body.t || "");
  if (!tenant) return err("Ese enlace no corresponde a un local.", 404);
  if (!bookable(tenant.rubro)) return err("Este local no toma turnos por la web.", 404);
  const name = text(body.customer_name, 80);
  const phone = text(body.customer_phone, 40);
  const digits = phone.replace(/\D/g, "");
  if (name.length < 2) return err("Dejá tu nombre.");
  if (digits.length < 8) return err("Dejá un teléfono válido.");
  const serviceId = text(body.service_sync_id, 64);
  const service = (await servicesFor(env, tenant.id)).find((item) => item.sync_id === serviceId);
  if (!service) return err("Elegí un servicio del local.");
  const timing = serviceTiming(service.duration_min);
  const resourceId = num(body.resource_id, 0);
  const resource = (await resourcesFor(env, tenant.id)).find((item) => item.id === resourceId);
  if (!resource) return err("Elegí un profesional.");
  if (service.resource_ids.length && !service.resource_ids.includes(resource.id)) {
    return err("Ese profesional no hace este servicio.");
  }
  const starts = text(body.starts_at, 19);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(starts)) return err("Elegí un horario.");
  const date = starts.slice(0, 10);
  const now = stampNow();
  if (!validDate(date) || date < now.date || date > addDays(now.date, HORIZON_DAYS)) {
    return err("Ese día no está disponible.");
  }
  const hours = await hoursFor(env, tenant.id);
  const offered = daySlots(date, hours, timing.duration, timing.step).find((slot) => slot.starts_at === starts);
  if (!offered) return err("Ese horario no está en la agenda.");
  if (date === now.date && starts <= now.stamp) return err("Ese horario ya pasó.");
  const spans = await spansFor(env, tenant.id, offered.starts_at, offered.ends_at);
  if (taken(spans, resource.id, resource.name, offered.starts_at, offered.ends_at)) {
    return err("Ese horario ya está tomado. Elegí otro.");
  }
  const id = crypto.randomUUID().replace(/-/g, "");
  const ts = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO web_bookings (
      id, tenant_id, resource_id, resource_name, service_sync_id, service_name, service_price,
      customer_name, customer_phone, starts_at, ends_at, status, status_seq, origin,
      local_id, acked_seq, created_at, updated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'scheduled',1,'web',NULL,0,?12,?12)`,
  )
    .bind(
      id,
      tenant.id,
      resource.id,
      resource.name,
      service.sync_id,
      service.name,
      service.price,
      name,
      phone,
      offered.starts_at,
      offered.ends_at,
      ts,
    )
    .run();
  const rivals = await env.DB.prepare(
    `SELECT id, created_at, resource_id, resource_name, starts_at, ends_at, status
     FROM web_bookings
     WHERE tenant_id = ?1 AND starts_at < ?2 AND ends_at > ?3`,
  )
    .bind(tenant.id, offered.ends_at, offered.starts_at)
    .all<Span & { created_at: string }>();
  const overlapping = (rivals.results ?? [])
    .filter(
      (span) =>
        occupies(span.status) &&
        sameResource(resource.id, resource.name, span.resource_id, span.resource_name) &&
        rangesOverlap(offered.starts_at, offered.ends_at, span.starts_at, span.ends_at),
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if (overlapping[0] && overlapping[0].id !== id) {
    await env.DB.prepare("DELETE FROM web_bookings WHERE id = ?1 AND tenant_id = ?2")
      .bind(id, tenant.id)
      .run();
    return err("Ese horario acaba de ocuparse. Elegí otro.");
  }
  return json({
    ok: true,
    id,
    status: "scheduled",
    business_name: tenant.business_name || "El local",
    service_name: service.name,
    service_price: service.price,
    resource_name: resource.name,
    customer_name: name,
    starts_at: offered.starts_at,
    ends_at: offered.ends_at,
  });
}

function bookingPayload(row: {
  id: string;
  local_id: number | null;
  resource_id: number | null;
  resource_name: string;
  service_name: string;
  service_price: number;
  customer_name: string;
  customer_phone: string;
  starts_at: string;
  ends_at: string;
  status: string;
  status_seq: number;
  origin: string;
}) {
  return {
    id: row.id,
    local_id: row.local_id,
    resource_id: row.resource_id,
    resource_name: row.resource_name,
    service_name: row.service_name,
    service_price: Number(row.service_price) || 0,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
    status_seq: row.status_seq,
    origin: row.origin,
  };
}

async function pendingForDesktop(env: Env, tenantId: string) {
  const bookings = await env.DB.prepare(
    `SELECT id, local_id, resource_id, resource_name, service_name, service_price,
            customer_name, customer_phone, starts_at, ends_at, status, status_seq, origin
     FROM web_bookings
     WHERE tenant_id = ?1 AND status_seq > acked_seq
     ORDER BY created_at LIMIT 40`,
  )
    .bind(tenantId)
    .all<{
      id: string;
      local_id: number | null;
      resource_id: number | null;
      resource_name: string;
      service_name: string;
      service_price: number;
      customer_name: string;
      customer_phone: string;
      starts_at: string;
      ends_at: string;
      status: string;
      status_seq: number;
      origin: string;
    }>();
  const ops = await env.DB.prepare(
    `SELECT id, local_id, status FROM booking_status_ops
     WHERE tenant_id = ?1 AND acked = 0 ORDER BY created_at LIMIT 40`,
  )
    .bind(tenantId)
    .all<{ id: string; local_id: number; status: string }>();
  return {
    web_bookings: (bookings.results ?? []).map(bookingPayload),
    booking_status_ops: ops.results ?? [],
  };
}

export async function applyAgenda(env: Env, tenantId: string, agenda: Agenda | undefined) {
  const rubro = text(agenda?.rubro, 40);
  if (rubro) {
    await env.DB.prepare("UPDATE tenants SET rubro = ?1, updated_at = ?2 WHERE id = ?3")
      .bind(rubro, new Date().toISOString(), tenantId)
      .run();
  }
  const stored = await env.DB.prepare("SELECT COALESCE(rubro, '') AS rubro FROM tenants WHERE id = ?1")
    .bind(tenantId)
    .first<{ rubro: string }>();
  const activeRubro = rubro || stored?.rubro || "";
  if (bookable(activeRubro) && agenda) {
    const hoursJson = hoursPayload(agenda.hours);
    if (hoursJson) {
      await env.DB.prepare("UPDATE tenants SET booking_hours = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(hoursJson, new Date().toISOString(), tenantId)
        .run();
    }
    if (Array.isArray(agenda.services)) {
      await env.DB.prepare("DELETE FROM booking_services WHERE tenant_id = ?1").bind(tenantId).run();
      for (const service of agenda.services.slice(0, 80)) {
        const syncId = text(service.sync_id, 64);
        if (!syncId) continue;
        const ids = Array.isArray(service.resource_ids)
          ? service.resource_ids.map((id) => num(id, 0)).filter((id) => id > 0)
          : [];
        await env.DB.prepare(
          `INSERT INTO booking_services (tenant_id, sync_id, duration_min, resource_ids)
           VALUES (?1, ?2, ?3, ?4)`,
        )
          .bind(tenantId, syncId, Math.max(0, Math.round(num(service.duration_min, 0))), ids.join(","))
          .run();
      }
    }
    if (Array.isArray(agenda.resources)) {
    await env.DB.prepare("DELETE FROM booking_resources WHERE tenant_id = ?1").bind(tenantId).run();
    for (const resource of agenda.resources.slice(0, 80)) {
      const id = num(resource.id, 0);
      const name = text(resource.name, 80);
      if (!id || !name) continue;
      await env.DB.prepare(
        `INSERT INTO booking_resources (tenant_id, resource_id, name, active)
         VALUES (?1, ?2, ?3, ?4)`,
      )
        .bind(tenantId, id, name, num(resource.active, 1) ? 1 : 0)
        .run();
    }
    }
    const pendingOps = await env.DB.prepare(
      `SELECT local_id, status FROM booking_status_ops
       WHERE tenant_id = ?1 AND acked = 0`,
    )
      .bind(tenantId)
      .all<{ local_id: number; status: string }>();
    const override = new Map<number, string>();
    for (const op of pendingOps.results ?? []) {
      if (isStatus(op.status)) override.set(op.local_id, op.status);
    }
    if (Array.isArray(agenda.blocks)) {
    await env.DB.prepare("DELETE FROM booking_blocks WHERE tenant_id = ?1").bind(tenantId).run();
    for (const block of agenda.blocks.slice(0, 300)) {
      const localId = num(block.local_id, 0);
      const starts = text(block.starts_at, 19);
      const ends = text(block.ends_at, 19);
      const status = override.get(localId) || text(block.status, 20);
      if (!localId || !starts || !ends || !isStatus(status)) continue;
      await env.DB.prepare(
        `INSERT INTO booking_blocks (
          tenant_id, local_id, resource_id, resource_name, starts_at, ends_at, status,
          title, customer_name, customer_phone, web_id
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
      )
        .bind(
          tenantId,
          localId,
          num(block.resource_id, 0) || null,
          text(block.resource_name, 80),
          starts,
          ends,
          status,
          text(block.title, 120),
          text(block.customer_name, 80),
          text(block.customer_phone, 40),
          text(block.web_id, 64),
        )
        .run();
    }
    }
    if (Array.isArray(agenda.known)) {
    for (const known of agenda.known.slice(0, 300)) {
      const webId = text(known.web_id, 64);
      if (!webId) continue;
      const row = await env.DB.prepare(
        "SELECT status, status_seq, local_id FROM web_bookings WHERE tenant_id = ?1 AND id = ?2",
      )
        .bind(tenantId, webId)
        .first<{ status: string; status_seq: number; local_id: number | null }>();
      if (!row) continue;
      const localId = num(known.local_id, 0);
      if (localId && !row.local_id) {
        await env.DB.prepare(
          "UPDATE web_bookings SET local_id = ?1 WHERE tenant_id = ?2 AND id = ?3",
        )
          .bind(localId, tenantId, webId)
          .run();
      }
      const next = text(known.status, 20);
      if (num(known.known_seq, -1) === row.status_seq && isStatus(next) && next !== row.status) {
        const seq = row.status_seq + 1;
        await env.DB.prepare(
          `UPDATE web_bookings
           SET status = ?1, status_seq = ?2, acked_seq = ?2, updated_at = ?3
           WHERE tenant_id = ?4 AND id = ?5 AND status_seq = ?6`,
        )
          .bind(next, seq, new Date().toISOString(), tenantId, webId, row.status_seq)
          .run();
      }
    }
    }
  }
  const public_code = await ensurePublicCode(env, tenantId, activeRubro);
  const public_slug = await ensurePublicSlug(env, tenantId);
  const pending = await pendingForDesktop(env, tenantId);
  return { public_code, public_slug, ...pending };
}

export async function ackTurnos(
  env: Env,
  tenantId: string,
  body: {
    booking_results?: { id?: string; local_id?: number; status_seq?: number; ok?: boolean }[];
    status_op_ids?: string[];
  },
) {
  for (const result of body.booking_results ?? []) {
    const id = text(result.id, 64);
    if (!id || result.ok === false) continue;
    const localId = num(result.local_id, 0);
    const seq = num(result.status_seq, 0);
    if (localId) {
      await env.DB.prepare(
        `UPDATE web_bookings SET local_id = ?1
         WHERE tenant_id = ?2 AND id = ?3 AND local_id IS NULL`,
      )
        .bind(localId, tenantId, id)
        .run();
    }
    if (seq > 0) {
      await env.DB.prepare(
        `UPDATE web_bookings SET acked_seq = status_seq
         WHERE tenant_id = ?1 AND id = ?2 AND status_seq = ?3`,
      )
        .bind(tenantId, id, seq)
        .run();
    }
  }
  for (const raw of body.status_op_ids ?? []) {
    const id = text(raw, 64);
    if (!id) continue;
    await env.DB.prepare(
      "UPDATE booking_status_ops SET acked = 1 WHERE tenant_id = ?1 AND id = ?2",
    )
      .bind(tenantId, id)
      .run();
  }
}

export async function handlePhoneTurnosGet(url: URL, env: Env, tenantId: string) {
  const tenant = await env.DB.prepare("SELECT COALESCE(rubro, '') AS rubro FROM tenants WHERE id = ?1")
    .bind(tenantId)
    .first<{ rubro: string }>();
  if (!bookable(tenant?.rubro || "")) {
    return json({ ok: true, enabled: false, items: [] });
  }
  const now = stampNow();
  const requested = text(url.searchParams.get("date"), 10);
  const date = validDate(requested) ? requested : now.date;
  const from = `${date} 00:00:00`;
  const to = `${date} 23:59:59`;
  const bookings = await env.DB.prepare(
    `SELECT id, local_id, resource_name, service_name, customer_name, customer_phone,
            starts_at, ends_at, status, origin
     FROM web_bookings
     WHERE tenant_id = ?1 AND starts_at >= ?2 AND starts_at <= ?3
     ORDER BY starts_at`,
  )
    .bind(tenantId, from, to)
    .all<{
      id: string;
      local_id: number | null;
      resource_name: string;
      service_name: string;
      customer_name: string;
      customer_phone: string;
      starts_at: string;
      ends_at: string;
      status: string;
      origin: string;
    }>();
  const blocks = await env.DB.prepare(
    `SELECT local_id, resource_name, title, customer_name, customer_phone, starts_at, ends_at, status, web_id
     FROM booking_blocks
     WHERE tenant_id = ?1 AND starts_at >= ?2 AND starts_at <= ?3
     ORDER BY starts_at`,
  )
    .bind(tenantId, from, to)
    .all<{
      local_id: number;
      resource_name: string;
      title: string;
      customer_name: string;
      customer_phone: string;
      starts_at: string;
      ends_at: string;
      status: string;
      web_id: string;
    }>();
  const webIds = new Set((bookings.results ?? []).map((row) => row.id));
  const items = (bookings.results ?? []).map((row) => ({
    id: row.id,
    kind: "web" as "web" | "local",
    origin: row.origin || "web",
    title: row.service_name,
    resource_name: row.resource_name,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    status: row.status,
  }));
  for (const block of blocks.results ?? []) {
    if (block.web_id && webIds.has(block.web_id)) continue;
    items.push({
      id: String(block.local_id),
      kind: "local",
      origin: "local",
      title: block.title || "Turno",
      resource_name: block.resource_name,
      customer_name: block.customer_name,
      customer_phone: block.customer_phone,
      starts_at: block.starts_at,
      ends_at: block.ends_at,
      status: block.status,
    });
  }
  items.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return json({ ok: true, enabled: true, date, items });
}

export async function handlePhoneTurnosStatus(request: Request, env: Env, tenantId: string) {
  const tenant = await env.DB.prepare("SELECT COALESCE(rubro, '') AS rubro FROM tenants WHERE id = ?1")
    .bind(tenantId)
    .first<{ rubro: string }>();
  if (!bookable(tenant?.rubro || "")) return err("Los turnos por la web son para estética, clínica y taller.");
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    kind?: string;
    status?: string;
  };
  const status = text(body.status, 20);
  if (!isStatus(status)) return err("Ese estado no existe.");
  const kind = text(body.kind, 10);
  const id = text(body.id, 64);
  const ts = new Date().toISOString();
  if (kind === "web") {
    const row = await env.DB.prepare(
      "SELECT status, status_seq FROM web_bookings WHERE tenant_id = ?1 AND id = ?2",
    )
      .bind(tenantId, id)
      .first<{ status: string; status_seq: number }>();
    if (!row) return err("Ese turno no está.", 404);
    if (row.status !== status) {
      await env.DB.prepare(
        `UPDATE web_bookings SET status = ?1, status_seq = status_seq + 1, updated_at = ?2
         WHERE tenant_id = ?3 AND id = ?4 AND status_seq = ?5`,
      )
        .bind(status, ts, tenantId, id, row.status_seq)
        .run();
    }
    return json({ ok: true });
  }
  if (kind === "local") {
    const localId = num(id, 0);
    if (!localId) return err("Ese turno no está.", 404);
    const block = await env.DB.prepare(
      "SELECT local_id FROM booking_blocks WHERE tenant_id = ?1 AND local_id = ?2",
    )
      .bind(tenantId, localId)
      .first<{ local_id: number }>();
    if (!block) return err("Ese turno todavía no llegó de la compu.", 404);
    await env.DB.prepare(
      "UPDATE booking_blocks SET status = ?1 WHERE tenant_id = ?2 AND local_id = ?3",
    )
      .bind(status, tenantId, localId)
      .run();
    const web = await env.DB.prepare(
      "SELECT id, status_seq, status FROM web_bookings WHERE tenant_id = ?1 AND local_id = ?2",
    )
      .bind(tenantId, localId)
      .first<{ id: string; status_seq: number; status: string }>();
    if (web) {
      if (web.status !== status) {
        await env.DB.prepare(
          `UPDATE web_bookings SET status = ?1, status_seq = status_seq + 1, updated_at = ?2
           WHERE tenant_id = ?3 AND id = ?4 AND status_seq = ?5`,
        )
          .bind(status, ts, tenantId, web.id, web.status_seq)
          .run();
      }
      return json({ ok: true });
    }
    await env.DB.prepare(
      `INSERT INTO booking_status_ops (id, tenant_id, local_id, status, acked, created_at)
       VALUES (?1, ?2, ?3, ?4, 0, ?5)`,
    )
      .bind(crypto.randomUUID().replace(/-/g, ""), tenantId, localId, status, ts)
      .run();
    return json({ ok: true });
  }
  return err("Ese turno no está.", 404);
}
