import { getDb } from "./index";

export interface ExpiringProduct {
  id: number;
  name: string;
  barcode: string | null;
  expires_at: string;
  days_left: number;
  stock: number;
  expired: number;
}

export interface ExpiringBatch {
  id: number;
  product_id: number;
  product_name: string;
  expires_at: string;
  days_left: number;
  qty: number;
  expired: number;
}

function withinModifier(days: number): string {
  return `+${days} days`;
}

/** Productos con fecha de vencimiento dentro de N días (incluye ya vencidos). */
export async function listExpiringProducts(withinDays = 14): Promise<ExpiringProduct[]> {
  const db = await getDb();
  return db.select<ExpiringProduct[]>(
    `SELECT p.id, p.name, p.barcode, p.expires_at, p.stock,
            CAST(julianday(date(p.expires_at)) - julianday(date('now','localtime')) AS INTEGER) AS days_left,
            CASE WHEN date(p.expires_at) < date('now','localtime') THEN 1 ELSE 0 END AS expired
     FROM products p
     WHERE p.active = 1 AND p.expires_at IS NOT NULL AND p.expires_at != ''
       AND date(p.expires_at) <= date('now','localtime', $1)
     ORDER BY p.expires_at ASC
     LIMIT 100`,
    [withinModifier(withinDays)],
  );
}

export async function countExpiringProducts(withinDays = 14): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM products
     WHERE active = 1 AND expires_at IS NOT NULL AND expires_at != ''
       AND date(expires_at) <= date('now','localtime', $1)`,
    [withinModifier(withinDays)],
  );
  return rows[0]?.n ?? 0;
}

/** Lotes con vencimiento próximo (si usás lotes en stock). */
export async function listExpiringBatches(withinDays = 14): Promise<ExpiringBatch[]> {
  const db = await getDb();
  return db.select<ExpiringBatch[]>(
    `SELECT b.id, b.product_id, p.name AS product_name, b.expires_at, b.qty,
            CAST(julianday(date(b.expires_at)) - julianday(date('now','localtime')) AS INTEGER) AS days_left,
            CASE WHEN date(b.expires_at) < date('now','localtime') THEN 1 ELSE 0 END AS expired
     FROM product_batches b
     JOIN products p ON p.id = b.product_id
     WHERE b.qty > 0 AND b.expires_at IS NOT NULL AND b.expires_at != ''
       AND date(b.expires_at) <= date('now','localtime', $1)
     ORDER BY b.expires_at ASC
     LIMIT 100`,
    [withinModifier(withinDays)],
  );
}
