import type { PortalEnv } from "./portal";
import {
  cleanText,
  clientIp,
  err,
  json,
  loadWaiterCatalog,
  loadWaiterMenu,
  rateLimit,
  readLicenseBody,
  sha256Hex,
} from "./menu-portal";

/* ---------- Mozos desde el celular ---------- */

const MAX_WAITERS = 30;
const WAITER_TOKEN_RE = /^wq_[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_FLOOR_BYTES = 200_000;
const MAX_FLOOR_TABLES = 300;
const MAX_FLOOR_ITEMS = 80;
const MAX_COMMAND_BYTES = 8_000;
const MAX_COMMAND_LINES = 40;
const MAX_LINE_QTY = 99;
const COMMAND_LICENSE_HOURLY_LIMIT = 600;
const COMMAND_RETENTION_MS = 2 * 86_400_000;
const COMMAND_CLAIM_MS = 90_000;
const WAITER_ACTIVE_MS = 15 * 60_000;
const WAITER_SEEN_WRITE_MS = 60_000;
const WAITER_HISTORY_MS = 12 * 60 * 60_000;

type CommandKind = "open" | "order" | "prebill" | "attend";
type CommandStatus = "sent" | "received" | "printed" | "rejected";

interface WaiterRow {
  id: string;
  license_id: string;
  name: string;
  user_id: number | null;
  last_seen_at: string | null;
}

interface FloorItem {
  label: string;
  qty: number;
  total: number;
  status: "pending" | "new" | "sent";
  note: string | null;
}

interface FloorTable {
  number: number;
  name: string | null;
  zone: string | null;
  state: "free" | "busy" | "bill";
  guests: number | null;
  total: number;
  opened_at: string | null;
  waiter: string | null;
  calls: ("waiter" | "bill")[];
  items: FloorItem[];
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `wq_${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

function tokenHash(token: string): Promise<string> {
  return sha256Hex(`walqo-waiter|${token}`);
}

function money(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(Math.round(v * 100) / 100, 100_000_000)) : 0;
}

function sanitizeFloor(raw: unknown): FloorTable[] | null {
  if (!raw || typeof raw !== "object") return null;
  const list = (raw as Record<string, unknown>).tables;
  if (!Array.isArray(list)) return null;
  const seen = new Set<number>();
  const out: FloorTable[] = [];
  for (const t of list.slice(0, MAX_FLOOR_TABLES)) {
    if (!t || typeof t !== "object") continue;
    const r = t as Record<string, unknown>;
    const number = typeof r.number === "number" ? r.number : NaN;
    if (!Number.isInteger(number) || number < 1 || number > 9999 || seen.has(number)) continue;
    seen.add(number);
    const state = r.state === "busy" || r.state === "bill" ? r.state : "free";
    const guests = typeof r.guests === "number" && Number.isInteger(r.guests) && r.guests > 0 ? Math.min(r.guests, 999) : null;
    const calls = Array.isArray(r.calls)
      ? [...new Set(r.calls.filter((c): c is "waiter" | "bill" => c === "waiter" || c === "bill"))]
      : [];
    const items: FloorItem[] = [];
    if (state !== "free" && Array.isArray(r.items)) {
      for (const it of r.items.slice(0, MAX_FLOOR_ITEMS)) {
        if (!it || typeof it !== "object") continue;
        const i = it as Record<string, unknown>;
        const label = cleanText(i.label, 120);
        if (!label) continue;
        items.push({
          label,
          qty: typeof i.qty === "number" && Number.isFinite(i.qty) ? Math.max(0, Math.min(i.qty, 9999)) : 1,
          total: money(i.total),
          status: i.status === "pending" || i.status === "new" ? i.status : "sent",
          note: cleanText(i.note, 120) || null,
        });
      }
    }
    out.push({
      number,
      name: cleanText(r.name, 40) || null,
      zone: cleanText(r.zone, 30) || null,
      state,
      guests: state === "free" ? null : guests,
      total: state === "free" ? 0 : money(r.total),
      opened_at: state === "free" ? null : cleanText(r.opened_at, 25) || null,
      waiter: state === "free" ? null : cleanText(r.waiter, 40) || null,
      calls,
      items,
    });
  }
  return out;
}

async function activeWaiters(env: PortalEnv, licenseId: string) {
  const rows = await env.DB.prepare(
    `SELECT id, name, user_id, created_at, last_seen_at FROM menu_portal_waiters
     WHERE license_id = ?1 AND revoked_at IS NULL ORDER BY created_at ASC, id ASC`,
  )
    .bind(licenseId)
    .all<{ id: string; name: string; user_id: number | null; created_at: string; last_seen_at: string | null }>();
  return rows.results ?? [];
}

/** La PC vincula, lista o desvincula los celulares de los mozos. El enlace se ve una sola vez. */
export async function handleMenuPortalWaitersManage(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const auth = await readLicenseBody(req, env, origin);
  if (auth instanceof Response) return auth;
  const { licenseId, body } = auth;
  const op = body.op;

  if (op === "create") {
    const name = cleanText(body.name, 40);
    if (name.length < 2) return err("Escribí el nombre del mozo.", "bad_name", 400, origin);
    const userId =
      typeof body.user_id === "number" && Number.isInteger(body.user_id) && body.user_id > 0 ? body.user_id : null;
    const current = await activeWaiters(env, licenseId);
    if (current.length >= MAX_WAITERS) {
      return err(`Llegaste a ${MAX_WAITERS} celulares de mozos. Desvinculá alguno.`, "too_many", 409, origin);
    }
    const token = randomToken();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO menu_portal_waiters (id, license_id, token_hash, name, user_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
      .bind(id, licenseId, await tokenHash(token), name, userId, now)
      .run();
    return json(
      { ok: true, token, waiter: { id, name, user_id: userId, created_at: now, last_seen_at: null } },
      200,
      origin,
    );
  }

  if (op === "revoke") {
    const id = typeof body.id === "string" && UUID_RE.test(body.id) ? body.id : "";
    if (!id) return err("Falta el mozo.", "bad_request", 400, origin);
    await env.DB.prepare(
      `UPDATE menu_portal_waiters SET revoked_at = ?1 WHERE id = ?2 AND license_id = ?3 AND revoked_at IS NULL`,
    )
      .bind(new Date().toISOString(), id, licenseId)
      .run();
  } else if (op !== "list") {
    return err("Acción inválida.", "bad_request", 400, origin);
  }
  return json({ ok: true, waiters: await activeWaiters(env, licenseId) }, 200, origin);
}

/**
 * La PC publica el salón (si cambió o cada minuto), confirma lo que ya anotó y baja las comandas nuevas.
 * Si hay dos PCs, cada comanda la toma una sola por 90 segundos.
 */
export async function handleMenuPortalWaitersSync(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const auth = await readLicenseBody(req, env, origin, { key: "menu-waiters-pc", limit: 40 });
  if (auth instanceof Response) return auth;
  const { licenseId, body } = auth;
  const machineId = typeof body.machine_id === "string" ? body.machine_id.slice(0, 80) : "";
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  if (body.floor !== undefined && body.floor !== null) {
    const tables = sanitizeFloor(body.floor);
    if (!tables) return err("Salón inválido.", "bad_floor", 400, origin);
    const floorJson = JSON.stringify({ tables });
    if (floorJson.length > MAX_FLOOR_BYTES) return err("El salón es demasiado grande.", "too_large", 413, origin);
    await env.DB.prepare(
      `INSERT INTO menu_portal_floor (license_id, floor_json, machine_id, updated_at, seen_at)
       VALUES (?1, ?2, ?3, ?4, ?4)
       ON CONFLICT(license_id) DO UPDATE SET
         floor_json = excluded.floor_json, machine_id = excluded.machine_id,
         updated_at = excluded.updated_at, seen_at = excluded.seen_at`,
    )
      .bind(licenseId, floorJson, machineId, nowIso)
      .run();
  }

  const acks = Array.isArray(body.acks) ? body.acks.slice(0, 50) : [];
  for (const a of acks) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    const id = typeof r.id === "string" && UUID_RE.test(r.id) ? r.id : "";
    const status: CommandStatus | null =
      r.status === "received" || r.status === "printed" || r.status === "rejected" ? r.status : null;
    if (!id || !status) continue;
    const from = status === "received" ? "('sent')" : "('sent', 'received')";
    await env.DB.prepare(
      `UPDATE menu_portal_waiter_commands SET status = ?1, result_note = ?2, updated_at = ?3
       WHERE license_id = ?4 AND id = ?5 AND status IN ${from}`,
    )
      .bind(status, cleanText(r.note, 200) || null, nowIso, licenseId, id)
      .run();
  }

  if (Math.random() < 0.05) {
    await env.DB.prepare(`DELETE FROM menu_portal_waiter_commands WHERE license_id = ?1 AND created_at < ?2`)
      .bind(licenseId, new Date(now - COMMAND_RETENTION_MS).toISOString())
      .run();
  }

  const rows = await env.DB.prepare(
    `SELECT c.id, c.waiter_id, c.table_number, c.kind, c.payload_json, c.created_at,
            w.name AS waiter_name, w.user_id AS waiter_user_id
     FROM menu_portal_waiter_commands c
     LEFT JOIN menu_portal_waiters w ON w.id = c.waiter_id
     WHERE c.license_id = ?1 AND c.status = 'sent'
       AND (c.claimed_by IS NULL OR c.claimed_by = ?2 OR c.claimed_at < ?3)
     ORDER BY c.created_at ASC
     LIMIT 30`,
  )
    .bind(licenseId, machineId, new Date(now - COMMAND_CLAIM_MS).toISOString())
    .all<{
      id: string;
      waiter_id: string;
      table_number: number;
      kind: CommandKind;
      payload_json: string | null;
      created_at: string;
      waiter_name: string | null;
      waiter_user_id: number | null;
    }>();
  const list = rows.results ?? [];
  if (list.length > 0) {
    await env.DB.prepare(
      `UPDATE menu_portal_waiter_commands SET claimed_by = ?1, claimed_at = ?2
       WHERE license_id = ?3 AND id IN (SELECT value FROM json_each(?4))`,
    )
      .bind(machineId, nowIso, licenseId, JSON.stringify(list.map((c) => c.id)))
      .run();
  }
  const commands = list.map((c) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = c.payload_json ? (JSON.parse(c.payload_json) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
    return {
      id: c.id,
      kind: c.kind,
      table_number: c.table_number,
      waiter_id: c.waiter_id,
      waiter_name: c.waiter_name ?? "Mozo",
      waiter_user_id: c.waiter_user_id,
      created_at: c.created_at,
      ...payload,
    };
  });

  const waiters = await activeWaiters(env, licenseId);
  const activeSince = new Date(now - WAITER_ACTIVE_MS).toISOString();
  return json(
    {
      ok: true,
      commands,
      waiters: waiters.map((w) => ({ id: w.id, name: w.name, created_at: w.created_at, last_seen_at: w.last_seen_at })),
      active: waiters.filter((w) => w.last_seen_at && w.last_seen_at >= activeSince).length,
    },
    200,
    origin,
  );
}

/* ---------- Celular del mozo ---------- */

async function waiterAuth(req: Request, env: PortalEnv, origin: string | null): Promise<WaiterRow | Response> {
  const ip = clientIp(req);
  if (!rateLimit(`waiter-ip:${ip}`, 240, 60_000)) {
    return err("Demasiadas consultas. Esperá un momento.", "rate_limited", 429, origin);
  }
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!WAITER_TOKEN_RE.test(token)) {
    if (!rateLimit(`waiter-bad:${ip}`, 30, 10 * 60_000)) {
      return err("Demasiados intentos. Esperá unos minutos.", "rate_limited", 429, origin);
    }
    return err("Este celular no está vinculado. Pedile el enlace al encargado.", "unlinked", 401, origin);
  }
  const hash = await tokenHash(token);
  if (!rateLimit(`waiter:${hash.slice(0, 16)}`, 40, 60_000)) {
    return err("Demasiadas consultas. Esperá un momento.", "rate_limited", 429, origin);
  }
  const row = await env.DB.prepare(
    `SELECT w.id, w.license_id, w.name, w.user_id, w.last_seen_at
     FROM menu_portal_waiters w JOIN licenses l ON l.id = w.license_id
     WHERE w.token_hash = ?1 AND w.revoked_at IS NULL AND l.revoked = 0`,
  )
    .bind(hash)
    .first<WaiterRow>();
  if (!row) {
    if (!rateLimit(`waiter-bad:${ip}`, 30, 10 * 60_000)) {
      return err("Demasiados intentos. Esperá unos minutos.", "rate_limited", 429, origin);
    }
    return err("Este celular se desvinculó. Pedile un enlace nuevo al encargado.", "unlinked", 401, origin);
  }
  const now = Date.now();
  if (!row.last_seen_at || now - Date.parse(row.last_seen_at) > WAITER_SEEN_WRITE_MS) {
    await env.DB.prepare(`UPDATE menu_portal_waiters SET last_seen_at = ?1 WHERE id = ?2`)
      .bind(new Date(now).toISOString(), row.id)
      .run();
  }
  return row;
}

async function loadFloor(env: PortalEnv, licenseId: string) {
  const row = await env.DB.prepare(`SELECT floor_json, updated_at, seen_at FROM menu_portal_floor WHERE license_id = ?1`)
    .bind(licenseId)
    .first<{ floor_json: string; updated_at: string; seen_at: string }>();
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.floor_json) as { tables?: FloorTable[] };
    return { tables: Array.isArray(parsed.tables) ? parsed.tables : [], updated_at: row.updated_at, seen_at: row.seen_at };
  } catch {
    return { tables: [] as FloorTable[], updated_at: row.updated_at, seen_at: row.seen_at };
  }
}

/** Salón, estado de la caja y las comandas recientes de este mozo. */
export async function handleWaiterState(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const waiter = await waiterAuth(req, env, origin);
  if (waiter instanceof Response) return waiter;
  const [floor, biz, cmds] = await Promise.all([
    loadFloor(env, waiter.license_id),
    env.DB.prepare(`SELECT business_name FROM menu_portal_snapshots WHERE license_id = ?1`)
      .bind(waiter.license_id)
      .first<{ business_name: string | null }>(),
    env.DB.prepare(
      `SELECT id, table_number, kind, payload_json, status, result_note, created_at, updated_at
       FROM menu_portal_waiter_commands
       WHERE license_id = ?1 AND waiter_id = ?2 AND created_at >= ?3
       ORDER BY created_at DESC LIMIT 40`,
    )
      .bind(waiter.license_id, waiter.id, new Date(Date.now() - WAITER_HISTORY_MS).toISOString())
      .all<{
        id: string;
        table_number: number;
        kind: string;
        payload_json: string | null;
        status: string;
        result_note: string | null;
        created_at: string;
        updated_at: string;
      }>(),
  ]);
  const commands = (cmds.results ?? []).map((c) => {
    let items: { name: string; qty: number }[] = [];
    try {
      const p = c.payload_json ? (JSON.parse(c.payload_json) as { items?: { name: string; qty: number }[] }) : {};
      items = (p.items ?? []).map((i) => ({ name: i.name, qty: i.qty }));
    } catch {
      items = [];
    }
    return {
      id: c.id,
      table_number: c.table_number,
      kind: c.kind,
      status: c.status,
      note: c.result_note,
      items,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
  });
  return json(
    {
      ok: true,
      now: new Date().toISOString(),
      business_name: biz?.business_name || "Mi local",
      waiter: { name: waiter.name },
      pc: floor ? { seen_at: floor.seen_at, updated_at: floor.updated_at } : null,
      tables: floor?.tables ?? [],
      commands,
    },
    200,
    origin,
  );
}

/** Carta publicada (los mismos productos y precios de la tienda web). */
export async function handleWaiterMenu(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const waiter = await waiterAuth(req, env, origin);
  if (waiter instanceof Response) return waiter;
  const menu = await loadWaiterMenu(env, waiter.license_id);
  if (!menu) {
    return err("La carta no está publicada. Pedile al encargado que prenda la tienda web.", "no_menu", 404, origin);
  }
  return json({ ok: true, ...menu }, 200, origin);
}

/**
 * Comanda del mozo: abrir mesa, pedido, pre-cuenta o aviso atendido.
 * El id lo arma el celular y se reintenta con el mismo: llegar dos veces no duplica.
 */
export async function handleWaiterCommand(req: Request, env: PortalEnv): Promise<Response> {
  const origin = req.headers.get("origin");
  const waiter = await waiterAuth(req, env, origin);
  if (waiter instanceof Response) return waiter;
  if (!rateLimit(`waiter-cmd:${waiter.id}`, 20, 60_000)) {
    return err("Mandaste muchas comandas seguidas. Esperá un momento.", "rate_limited", 429, origin);
  }
  const text = await req.text();
  if (text.length > MAX_COMMAND_BYTES) return err("La comanda es demasiado larga.", "too_large", 413, origin);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("bad");
    body = parsed as Record<string, unknown>;
  } catch {
    return err("Comanda inválida.", "bad_json", 400, origin);
  }
  const id = typeof body.id === "string" ? body.id.toLowerCase() : "";
  if (!UUID_RE.test(id)) return err("Comanda inválida.", "bad_request", 400, origin);
  const kind: CommandKind | null =
    body.kind === "open" || body.kind === "order" || body.kind === "prebill" || body.kind === "attend"
      ? body.kind
      : null;
  if (!kind) return err("Comanda inválida.", "bad_request", 400, origin);
  const table = typeof body.table === "number" ? body.table : NaN;
  if (!Number.isInteger(table) || table < 1 || table > 9999) return err("Elegí una mesa.", "bad_table", 400, origin);

  const existing = await env.DB.prepare(
    `SELECT status FROM menu_portal_waiter_commands WHERE license_id = ?1 AND id = ?2`,
  )
    .bind(waiter.license_id, id)
    .first<{ status: string }>();
  if (existing) return json({ ok: true, command: { id, status: existing.status } }, 200, origin);

  const floor = await loadFloor(env, waiter.license_id);
  if (!floor || !floor.tables.some((t) => t.number === table)) {
    return err("Esa mesa no está en el salón. Actualizá la pantalla.", "bad_table", 404, origin);
  }

  const payload: Record<string, unknown> = {};
  const guests = typeof body.guests === "number" && Number.isInteger(body.guests) ? body.guests : null;
  if (guests !== null && (guests < 0 || guests > 99)) return err("Revisá los comensales.", "bad_guests", 400, origin);
  if (guests) payload.guests = guests;

  if (kind === "order") {
    const raw = Array.isArray(body.items) ? body.items : [];
    if (raw.length === 0) return err("La comanda está vacía.", "empty", 400, origin);
    if (raw.length > MAX_COMMAND_LINES) return err("La comanda tiene demasiados productos.", "too_many_lines", 400, origin);
    const catalog = await loadWaiterCatalog(env, waiter.license_id);
    if (!catalog) return err("La carta no está publicada.", "no_menu", 404, origin);
    const items: { id: number; name: string; qty: number; price: number; note: string | null; cook: string | null }[] = [];
    for (const it of raw) {
      if (!it || typeof it !== "object") continue;
      const r = it as Record<string, unknown>;
      const pid = typeof r.id === "number" && Number.isInteger(r.id) ? r.id : 0;
      const qty = typeof r.qty === "number" && Number.isInteger(r.qty) ? r.qty : 0;
      if (qty < 1 || qty > MAX_LINE_QTY) return err("Revisá las cantidades.", "bad_qty", 400, origin);
      const p = catalog.get(pid);
      if (!p) {
        return err("Algún producto ya no está en la carta. Actualizá la carta y armá la comanda de nuevo.", "missing_items", 409, origin);
      }
      items.push({
        id: pid,
        name: p.name,
        qty,
        price: p.price,
        note: cleanText(r.note, 120) || null,
        cook: r.cook === "Frita" || r.cook === "Al horno" ? r.cook : null,
      });
    }
    if (items.length === 0) return err("La comanda está vacía.", "empty", 400, origin);
    payload.items = items;
    const note = cleanText(body.note, 200);
    if (note) payload.note = note;
  }

  const sinceHour = new Date(Date.now() - 60 * 60_000).toISOString();
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM menu_portal_waiter_commands WHERE license_id = ?1 AND created_at >= ?2`,
  )
    .bind(waiter.license_id, sinceHour)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= COMMAND_LICENSE_HOURLY_LIMIT) {
    return err("El local tiene muchas comandas ahora. Cargalo desde la caja.", "busy", 429, origin);
  }

  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO menu_portal_waiter_commands
       (license_id, id, waiter_id, table_number, kind, payload_json, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'sent', ?7, ?7)`,
  )
    .bind(waiter.license_id, id, waiter.id, table, kind, JSON.stringify(payload), nowIso)
    .run();
  return json({ ok: true, command: { id, status: "sent" } }, 200, origin);
}
