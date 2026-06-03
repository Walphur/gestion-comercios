import type { Sale, SaleItem } from "../types";
import { getDb } from "./index";

export interface SaleItemInput {
  product_id: number | null;
  variant_id: number | null;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
}

export interface SaleInput {
  subtotal: number;
  discount_pct: number;
  total: number;
  payment_method: string;
  paid: number | null;
  change_due: number | null;
  items: SaleItemInput[];
}

/** Registra una venta (encabezado + ítems) y descuenta el stock correspondiente. */
export async function recordSale(sale: SaleInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO sales (subtotal, discount_pct, total, payment_method, paid, change_due)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [sale.subtotal, sale.discount_pct, sale.total, sale.payment_method, sale.paid, sale.change_due],
  );
  const saleId = res.lastInsertId as number;

  for (const it of sale.items) {
    await db.execute(
      `INSERT INTO sale_items
         (sale_id, product_id, variant_id, name, qty, unit_price, discount_pct, line_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        saleId,
        it.product_id,
        it.variant_id,
        it.name,
        it.qty,
        it.unit_price,
        it.discount_pct,
        it.line_total,
      ],
    );

    if (it.variant_id != null) {
      await db.execute("UPDATE product_variants SET stock = stock - $1 WHERE id = $2", [
        it.qty,
        it.variant_id,
      ]);
    }
    if (it.product_id != null) {
      await db.execute("UPDATE products SET stock = stock - $1 WHERE id = $2", [
        it.qty,
        it.product_id,
      ]);
    }
  }

  return saleId;
}

export async function listSales(limit = 100): Promise<Sale[]> {
  const db = await getDb();
  return db.select<Sale[]>("SELECT * FROM sales ORDER BY id DESC LIMIT $1", [limit]);
}

export async function getSaleItems(saleId: number): Promise<SaleItem[]> {
  const db = await getDb();
  return db.select<SaleItem[]>("SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id", [
    saleId,
  ]);
}

export interface SalesSummary {
  todayTotal: number;
  todayCount: number;
}

export async function getTodaySummary(): Promise<SalesSummary> {
  const db = await getDb();
  const rows = await db.select<{ total: number; count: number }[]>(
    `SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS count
     FROM sales WHERE date(created_at) = date('now','localtime')`,
  );
  return { todayTotal: rows[0]?.total ?? 0, todayCount: rows[0]?.count ?? 0 };
}
