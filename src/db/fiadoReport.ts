import type { CustomerLedgerEntry, SaleItem } from "../types";
import { getDb } from "./index";

export interface FiadoLedgerRow extends CustomerLedgerEntry {
  customer_id: number;
  customer_name: string;
  customer_document: string | null;
  customer_address: string | null;
  customer_organization: string | null;
}

/**
 * Movimientos de cuenta corriente hasta `to` (incluido), de todos los clientes o filtrados.
 * Trae también los anteriores al período: con ellos se arma el saldo al inicio y se unen los cobros anulados.
 */
export async function listFiadoLedgerUntil(
  to: string,
  filters: { organization?: string; customerId?: number | null } = {},
): Promise<FiadoLedgerRow[]> {
  const db = await getDb();
  return db.select<FiadoLedgerRow[]>(
    `SELECT m.id, m.delta, m.reason, m.reference_type, m.reference_id, m.created_at,
            m.payment_method, m.user_name, m.notes, m.device_id,
            CASE WHEN m.device_id = COALESCE(
              NULLIF(TRIM((SELECT value FROM settings WHERE key = 'lan_sync_device_id')), ''), 'local'
            ) THEN 1 ELSE 0 END AS is_local,
            CASE m.reference_type
              WHEN 'product' THEN (SELECT p.name FROM products p WHERE p.id = m.reference_id)
              WHEN 'variant' THEN (
                SELECT p.name FROM product_variants v JOIN products p ON p.id = v.product_id
                WHERE v.id = m.reference_id
              )
            END AS reference_label,
            c.id AS customer_id, c.name AS customer_name, c.document AS customer_document,
            c.address AS customer_address, c.organization AS customer_organization
     FROM customer_balance_movements m
     JOIN customers c ON c.id = m.customer_id
     WHERE substr(m.created_at, 1, 10) <= $1
       AND ($2 = '' OR TRIM(c.organization) = $2 COLLATE NOCASE)
       AND ($3 = 0 OR c.id = $3)
     ORDER BY c.id, m.created_at ASC, m.id ASC`,
    [to, filters.organization?.trim() ?? "", filters.customerId ?? 0],
  );
}

/** Detalle escrito en cada venta pedida (quién retiró, para qué…), solo las que lo tienen. */
export async function listSaleNotesForSales(saleIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = [...new Set(saleIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return out;
  const db = await getDb();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const rows = await db.select<{ id: number; note: string }[]>(
      `SELECT id, note FROM sales WHERE id IN (${chunk.join(",")}) AND TRIM(COALESCE(note, '')) <> ''`,
    );
    for (const r of rows) out.set(r.id, r.note.trim());
  }
  return out;
}

/** Productos de las ventas pedidas, agrupados por venta. */
export async function listSaleItemsForSales(saleIds: number[]): Promise<Map<number, SaleItem[]>> {
  const out = new Map<number, SaleItem[]>();
  const ids = [...new Set(saleIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return out;
  const db = await getDb();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const rows = await db.select<SaleItem[]>(
      `SELECT * FROM sale_items WHERE sale_id IN (${chunk.join(",")}) ORDER BY sale_id, id`,
    );
    for (const it of rows) {
      const list = out.get(it.sale_id) ?? [];
      list.push(it);
      out.set(it.sale_id, list);
    }
  }
  return out;
}
