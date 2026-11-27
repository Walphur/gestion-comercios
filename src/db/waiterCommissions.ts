import { getDb } from "./index";
import { getSetting, setSetting } from "./settings";
import {
  clampCommissionPct,
  commissionFromBase,
  merchandiseBaseFromSale,
  parseCommissionPctInput,
} from "../lib/waiterCommissionMath";

export const WAITER_COMMISSIONS_ENABLED_SETTING = "waiter_commissions_enabled";
export const WAITER_COMMISSION_PCT_SETTING = "waiter_commission_pct";

export type WaiterCommissionStatus = "pending" | "paid" | "reversed";

export interface WaiterCommissionEntry {
  id: number;
  sale_id: number;
  table_order_id: number | null;
  table_number: number | null;
  waiter_user_id: number | null;
  waiter_label: string | null;
  merchandise_base: number;
  tip_amount: number;
  commission_pct: number;
  commission_amount: number;
  status: WaiterCommissionStatus;
  paid_at: string | null;
  paid_by: number | null;
  paid_by_name?: string | null;
  reversed_at: string | null;
  reversed_by: number | null;
  reverse_of_id: number | null;
  note: string | null;
  created_at: string;
  sale_total?: number;
  sale_voided?: number;
  sale_created_at?: string;
}

export async function isWaiterCommissionsEnabled(): Promise<boolean> {
  return (await getSetting(WAITER_COMMISSIONS_ENABLED_SETTING)) === "1";
}

export async function getWaiterCommissionPct(): Promise<number> {
  const raw = await getSetting(WAITER_COMMISSION_PCT_SETTING);
  const parsed = parseCommissionPctInput(raw);
  return parsed ?? 0;
}

export async function setWaiterCommissionsEnabled(on: boolean): Promise<void> {
  await setSetting(WAITER_COMMISSIONS_ENABLED_SETTING, on ? "1" : "0");
}

export async function setWaiterCommissionPct(pct: number): Promise<void> {
  const n = parseCommissionPctInput(pct);
  if (n == null) throw new Error("El porcentaje debe estar entre 0 y 100.");
  await setSetting(WAITER_COMMISSION_PCT_SETTING, String(n));
}

/**
 * Tras un cobro de mesa (parcial o cierre): crea o reutiliza entry (idempotente por sale_id).
 * No-op si desactivado; % 0 sigue registrando base/tip para reportes.
 */
export async function upsertWaiterCommissionForTableSale(
  orderId: number,
  saleId: number,
): Promise<number | null> {
  if (!(await isWaiterCommissionsEnabled())) return null;

  const db = await getDb();
  const orders = await db.select<
    {
      id: number;
      waiter_user_id: number | null;
      waiter_label: string | null;
      table_number: number | null;
      status: string;
      sale_id: number | null;
    }[]
  >(
    `SELECT o.id, o.waiter_user_id, o.waiter_label, o.status, o.sale_id, t.number AS table_number
     FROM table_orders o
     JOIN dining_tables t ON t.id = o.table_id
     WHERE o.id = $1`,
    [orderId],
  );
  const order = orders[0];
  if (!order) return null;
  // Cobro total (mesa cerrada con esta venta) o cobro parcial (ítems con paid_sale_id).
  const isClosingSale = order.status === "closed" && order.sale_id === saleId;
  if (!isClosingSale) {
    const paid = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM table_order_items WHERE order_id = $1 AND paid_sale_id = $2",
      [orderId, saleId],
    );
    if ((paid[0]?.n ?? 0) === 0) return null;
  }

  const sales = await db.select<{ discount_pct: number; voided: number }[]>(
    "SELECT discount_pct, voided FROM sales WHERE id = $1",
    [saleId],
  );
  const sale = sales[0];
  if (!sale || sale.voided) return null;

  const lines = await db.select<{ name: string; product_id: number | null; line_total: number }[]>(
    "SELECT name, product_id, line_total FROM sale_items WHERE sale_id = $1",
    [saleId],
  );
  const { merchandiseBase, tipAmount } = merchandiseBaseFromSale(lines, sale.discount_pct ?? 0);
  const pct = await getWaiterCommissionPct();
  const amount = commissionFromBase(merchandiseBase, pct);

  const waiterUserId = order.waiter_user_id;
  let waiterLabel = order.waiter_label?.trim() || null;
  if (waiterUserId != null) {
    const names = await db.select<{ display_name: string }[]>(
      "SELECT display_name FROM users WHERE id = $1",
      [waiterUserId],
    );
    waiterLabel = names[0]?.display_name?.trim() || waiterLabel;
  }

  // Idempotencia: si ya hay entry primaria (sin reverse_of_id), no insertar otra.
  const existing = await db.select<{ id: number }[]>(
    `SELECT id FROM waiter_commission_entries
     WHERE sale_id = $1 AND reverse_of_id IS NULL
       AND (
         ($2 IS NOT NULL AND waiter_user_id = $2)
         OR ($2 IS NULL AND waiter_user_id IS NULL AND IFNULL(waiter_label, '') = IFNULL($3, ''))
       )
     LIMIT 1`,
    [saleId, waiterUserId, waiterLabel],
  );
  if (existing[0]) return existing[0].id;

  const res = await db.execute(
    `INSERT INTO waiter_commission_entries (
       sale_id, table_order_id, table_number, waiter_user_id, waiter_label,
       merchandise_base, tip_amount, commission_pct, commission_amount, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
    [
      saleId,
      orderId,
      order.table_number,
      waiterUserId,
      waiterLabel,
      merchandiseBase,
      tipAmount,
      clampCommissionPct(pct),
      amount,
    ],
  );
  return res.lastInsertId as number;
}

/** @deprecated Usar upsertWaiterCommissionForTableSale (incluye cobros parciales). */
export const upsertWaiterCommissionForClosedTable = upsertWaiterCommissionForTableSale;

/**
 * Anulación de venta: pending → reversed; paid → reversión auditable + ajuste pending negativo.
 */
export async function reverseWaiterCommissionsForVoidedSale(
  saleId: number,
  userId: number,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<WaiterCommissionEntry[]>(
    `SELECT * FROM waiter_commission_entries
     WHERE sale_id = $1 AND reverse_of_id IS NULL`,
    [saleId],
  );
  for (const row of rows) {
    if (row.status === "reversed") continue;
    if (row.status === "pending") {
      await db.execute(
        `UPDATE waiter_commission_entries
         SET status = 'reversed', reversed_at = datetime('now','localtime'), reversed_by = $2,
             note = COALESCE(note, '') || CASE WHEN note IS NULL OR note = '' THEN '' ELSE ' · ' END || 'Anulación de venta'
         WHERE id = $1`,
        [row.id, userId],
      );
      continue;
    }
    if (row.status === "paid") {
      const claw = -Math.abs(row.commission_amount);
      await db.execute(
        `INSERT INTO waiter_commission_entries (
           sale_id, table_order_id, table_number, waiter_user_id, waiter_label,
           merchandise_base, tip_amount, commission_pct, commission_amount,
           status, reverse_of_id, note, reversed_at, reversed_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reversed', $10, $11,
                   datetime('now','localtime'), $12)`,
        [
          saleId,
          row.table_order_id,
          row.table_number,
          row.waiter_user_id,
          row.waiter_label,
          row.merchandise_base,
          row.tip_amount,
          row.commission_pct,
          claw,
          row.id,
          "Reversión auditable por anulación (ya liquidada)",
          userId,
        ],
      );
      await db.execute(
        `INSERT INTO waiter_commission_entries (
           sale_id, table_order_id, table_number, waiter_user_id, waiter_label,
           merchandise_base, tip_amount, commission_pct, commission_amount,
           status, reverse_of_id, note
         ) VALUES ($1, $2, $3, $4, $5, 0, 0, $6, $7, 'pending', $8, $9)`,
        [
          saleId,
          row.table_order_id,
          row.table_number,
          row.waiter_user_id,
          row.waiter_label,
          row.commission_pct,
          claw,
          row.id,
          "Ajuste pendiente por anulación de venta ya liquidada",
        ],
      );
    }
  }
}

export async function listWaiterCommissionEntries(filter: {
  from: string;
  to: string;
  waiterUserId?: number | null;
  status?: WaiterCommissionStatus | "";
}): Promise<WaiterCommissionEntry[]> {
  const db = await getDb();
  const params: unknown[] = [filter.from, filter.to];
  let sql = `
    SELECT e.*,
           s.total AS sale_total,
           s.voided AS sale_voided,
           s.created_at AS sale_created_at,
           pu.display_name AS paid_by_name
    FROM waiter_commission_entries e
    LEFT JOIN sales s ON s.id = e.sale_id
    LEFT JOIN users pu ON pu.id = e.paid_by
    WHERE date(COALESCE(s.created_at, e.created_at)) BETWEEN $1 AND $2`;
  if (filter.waiterUserId != null && filter.waiterUserId > 0) {
    params.push(filter.waiterUserId);
    sql += ` AND e.waiter_user_id = $${params.length}`;
  }
  if (filter.status) {
    params.push(filter.status);
    sql += ` AND e.status = $${params.length}`;
  }
  sql += ` ORDER BY COALESCE(s.created_at, e.created_at) DESC, e.id DESC`;
  return db.select<WaiterCommissionEntry[]>(sql, params);
}

export interface WaiterCommissionSummary {
  generated: number;
  pending: number;
  paid: number;
  tipsInformative: number;
  count: number;
}

export function summarizeWaiterCommissions(rows: WaiterCommissionEntry[]): WaiterCommissionSummary {
  let generated = 0;
  let pending = 0;
  let paid = 0;
  let tipsInformative = 0;
  for (const r of rows) {
    if (r.reverse_of_id == null && r.status !== "reversed") {
      tipsInformative += r.tip_amount;
    }
    if (r.status === "pending") pending += r.commission_amount;
    if (r.status === "paid") paid += r.commission_amount;
    if (r.status === "pending" || r.status === "paid") generated += r.commission_amount;
  }
  return {
    generated: round2(generated),
    pending: round2(pending),
    paid: round2(paid),
    tipsInformative: round2(tipsInformative),
    count: rows.length,
  };
}

/**
 * Marca pending → paid. No permite auto-liquidarse sin manageAdmin.
 */
export async function markWaiterCommissionsPaid(
  entryIds: number[],
  actor: { id: number; isAdmin: boolean },
): Promise<number> {
  if (!entryIds.length) return 0;
  const db = await getDb();
  const placeholders = entryIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<WaiterCommissionEntry[]>(
    `SELECT * FROM waiter_commission_entries WHERE id IN (${placeholders}) AND status = 'pending'`,
    entryIds,
  );
  let n = 0;
  for (const row of rows) {
    if (
      !actor.isAdmin &&
      row.waiter_user_id != null &&
      row.waiter_user_id === actor.id
    ) {
      throw new Error(
        "No podés liquidar tus propias comisiones. Pedile al administrador.",
      );
    }
    await db.execute(
      `UPDATE waiter_commission_entries
       SET status = 'paid', paid_at = datetime('now','localtime'), paid_by = $2
       WHERE id = $1 AND status = 'pending'`,
      [row.id, actor.id],
    );
    n += 1;
  }
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
