import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";
import { roundMoney } from "../lib/discount";
import type { ProductModifier } from "./modifiers";

/** Mesa del salón. `number` es el que va impreso en el QR. */
export interface DiningTable {
  id: number;
  number: number;
  name: string | null;
  zone: string | null;
  sort_order: number;
}

export interface DiningTableDraft {
  id?: number;
  number: number;
  name: string;
  zone: string;
}

/** Cuenta abierta de una mesa, con lo que va sumando (sin lo que falta confirmar del QR). */
export interface OpenTableOrder {
  id: number;
  table_id: number;
  guests: number | null;
  waiter_user_id: number | null;
  waiter_name: string | null;
  note: string | null;
  bill_requested_at: string | null;
  opened_at: string;
  total: number;
  items: number;
  pending_items: number;
  new_items: number;
}

/** pending = llegó del QR y el personal no lo confirmó; new = falta mandarlo a cocina; sent = ya salió. */
export type TableItemStatus = "pending" | "new" | "sent";

export interface TableOrderItem {
  id: number;
  order_id: number;
  product_id: number;
  variant_id: number | null;
  label: string;
  unit_price: number;
  qty: number;
  modifiers: ProductModifier[];
  cook: string | null;
  note: string | null;
  status: TableItemStatus;
  source: "staff" | "qr" | "waiter";
  round: number | null;
  created_at: string;
}

export type TableCallKind = "waiter" | "bill";

export interface TableCall {
  id: number;
  table_id: number;
  kind: TableCallKind;
  created_at: string;
}

export interface TableItemInput {
  product_id: number;
  variant_id?: number | null;
  label: string;
  unit_price: number;
  qty: number;
  modifiers?: ProductModifier[];
  cook?: string | null;
  note?: string | null;
}

type ItemRow = Omit<TableOrderItem, "modifiers"> & { modifiers_json: string | null };

function parseItem(row: ItemRow): TableOrderItem {
  let modifiers: ProductModifier[] = [];
  try {
    modifiers = row.modifiers_json ? (JSON.parse(row.modifiers_json) as ProductModifier[]) : [];
  } catch {
    modifiers = [];
  }
  const { modifiers_json: _m, ...rest } = row;
  return { ...rest, modifiers };
}

export function tableLabel(t: Pick<DiningTable, "number" | "name">): string {
  return t.name?.trim() || `Mesa ${t.number}`;
}

export function tableItemTotal(i: Pick<TableOrderItem, "unit_price" | "qty">): number {
  return roundMoney(i.unit_price * i.qty);
}

export async function listDiningTables(): Promise<DiningTable[]> {
  const db = await getDb();
  return db.select<DiningTable[]>(
    `SELECT id, number, name, zone, sort_order FROM dining_tables
     WHERE active = 1 ORDER BY sort_order, number, id`,
  );
}

/** Guarda el salón completo. Una mesa con la cuenta abierta no se puede quitar. */
export async function saveDiningTables(drafts: DiningTableDraft[]): Promise<void> {
  const seen = new Set<number>();
  for (const d of drafts) {
    if (!Number.isInteger(d.number) || d.number < 1 || d.number > 9999) {
      throw new Error("Cada mesa necesita un número entre 1 y 9999.");
    }
    if (seen.has(d.number)) throw new Error(`La mesa ${d.number} está repetida.`);
    seen.add(d.number);
  }
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const current = await db.select<{ id: number; number: number; busy: number }[]>(
      `SELECT t.id, t.number,
              EXISTS(SELECT 1 FROM table_orders o WHERE o.table_id = t.id AND o.status = 'open') AS busy
       FROM dining_tables t WHERE t.active = 1`,
    );
    const keep = new Set(drafts.flatMap((d) => (d.id ? [d.id] : [])));
    for (const row of current) {
      if (keep.has(row.id)) continue;
      if (row.busy) throw new Error(`La mesa ${row.number} tiene la cuenta abierta. Cobrala antes de quitarla.`);
      await db.execute("UPDATE dining_tables SET active = 0 WHERE id = $1", [row.id]);
    }
    // Primero se corren los números para que el índice único no choque al intercambiar.
    for (const d of drafts) {
      if (d.id) await db.execute("UPDATE dining_tables SET number = -id WHERE id = $1", [d.id]);
    }
    let order = 0;
    for (const d of drafts) {
      const name = d.name.trim().slice(0, 40) || null;
      const zone = d.zone.trim().slice(0, 30) || null;
      if (d.id) {
        await db.execute(
          "UPDATE dining_tables SET number = $1, name = $2, zone = $3, sort_order = $4 WHERE id = $5",
          [d.number, name, zone, order++, d.id],
        );
      } else {
        await db.execute(
          "INSERT INTO dining_tables (number, name, zone, sort_order) VALUES ($1, $2, $3, $4)",
          [d.number, name, zone, order++],
        );
      }
    }
  });
}

export async function listOpenTableOrders(): Promise<OpenTableOrder[]> {
  const db = await getDb();
  return db.select<OpenTableOrder[]>(
    `SELECT o.id, o.table_id, o.guests, o.waiter_user_id, COALESCE(u.display_name, o.waiter_label) AS waiter_name, o.note,
            o.bill_requested_at, o.opened_at,
            COALESCE(SUM(CASE WHEN i.status IN ('new','sent') THEN ROUND(i.unit_price * i.qty, 2) END), 0) AS total,
            COALESCE(SUM(CASE WHEN i.status IN ('new','sent') THEN 1 END), 0) AS items,
            COALESCE(SUM(CASE WHEN i.status = 'pending' THEN 1 END), 0) AS pending_items,
            COALESCE(SUM(CASE WHEN i.status = 'new' THEN 1 END), 0) AS new_items
     FROM table_orders o
     LEFT JOIN users u ON u.id = o.waiter_user_id
     LEFT JOIN table_order_items i ON i.order_id = o.id
     WHERE o.status = 'open'
     GROUP BY o.id`,
  );
}

export async function listTableOrderItems(orderId: number): Promise<TableOrderItem[]> {
  const db = await getDb();
  const rows = await db.select<ItemRow[]>(
    `SELECT id, order_id, product_id, variant_id, label, unit_price, qty, modifiers_json, cook, note,
            status, source, round, created_at
     FROM table_order_items WHERE order_id = $1 ORDER BY id`,
    [orderId],
  );
  return rows.map(parseItem);
}

export async function getTableOrder(
  orderId: number,
): Promise<{ id: number; table_id: number; status: string; guests: number | null; table: DiningTable } | null> {
  const db = await getDb();
  const rows = await db.select<
    { id: number; table_id: number; status: string; guests: number | null; number: number; name: string | null; zone: string | null; sort_order: number }[]
  >(
    `SELECT o.id, o.table_id, o.status, o.guests, t.number, t.name, t.zone, t.sort_order
     FROM table_orders o JOIN dining_tables t ON t.id = o.table_id WHERE o.id = $1`,
    [orderId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    table_id: r.table_id,
    status: r.status,
    guests: r.guests,
    table: { id: r.table_id, number: r.number, name: r.name, zone: r.zone, sort_order: r.sort_order },
  };
}

export async function openTableOrder(
  tableId: number,
  opts: { guests?: number | null; waiterUserId?: number | null; waiterLabel?: string | null; userId?: number | null },
): Promise<number> {
  const db = await getDb();
  const open = await db.select<{ id: number }[]>(
    "SELECT id FROM table_orders WHERE table_id = $1 AND status = 'open'",
    [tableId],
  );
  if (open[0]) return open[0].id;
  const res = await db.execute(
    `INSERT INTO table_orders (table_id, guests, waiter_user_id, waiter_label, opened_by) VALUES ($1, $2, $3, $4, $5)`,
    [tableId, opts.guests ?? null, opts.waiterUserId ?? null, opts.waiterLabel ?? null, opts.userId ?? null],
  );
  return res.lastInsertId as number;
}

export async function updateTableOrder(
  orderId: number,
  patch: { guests?: number | null; waiterUserId?: number | null; note?: string | null },
): Promise<void> {
  const db = await getDb();
  if (patch.guests !== undefined) {
    await db.execute("UPDATE table_orders SET guests = $1 WHERE id = $2", [patch.guests, orderId]);
  }
  if (patch.waiterUserId !== undefined) {
    await db.execute("UPDATE table_orders SET waiter_user_id = $1, waiter_label = NULL WHERE id = $2", [
      patch.waiterUserId,
      orderId,
    ]);
  }
  if (patch.note !== undefined) {
    await db.execute("UPDATE table_orders SET note = $1 WHERE id = $2", [patch.note?.trim() || null, orderId]);
  }
}

export async function addTableOrderItem(
  orderId: number,
  item: TableItemInput,
  userId: number | null,
): Promise<void> {
  const db = await getDb();
  const modifiers = item.modifiers?.length ? JSON.stringify(item.modifiers) : null;
  // La misma línea todavía sin mandar a cocina suma cantidad en vez de repetirse.
  const same = await db.select<{ id: number }[]>(
    `SELECT id FROM table_order_items
     WHERE order_id = $1 AND status = 'new' AND product_id = $2 AND COALESCE(variant_id, 0) = $3
       AND COALESCE(modifiers_json, '') = $4 AND COALESCE(cook, '') = $5 AND COALESCE(note, '') = ''
       AND unit_price = $6
     LIMIT 1`,
    [orderId, item.product_id, item.variant_id ?? 0, modifiers ?? "", item.cook ?? "", item.unit_price],
  );
  if (same[0] && !item.note?.trim()) {
    await db.execute("UPDATE table_order_items SET qty = qty + $1 WHERE id = $2", [item.qty, same[0].id]);
    return;
  }
  await db.execute(
    `INSERT INTO table_order_items
       (order_id, product_id, variant_id, label, unit_price, qty, modifiers_json, cook, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      orderId,
      item.product_id,
      item.variant_id ?? null,
      item.label,
      roundMoney(item.unit_price),
      item.qty,
      modifiers,
      item.cook ?? null,
      item.note?.trim() || null,
      userId,
    ],
  );
}

/** Solo lo que todavía no salió a cocina. */
export async function setTableItemQty(itemId: number, qty: number): Promise<void> {
  const db = await getDb();
  if (qty <= 0) {
    await db.execute("DELETE FROM table_order_items WHERE id = $1 AND status != 'sent'", [itemId]);
    return;
  }
  await db.execute("UPDATE table_order_items SET qty = $1 WHERE id = $2 AND status != 'sent'", [qty, itemId]);
}

export async function setTableItemNote(itemId: number, note: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE table_order_items SET note = $1 WHERE id = $2 AND status != 'sent'", [
    note.trim().slice(0, 120) || null,
    itemId,
  ]);
}

export async function removeTableOrderItem(itemId: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM table_order_items WHERE id = $1", [itemId]);
}

export async function confirmPendingTableItems(orderId: number): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    "UPDATE table_order_items SET status = 'new' WHERE order_id = $1 AND status = 'pending'",
    [orderId],
  );
  return res.rowsAffected;
}

export async function rejectPendingTableItems(orderId: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM table_order_items WHERE order_id = $1 AND status = 'pending'", [orderId]);
}

/** Marca como enviados los ítems nuevos y devuelve esa ronda para la comanda. */
export async function sendTableOrderToKitchen(
  orderId: number,
): Promise<{ round: number; items: TableOrderItem[] }> {
  return withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<ItemRow[]>(
      `SELECT id, order_id, product_id, variant_id, label, unit_price, qty, modifiers_json, cook, note,
              status, source, round, created_at
       FROM table_order_items WHERE order_id = $1 AND status = 'new' ORDER BY id`,
      [orderId],
    );
    if (rows.length === 0) return { round: 0, items: [] };
    const last = await db.select<{ r: number | null }[]>(
      "SELECT MAX(round) AS r FROM table_order_items WHERE order_id = $1",
      [orderId],
    );
    const round = (last[0]?.r ?? 0) + 1;
    await db.execute(
      `UPDATE table_order_items SET status = 'sent', round = $1, sent_at = datetime('now','localtime')
       WHERE order_id = $2 AND status = 'new'`,
      [round, orderId],
    );
    return { round, items: rows.map(parseItem) };
  });
}

export async function markTableBillRequested(orderId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE table_orders SET bill_requested_at = COALESCE(bill_requested_at, datetime('now','localtime')) WHERE id = $1",
    [orderId],
  );
}

export async function moveTableOrder(orderId: number, targetTableId: number): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const busy = await db.select<{ id: number }[]>(
      "SELECT id FROM table_orders WHERE table_id = $1 AND status = 'open'",
      [targetTableId],
    );
    if (busy[0]) throw new Error("Esa mesa ya está ocupada. Elegí una libre.");
    const from = await db.select<{ table_id: number }[]>("SELECT table_id FROM table_orders WHERE id = $1", [orderId]);
    await db.execute("UPDATE table_orders SET table_id = $1 WHERE id = $2 AND status = 'open'", [targetTableId, orderId]);
    if (from[0]) {
      await db.execute("UPDATE table_calls SET table_id = $1 WHERE table_id = $2 AND done_at IS NULL", [
        targetTableId,
        from[0].table_id,
      ]);
    }
  });
}

/** Al cobrar: la venta ya quedó registrada por el punto de venta; la mesa se libera. */
export async function closeTableOrder(orderId: number, saleId: number): Promise<number | null> {
  return withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ table_id: number; number: number }[]>(
      `SELECT o.table_id, t.number FROM table_orders o JOIN dining_tables t ON t.id = o.table_id
       WHERE o.id = $1 AND o.status = 'open'`,
      [orderId],
    );
    const row = rows[0];
    if (!row) return null;
    await db.execute(
      `UPDATE table_orders SET status = 'closed', sale_id = $1, closed_at = datetime('now','localtime') WHERE id = $2`,
      [saleId, orderId],
    );
    await db.execute(
      "UPDATE table_calls SET done_at = datetime('now','localtime') WHERE table_id = $1 AND done_at IS NULL",
      [row.table_id],
    );
    return row.number;
  });
}

/** Libera la mesa sin venta (nadie consumió o se anuló la cuenta). */
export async function cancelTableOrder(orderId: number): Promise<number | null> {
  return withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ table_id: number; number: number }[]>(
      `SELECT o.table_id, t.number FROM table_orders o JOIN dining_tables t ON t.id = o.table_id
       WHERE o.id = $1 AND o.status = 'open'`,
      [orderId],
    );
    const row = rows[0];
    if (!row) return null;
    await db.execute(
      "UPDATE table_orders SET status = 'cancelled', closed_at = datetime('now','localtime') WHERE id = $1",
      [orderId],
    );
    await db.execute(
      "UPDATE table_calls SET done_at = datetime('now','localtime') WHERE table_id = $1 AND done_at IS NULL",
      [row.table_id],
    );
    return row.number;
  });
}

export async function listOpenTableCalls(): Promise<TableCall[]> {
  const db = await getDb();
  return db.select<TableCall[]>(
    "SELECT id, table_id, kind, created_at FROM table_calls WHERE done_at IS NULL ORDER BY id",
  );
}

export async function resolveTableCalls(tableId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE table_calls SET done_at = datetime('now','localtime') WHERE table_id = $1 AND done_at IS NULL",
    [tableId],
  );
}

/* ---------- Comandas del celular del mozo ---------- */

export type WaiterCommandStatus = "received" | "printed" | "rejected";

export interface WaiterCommandLog {
  status: WaiterCommandStatus;
  note: string | null;
}

export async function getWaiterCommandLog(remoteId: string): Promise<WaiterCommandLog | null> {
  const db = await getDb();
  const rows = await db.select<WaiterCommandLog[]>("SELECT status, note FROM waiter_commands WHERE remote_id = $1", [
    remoteId,
  ]);
  return rows[0] ?? null;
}

export async function logWaiterCommand(
  remoteId: string,
  entry: { kind: string; tableNumber: number; waiterName: string; status: WaiterCommandStatus; note?: string | null },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO waiter_commands (remote_id, kind, table_number, waiter_name, status, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(remote_id) DO UPDATE SET status = excluded.status, note = excluded.note`,
    [remoteId, entry.kind, entry.tableNumber, entry.waiterName, entry.status, entry.note ?? null],
  );
}

export async function findActiveTableByNumber(number: number): Promise<DiningTable | null> {
  const db = await getDb();
  const rows = await db.select<DiningTable[]>(
    "SELECT id, number, name, zone, sort_order FROM dining_tables WHERE active = 1 AND number = $1",
    [number],
  );
  return rows[0] ?? null;
}

export async function openOrderIdForTable(tableId: number): Promise<number | null> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM table_orders WHERE table_id = $1 AND status = 'open'",
    [tableId],
  );
  return rows[0]?.id ?? null;
}

export interface WaiterOpenInput {
  remoteId: string;
  tableId: number;
  tableNumber: number;
  kind: "open" | "order";
  guests: number | null;
  waiterName: string;
  waiterUserId: number | null;
}

/**
 * Abre la mesa (o usa la cuenta abierta) a nombre del mozo y, si trae ítems, los anota como una ronda nueva
 * ya enviada a cocina. Todo en una transacción y con el registro de la comanda: llegar dos veces no duplica.
 */
export async function applyWaiterTableCommand(
  input: WaiterOpenInput,
  lines: { productId: number; label: string; price: number; qty: number; cook: string | null; note: string | null }[],
): Promise<{ duplicate: boolean; orderId: number; round: number; items: TableOrderItem[] }> {
  return withImmediateTransaction(async () => {
    const db = await getDb();
    const done = await db.select<{ remote_id: string }[]>("SELECT remote_id FROM waiter_commands WHERE remote_id = $1", [
      input.remoteId,
    ]);
    if (done[0]) return { duplicate: true, orderId: 0, round: 0, items: [] };
    let orderId = await openOrderIdForTable(input.tableId);
    if (orderId == null) {
      orderId = await openTableOrder(input.tableId, {
        guests: input.guests,
        waiterUserId: input.waiterUserId,
        waiterLabel: input.waiterUserId ? null : input.waiterName,
        userId: input.waiterUserId,
      });
    } else {
      if (input.guests) {
        await db.execute("UPDATE table_orders SET guests = $1 WHERE id = $2", [input.guests, orderId]);
      }
      await db.execute(
        `UPDATE table_orders SET waiter_user_id = $1, waiter_label = $2
         WHERE id = $3 AND waiter_user_id IS NULL AND waiter_label IS NULL`,
        [input.waiterUserId, input.waiterUserId ? null : input.waiterName, orderId],
      );
    }
    let round = 0;
    if (lines.length > 0) {
      const last = await db.select<{ r: number | null }[]>(
        "SELECT MAX(round) AS r FROM table_order_items WHERE order_id = $1",
        [orderId],
      );
      round = (last[0]?.r ?? 0) + 1;
      for (const l of lines) {
        await db.execute(
          `INSERT INTO table_order_items
             (order_id, product_id, label, unit_price, qty, cook, note, status, source, round, remote_id, sent_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent', 'waiter', $8, $9, datetime('now','localtime'), $10)`,
          [orderId, l.productId, l.label, roundMoney(l.price), l.qty, l.cook, l.note, round, input.remoteId, input.waiterUserId],
        );
      }
    }
    await db.execute(
      `INSERT INTO waiter_commands (remote_id, kind, table_number, waiter_name, status) VALUES ($1, $2, $3, $4, 'received')`,
      [input.remoteId, input.kind, input.tableNumber, input.waiterName],
    );
    const items =
      lines.length > 0
        ? (
            await db.select<ItemRow[]>(
              `SELECT id, order_id, product_id, variant_id, label, unit_price, qty, modifiers_json, cook, note,
                      status, source, round, created_at
               FROM table_order_items WHERE order_id = $1 AND remote_id = $2 ORDER BY id`,
              [orderId, input.remoteId],
            )
          ).map(parseItem)
        : [];
    return { duplicate: false, orderId, round, items };
  });
}

export interface RemoteTableRequest {
  id: string;
  table_number: number;
  kind: "order" | TableCallKind;
  items?: { id: number; name: string; qty: number; price: number; cook: string | null }[];
  note?: string | null;
  customer_name?: string | null;
  created_at: string;
}

/**
 * Anota en la mesa lo que llegó del QR. El pedido queda «pendiente» hasta que el personal lo confirma,
 * con el precio de hoy de cada producto. Devuelve false si esa mesa ya no existe (igual se da por recibido).
 */
export async function ingestRemoteTableRequest(
  req: RemoteTableRequest,
  priceFor: (productId: number) => Promise<{ price: number; name: string } | null>,
): Promise<{ applied: boolean; tableNumber: number }> {
  const db = await getDb();
  const tables = await db.select<{ id: number }[]>(
    "SELECT id FROM dining_tables WHERE active = 1 AND number = $1",
    [req.table_number],
  );
  const table = tables[0];
  if (!table) return { applied: false, tableNumber: req.table_number };

  if (req.kind === "waiter" || req.kind === "bill") {
    await db.execute("INSERT OR IGNORE INTO table_calls (table_id, kind, remote_id) VALUES ($1, $2, $3)", [
      table.id,
      req.kind,
      req.id,
    ]);
    if (req.kind === "bill") {
      await db.execute(
        `UPDATE table_orders SET bill_requested_at = COALESCE(bill_requested_at, datetime('now','localtime'))
         WHERE table_id = $1 AND status = 'open'`,
        [table.id],
      );
    }
    return { applied: true, tableNumber: req.table_number };
  }

  const dup = await db.select<{ id: number }[]>("SELECT id FROM table_order_items WHERE remote_id = $1 LIMIT 1", [req.id]);
  if (dup[0]) return { applied: true, tableNumber: req.table_number };
  const lines: { productId: number; label: string; price: number; qty: number; cook: string | null }[] = [];
  for (const it of req.items ?? []) {
    const local = await priceFor(it.id);
    if (!local) continue;
    lines.push({
      productId: it.id,
      label: it.cook ? `${local.name} (${it.cook})` : local.name,
      price: local.price,
      qty: it.qty,
      cook: it.cook,
    });
  }
  if (lines.length === 0) return { applied: false, tableNumber: req.table_number };
  const note = [req.customer_name?.trim(), req.note?.trim()].filter(Boolean).join(" · ") || null;
  await withImmediateTransaction(async () => {
    const orderId = await openTableOrder(table.id, {});
    for (const [idx, l] of lines.entries()) {
      await db.execute(
        `INSERT INTO table_order_items
           (order_id, product_id, label, unit_price, qty, cook, note, status, source, remote_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'qr', $8)`,
        [orderId, l.productId, l.label, roundMoney(l.price), l.qty, l.cook, idx === 0 ? note : null, req.id],
      );
    }
  });
  return { applied: true, tableNumber: req.table_number };
}
