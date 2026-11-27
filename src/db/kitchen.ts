import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

export type KitchenStatus = "pending" | "preparing" | "ready" | "delivered" | "voided";

const STATUS_RANK: Record<KitchenStatus, number> = {
  pending: 0,
  preparing: 1,
  ready: 2,
  delivered: 3,
  voided: 4,
};

const ACTIVE_STATUSES: KitchenStatus[] = ["pending", "preparing", "ready"];

export interface KitchenStation {
  id: number;
  name: string;
  sort_order: number;
  active: number;
  created_at: string;
}

export type KitchenTicketSource = "table" | "pos";

export interface KitchenTicketItem {
  id: number;
  ticket_id: number;
  table_order_item_id: number | null;
  product_id: number;
  label: string;
  qty: number;
  modifiers_json: string | null;
  cook: string | null;
  note: string | null;
  status: KitchenStatus;
  created_at: string;
  started_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  /** Minutos de prep del producto (products.duration_min); null si no está cargado. */
  duration_min: number | null;
}

export interface KitchenTicket {
  id: number;
  order_id: number | null;
  sale_id: number | null;
  source: KitchenTicketSource;
  round: number;
  station_id: number;
  station_name: string;
  table_id: number | null;
  table_number: number | null;
  table_name: string | null;
  table_zone: string | null;
  waiter_user_id: number | null;
  waiter_label: string | null;
  status: KitchenStatus;
  created_at: string;
  started_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  items: KitchenTicketItem[];
}

export interface KitchenSaleLineInput {
  product_id: number;
  label: string;
  qty: number;
  modifiers_json?: string | null;
  cook?: string | null;
  note?: string | null;
}

export interface KitchenTicketStats {
  pending: number;
  preparing: number;
  ready: number;
  delivered_today: number;
  avg_prep_seconds: number | null;
}

export interface ReadyFoodAlert {
  ticket_id: number;
  table_number: number | null;
  table_name: string | null;
  sale_id: number | null;
  source: KitchenTicketSource;
  round: number;
  station_name: string;
  ready_at: string;
}

function emitKitchenChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("walqo-kitchen-changed"));
  window.dispatchEvent(new CustomEvent("walqo:tables-changed"));
}

function canAdvance(from: KitchenStatus, to: KitchenStatus): boolean {
  if (to === "voided") return from !== "voided" && from !== "delivered";
  if (from === "voided" || from === "delivered") return false;
  return STATUS_RANK[to] >= STATUS_RANK[from];
}

function aggregateTicketStatus(itemStatuses: KitchenStatus[]): KitchenStatus {
  if (itemStatuses.length === 0) return "voided";
  if (itemStatuses.every((s) => s === "voided")) return "voided";
  const live = itemStatuses.filter((s) => s !== "voided");
  if (live.every((s) => s === "delivered")) return "delivered";
  if (live.some((s) => s === "pending")) return "pending";
  if (live.some((s) => s === "preparing")) return "preparing";
  if (live.some((s) => s === "ready")) return "ready";
  return "delivered";
}

function statusTimestamps(status: KitchenStatus): { col: string; sql: string }[] {
  if (status === "preparing") return [{ col: "started_at", sql: "COALESCE(started_at, datetime('now','localtime'))" }];
  if (status === "ready") {
    return [
      { col: "started_at", sql: "COALESCE(started_at, datetime('now','localtime'))" },
      { col: "ready_at", sql: "datetime('now','localtime')" },
    ];
  }
  if (status === "delivered") {
    return [
      { col: "started_at", sql: "COALESCE(started_at, datetime('now','localtime'))" },
      { col: "ready_at", sql: "COALESCE(ready_at, datetime('now','localtime'))" },
      { col: "delivered_at", sql: "datetime('now','localtime')" },
    ];
  }
  return [];
}

export async function listKitchenStations(opts?: { includeInactive?: boolean }): Promise<KitchenStation[]> {
  const db = await getDb();
  const where = opts?.includeInactive ? "" : "WHERE active = 1";
  return db.select<KitchenStation[]>(
    `SELECT id, name, sort_order, active, created_at
     FROM kitchen_stations ${where}
     ORDER BY sort_order, id`,
  );
}

export async function saveKitchenStation(input: {
  id?: number;
  name: string;
  active?: boolean;
}): Promise<number> {
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new Error("Poné un nombre para la estación.");
  return withImmediateTransaction(async () => {
    const db = await getDb();
    if (input.id) {
      await db.execute(
        `UPDATE kitchen_stations SET name = $1, active = $2 WHERE id = $3`,
        [name, input.active === false ? 0 : 1, input.id],
      );
      return input.id;
    }
    const max = await db.select<{ m: number | null }[]>(
      "SELECT MAX(sort_order) AS m FROM kitchen_stations",
    );
    const res = await db.execute(
      `INSERT INTO kitchen_stations (name, sort_order, active) VALUES ($1, $2, 1)`,
      [name, (max[0]?.m ?? -1) + 1],
    );
    return res.lastInsertId as number;
  });
}

export async function reorderKitchenStations(ids: number[]): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    let order = 0;
    for (const id of ids) {
      await db.execute("UPDATE kitchen_stations SET sort_order = $1 WHERE id = $2", [order++, id]);
    }
  });
}

export async function setProductKitchenStation(
  productId: number,
  stationId: number | null,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE products SET kitchen_station_id = $1 WHERE id = $2", [stationId, productId]);
}

export async function setCategoryKitchenStation(
  categoryId: number,
  stationId: number | null,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE categories SET kitchen_station_id = $1 WHERE id = $2", [
    stationId,
    categoryId,
  ]);
}

async function defaultStationId(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM kitchen_stations WHERE active = 1 ORDER BY sort_order, id LIMIT 1",
  );
  if (rows[0]) return rows[0].id;
  const any = await db.select<{ id: number }[]>("SELECT id FROM kitchen_stations ORDER BY id LIMIT 1");
  if (any[0]) return any[0].id;
  const res = await db.execute(
    "INSERT INTO kitchen_stations (name, sort_order, active) VALUES ('Cocina', 0, 1)",
  );
  return res.lastInsertId as number;
}

/** product.kitchen_station_id ?? category.kitchen_station_id ?? default */
export async function resolveProductStationId(productId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ station: number | null; cat_station: number | null }[]>(
    `SELECT p.kitchen_station_id AS station, c.kitchen_station_id AS cat_station
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.id = $1`,
    [productId],
  );
  return rows[0]?.station ?? rows[0]?.cat_station ?? (await defaultStationId());
}

export async function stationNameById(stationId: number): Promise<string> {
  const db = await getDb();
  const rows = await db.select<{ name: string }[]>(
    "SELECT name FROM kitchen_stations WHERE id = $1",
    [stationId],
  );
  return rows[0]?.name ?? "Cocina";
}

export interface KitchenStationPrintGroup {
  stationId: number;
  stationName: string;
  itemIds: number[];
}

/**
 * Crea o completa tickets KDS para los ítems recién marcados `sent`.
 * Debe correr dentro de la misma TX que `sendTableOrderToKitchen`.
 * Devuelve grupos por estación (para imprimir una comanda por estación).
 */
export async function createKitchenTicketsForRound(
  orderId: number,
  round: number,
  itemIds: number[],
): Promise<KitchenStationPrintGroup[]> {
  if (itemIds.length === 0 || round <= 0) return [];
  const db = await getDb();
  const orderRows = await db.select<
    {
      table_id: number;
      waiter_user_id: number | null;
      waiter_label: string | null;
      waiter_name: string | null;
    }[]
  >(
    `SELECT o.table_id, o.waiter_user_id, o.waiter_label,
            COALESCE(u.display_name, o.waiter_label) AS waiter_name
     FROM table_orders o
     LEFT JOIN users u ON u.id = o.waiter_user_id
     WHERE o.id = $1`,
    [orderId],
  );
  const order = orderRows[0];
  if (!order) return [];

  const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(",");
  const items = await db.select<
    {
      id: number;
      product_id: number;
      label: string;
      qty: number;
      modifiers_json: string | null;
      cook: string | null;
      note: string | null;
      kitchen_station_id: number | null;
      category_station_id: number | null;
    }[]
  >(
    `SELECT i.id, i.product_id, i.label, i.qty, i.modifiers_json, i.cook, i.note,
            p.kitchen_station_id, c.kitchen_station_id AS category_station_id
     FROM table_order_items i
     LEFT JOIN products p ON p.id = i.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE i.id IN (${placeholders})`,
    itemIds,
  );
  if (items.length === 0) return [];

  const fallbackStation = await defaultStationId();
  const byStation = new Map<number, typeof items>();
  for (const item of items) {
    const stationId = item.kitchen_station_id ?? item.category_station_id ?? fallbackStation;
    const list = byStation.get(stationId) ?? [];
    list.push(item);
    byStation.set(stationId, list);
  }

  const waiterLabel = order.waiter_name ?? order.waiter_label ?? null;
  const groups: KitchenStationPrintGroup[] = [];

  for (const [stationId, stationItems] of byStation) {
    const existing = await db.select<{ id: number }[]>(
      `SELECT id FROM kitchen_tickets
       WHERE order_id = $1 AND round = $2 AND station_id = $3 AND source = 'table'`,
      [orderId, round, stationId],
    );
    let ticketId = existing[0]?.id;
    if (!ticketId) {
      const res = await db.execute(
        `INSERT INTO kitchen_tickets
           (order_id, sale_id, source, round, station_id, table_id, waiter_user_id, waiter_label, status)
         VALUES ($1, NULL, 'table', $2, $3, $4, $5, $6, 'pending')`,
        [orderId, round, stationId, order.table_id, order.waiter_user_id, waiterLabel],
      );
      ticketId = res.lastInsertId as number;
    } else {
      await db.execute(
        `UPDATE kitchen_tickets SET status = 'pending', waiter_user_id = COALESCE($1, waiter_user_id),
         waiter_label = COALESCE($2, waiter_label)
         WHERE id = $3 AND status IN ('ready', 'delivered')`,
        [order.waiter_user_id, waiterLabel, ticketId],
      );
    }

    for (const item of stationItems) {
      const dup = await db.select<{ id: number }[]>(
        "SELECT id FROM kitchen_ticket_items WHERE table_order_item_id = $1",
        [item.id],
      );
      if (dup[0]) continue;
      await db.execute(
        `INSERT INTO kitchen_ticket_items
           (ticket_id, table_order_item_id, product_id, label, qty, modifiers_json, cook, note, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
        [
          ticketId,
          item.id,
          item.product_id,
          item.label,
          item.qty,
          item.modifiers_json,
          item.cook,
          item.note,
        ],
      );
    }
    groups.push({
      stationId,
      stationName: await stationNameById(stationId),
      itemIds: stationItems.map((i) => i.id),
    });
  }
  return groups;
}

/**
 * Tickets KDS para una venta de mostrador. Puede correr fuera de TX de venta.
 * Devuelve estaciones tocadas (para impresión por estación).
 */
export async function createKitchenTicketsForSale(
  saleId: number,
  lines: KitchenSaleLineInput[],
  opts?: { waiterLabel?: string | null },
): Promise<{ stationId: number; stationName: string; lines: KitchenSaleLineInput[] }[]> {
  if (lines.length === 0) return [];
  const groups = await withImmediateTransaction(async () => {
    const db = await getDb();
    const fallbackStation = await defaultStationId();
    const byStation = new Map<number, KitchenSaleLineInput[]>();
    for (const line of lines) {
      const stationId =
        line.product_id > 0 ? await resolveProductStationId(line.product_id) : fallbackStation;
      const list = byStation.get(stationId) ?? [];
      list.push(line);
      byStation.set(stationId, list);
    }
    const out: { stationId: number; stationName: string; lines: KitchenSaleLineInput[] }[] = [];
    for (const [stationId, stationLines] of byStation) {
      const existing = await db.select<{ id: number }[]>(
        `SELECT id FROM kitchen_tickets WHERE sale_id = $1 AND station_id = $2 AND source = 'pos'`,
        [saleId, stationId],
      );
      let ticketId = existing[0]?.id;
      if (!ticketId) {
        const res = await db.execute(
          `INSERT INTO kitchen_tickets
             (order_id, sale_id, source, round, station_id, table_id, waiter_user_id, waiter_label, status)
           VALUES (NULL, $1, 'pos', 1, $2, NULL, NULL, $3, 'pending')`,
          [saleId, stationId, opts?.waiterLabel ?? "Mostrador"],
        );
        ticketId = res.lastInsertId as number;
      }
      for (const line of stationLines) {
        await db.execute(
          `INSERT INTO kitchen_ticket_items
             (ticket_id, table_order_item_id, product_id, label, qty, modifiers_json, cook, note, status)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, 'pending')`,
          [
            ticketId,
            line.product_id,
            line.label,
            line.qty,
            line.modifiers_json ?? null,
            line.cook ?? null,
            line.note ?? null,
          ],
        );
      }
      out.push({
        stationId,
        stationName: await stationNameById(stationId),
        lines: stationLines,
      });
    }
    return out;
  });
  emitKitchenChanged();
  return groups;
}

export async function finalizeKitchenTicketsForSale(saleId: number): Promise<void> {
  const db = await getDb();
  const tickets = await db.select<{ id: number }[]>(
    `SELECT id FROM kitchen_tickets
     WHERE sale_id = $1 AND status IN ('pending','preparing','ready')`,
    [saleId],
  );
  if (tickets.length === 0) return;
  for (const t of tickets) {
    const items = await db.select<{ id: number; status: KitchenStatus }[]>(
      "SELECT id, status FROM kitchen_ticket_items WHERE ticket_id = $1",
      [t.id],
    );
    for (const item of items) {
      if (item.status === "voided" || item.status === "delivered") continue;
      const next: KitchenStatus = item.status === "ready" ? "delivered" : "voided";
      const stamps = statusTimestamps(next);
      const sets = [`status = $1`, ...stamps.map((s) => `${s.col} = ${s.sql}`)];
      await db.execute(`UPDATE kitchen_ticket_items SET ${sets.join(", ")} WHERE id = $2`, [next, item.id]);
    }
    await refreshTicketStatus(t.id);
  }
  emitKitchenChanged();
}

async function refreshTicketStatus(ticketId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ status: KitchenStatus }[]>(
    "SELECT status FROM kitchen_ticket_items WHERE ticket_id = $1",
    [ticketId],
  );
  const next = aggregateTicketStatus(rows.map((r) => r.status));
  const stamps = statusTimestamps(next);
  const sets = [`status = $1`, ...stamps.map((s) => `${s.col} = ${s.sql}`)];
  await db.execute(`UPDATE kitchen_tickets SET ${sets.join(", ")} WHERE id = $2`, [next, ticketId]);
}

export async function setKitchenItemStatus(itemId: number, status: KitchenStatus): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ id: number; ticket_id: number; status: KitchenStatus }[]>(
      "SELECT id, ticket_id, status FROM kitchen_ticket_items WHERE id = $1",
      [itemId],
    );
    const row = rows[0];
    if (!row) return;
    if (!canAdvance(row.status, status)) {
      throw new Error("Ese plato ya pasó de ese estado.");
    }
    const stamps = statusTimestamps(status);
    const sets = [`status = $1`, ...stamps.map((s) => `${s.col} = ${s.sql}`)];
    await db.execute(`UPDATE kitchen_ticket_items SET ${sets.join(", ")} WHERE id = $2`, [status, itemId]);
    await refreshTicketStatus(row.ticket_id);
  });
  emitKitchenChanged();
}

export async function setKitchenTicketStatus(ticketId: number, status: KitchenStatus): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const ticket = await db.select<{ id: number; status: KitchenStatus }[]>(
      "SELECT id, status FROM kitchen_tickets WHERE id = $1",
      [ticketId],
    );
    if (!ticket[0]) return;
    if (!canAdvance(ticket[0].status, status) && status !== "voided") {
      throw new Error("Ese ticket ya pasó de ese estado.");
    }
    const items = await db.select<{ id: number; status: KitchenStatus }[]>(
      "SELECT id, status FROM kitchen_ticket_items WHERE ticket_id = $1",
      [ticketId],
    );
    const stamps = statusTimestamps(status);
    const itemSets = [`status = $1`, ...stamps.map((s) => `${s.col} = ${s.sql}`)];
    for (const item of items) {
      if (item.status === "voided") continue;
      if (status !== "voided" && STATUS_RANK[item.status] > STATUS_RANK[status]) continue;
      if (!canAdvance(item.status, status) && status !== "voided") continue;
      await db.execute(`UPDATE kitchen_ticket_items SET ${itemSets.join(", ")} WHERE id = $2`, [
        status,
        item.id,
      ]);
    }
    await refreshTicketStatus(ticketId);
  });
  emitKitchenChanged();
}

/**
 * Al cerrar o anular una cuenta: listos → delivered; el resto → voided.
 * Corre dentro de la TX de close/cancel.
 */
export async function finalizeKitchenTicketsForOrder(orderId: number): Promise<void> {
  const db = await getDb();
  const tickets = await db.select<{ id: number }[]>(
    `SELECT id FROM kitchen_tickets
     WHERE order_id = $1 AND status IN ('pending','preparing','ready')`,
    [orderId],
  );
  for (const t of tickets) {
    const items = await db.select<{ id: number; status: KitchenStatus }[]>(
      "SELECT id, status FROM kitchen_ticket_items WHERE ticket_id = $1",
      [t.id],
    );
    for (const item of items) {
      if (item.status === "voided" || item.status === "delivered") continue;
      const next: KitchenStatus = item.status === "ready" ? "delivered" : "voided";
      const stamps = statusTimestamps(next);
      const sets = [`status = $1`, ...stamps.map((s) => `${s.col} = ${s.sql}`)];
      await db.execute(`UPDATE kitchen_ticket_items SET ${sets.join(", ")} WHERE id = $2`, [next, item.id]);
    }
    await refreshTicketStatus(t.id);
  }
}

/** Anula la línea de cocina si se borra un ítem enviado de la mesa. */
export async function voidKitchenItemByTableOrderItem(tableOrderItemId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number; ticket_id: number; status: KitchenStatus }[]>(
    "SELECT id, ticket_id, status FROM kitchen_ticket_items WHERE table_order_item_id = $1",
    [tableOrderItemId],
  );
  const row = rows[0];
  if (!row || row.status === "voided" || row.status === "delivered") return;
  await db.execute(
    `UPDATE kitchen_ticket_items SET status = 'voided' WHERE id = $1`,
    [row.id],
  );
  await refreshTicketStatus(row.ticket_id);
}

/** Al cobrar (parcial o total) un ítem de mesa: lo marca entregado en cocina. */
export async function deliverKitchenItemByTableOrderItem(tableOrderItemId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number; ticket_id: number; status: KitchenStatus }[]>(
    "SELECT id, ticket_id, status FROM kitchen_ticket_items WHERE table_order_item_id = $1",
    [tableOrderItemId],
  );
  const row = rows[0];
  if (!row || row.status === "voided" || row.status === "delivered") return;
  const next: KitchenStatus = "delivered";
  const stamps = statusTimestamps(next);
  const sets = [`status = $1`, ...stamps.map((s) => `${s.col} = ${s.sql}`)];
  await db.execute(`UPDATE kitchen_ticket_items SET ${sets.join(", ")} WHERE id = $2`, [next, row.id]);
  await refreshTicketStatus(row.ticket_id);
}

export async function listKitchenTickets(opts?: {
  stationId?: number | null;
  source?: KitchenTicketSource | "all" | null;
  statuses?: KitchenStatus[];
  /** ISO-ish local date prefix, e.g. '2026-11-17' for historial del día. */
  since?: string | null;
  /** Si true, incluye delivered/voided del día (o since). Default: solo activos. */
  history?: boolean;
}): Promise<KitchenTicket[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts?.stationId != null) {
    params.push(opts.stationId);
    where.push(`t.station_id = $${params.length}`);
  }

  if (opts?.source === "table" || opts?.source === "pos") {
    params.push(opts.source);
    where.push(`t.source = $${params.length}`);
  }

  const statuses =
    opts?.statuses ??
    (opts?.history ? (["pending", "preparing", "ready", "delivered", "voided"] as KitchenStatus[]) : ACTIVE_STATUSES);

  if (statuses.length) {
    const ph = statuses.map((s) => {
      params.push(s);
      return `$${params.length}`;
    });
    where.push(`t.status IN (${ph.join(",")})`);
  }

  if (opts?.since) {
    params.push(opts.since);
    where.push(`t.created_at >= $${params.length}`);
  } else if (opts?.history) {
    where.push(`date(t.created_at) = date('now','localtime')`);
  }

  const sql = `
    SELECT t.id, t.order_id, t.sale_id, COALESCE(t.source, 'table') AS source, t.round,
           t.station_id, s.name AS station_name,
           t.table_id, dt.number AS table_number, dt.name AS table_name, dt.zone AS table_zone,
           t.waiter_user_id, t.waiter_label, t.status, t.created_at, t.started_at, t.ready_at, t.delivered_at
    FROM kitchen_tickets t
    JOIN kitchen_stations s ON s.id = t.station_id
    LEFT JOIN dining_tables dt ON dt.id = t.table_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY
      CASE t.status
        WHEN 'pending' THEN 0
        WHEN 'preparing' THEN 1
        WHEN 'ready' THEN 2
        WHEN 'delivered' THEN 3
        ELSE 4
      END,
      t.created_at ASC,
      t.id ASC`;

  const tickets = await db.select<Omit<KitchenTicket, "items">[]>(sql, params);
  if (tickets.length === 0) return [];

  const ids = tickets.map((t) => t.id);
  const ph = ids.map((_, i) => `$${i + 1}`).join(",");
  const items = await db.select<KitchenTicketItem[]>(
    `SELECT i.id, i.ticket_id, i.table_order_item_id, i.product_id, i.label, i.qty,
            i.modifiers_json, i.cook, i.note, i.status, i.created_at, i.started_at,
            i.ready_at, i.delivered_at,
            CASE
              WHEN p.duration_min IS NOT NULL AND p.duration_min > 0 THEN p.duration_min
              ELSE NULL
            END AS duration_min
     FROM kitchen_ticket_items i
     LEFT JOIN products p ON p.id = i.product_id
     WHERE i.ticket_id IN (${ph})
     ORDER BY i.id`,
    ids,
  );
  const byTicket = new Map<number, KitchenTicketItem[]>();
  for (const item of items) {
    const list = byTicket.get(item.ticket_id) ?? [];
    list.push(item);
    byTicket.set(item.ticket_id, list);
  }
  return tickets.map((t) => ({ ...t, items: byTicket.get(t.id) ?? [] }));
}

export async function kitchenTicketStats(): Promise<KitchenTicketStats> {
  const db = await getDb();
  const counts = await db.select<{ status: KitchenStatus; n: number }[]>(
    `SELECT status, COUNT(*) AS n FROM kitchen_tickets
     WHERE status IN ('pending','preparing','ready')
        OR (status = 'delivered' AND date(created_at) = date('now','localtime'))
     GROUP BY status`,
  );
  const map = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<KitchenStatus, number>>;
  const avg = await db.select<{ avg_sec: number | null }[]>(
    `SELECT AVG(
       (julianday(ready_at) - julianday(COALESCE(started_at, created_at))) * 86400
     ) AS avg_sec
     FROM kitchen_tickets
     WHERE status IN ('ready','delivered')
       AND ready_at IS NOT NULL
       AND date(created_at) = date('now','localtime')`,
  );
  return {
    pending: map.pending ?? 0,
    preparing: map.preparing ?? 0,
    ready: map.ready ?? 0,
    delivered_today: map.delivered ?? 0,
    avg_prep_seconds: avg[0]?.avg_sec != null ? Math.round(avg[0].avg_sec) : null,
  };
}

/** Tickets listos aún no entregados — para Mesas y el celular del mozo. */
export async function listReadyFoodAlerts(): Promise<ReadyFoodAlert[]> {
  const db = await getDb();
  return db.select<ReadyFoodAlert[]>(
    `SELECT t.id AS ticket_id, COALESCE(t.source, 'table') AS source, t.sale_id,
            dt.number AS table_number, dt.name AS table_name,
            t.round, s.name AS station_name, COALESCE(t.ready_at, t.created_at) AS ready_at
     FROM kitchen_tickets t
     LEFT JOIN dining_tables dt ON dt.id = t.table_id
     JOIN kitchen_stations s ON s.id = t.station_id
     WHERE t.status = 'ready'
     ORDER BY t.ready_at ASC, t.id ASC`,
  );
}
