import type { Sale, SaleItem } from "../types";
import { getDb } from "./index";
import {
  addCustomerBalance,
  assertCreditAvailable,
  subtractCustomerBalance,
} from "./customers";
import { deductStockForSale, restoreStockForSale } from "./stock";

export interface SaleItemInput {
  product_id: number | null;
  variant_id: number | null;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  stock_qty?: number;
}

export interface SaleInput {
  subtotal: number;
  discount_pct: number;
  total: number;
  payment_method: string;
  paid: number | null;
  change_due: number | null;
  user_id?: number | null;
  cash_session_id?: number | null;
  customer_id?: number | null;
  items: SaleItemInput[];
}

const FIADO_METHODS = ["fiado", "cuenta_corriente"];

function isFiado(method: string): boolean {
  return FIADO_METHODS.includes(method.toLowerCase());
}

/** Registra venta, descuenta stock (kits/lotes) y devuelve el ID. */
export async function recordSale(sale: SaleInput): Promise<number> {
  if (isFiado(sale.payment_method)) {
    if (!sale.customer_id) throw new Error("Seleccioná un cliente para vender a fiado.");
    await assertCreditAvailable(sale.customer_id, sale.total);
  }

  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO sales
       (subtotal, discount_pct, total, payment_method, paid, change_due, user_id, cash_session_id, customer_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      sale.subtotal,
      sale.discount_pct,
      sale.total,
      sale.payment_method,
      sale.paid,
      sale.change_due,
      sale.user_id ?? null,
      sale.cash_session_id ?? null,
      sale.customer_id ?? null,
    ],
  );
  const saleId = res.lastInsertId as number;

  for (const it of sale.items) {
    const stockQty = it.stock_qty ?? it.qty;
    await db.execute(
      `INSERT INTO sale_items
         (sale_id, product_id, variant_id, name, qty, unit_price, discount_pct, line_total, stock_qty)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        saleId,
        it.product_id,
        it.variant_id,
        it.name,
        it.qty,
        it.unit_price,
        it.discount_pct,
        it.line_total,
        stockQty,
      ],
    );

    if (it.variant_id != null) {
      await db.execute("UPDATE product_variants SET stock = stock - $1 WHERE id = $2", [
        it.qty,
        it.variant_id,
      ]);
    } else if (it.product_id != null) {
      await deductStockForSale(it.product_id, stockQty, saleId, sale.user_id ?? null);
    }
  }

  if (isFiado(sale.payment_method) && sale.customer_id) {
    await addCustomerBalance(sale.customer_id, sale.total);
  }

  return saleId;
}

export async function voidSale(saleId: number, userId: number): Promise<void> {
  const db = await getDb();
  const sales = await db.select<
    { voided: number; total: number; payment_method: string; customer_id: number | null }[]
  >("SELECT voided, total, payment_method, customer_id FROM sales WHERE id = $1", [saleId]);

  const sale = sales[0];
  if (!sale) throw new Error("Venta no encontrada.");
  if (sale.voided) throw new Error("Esta venta ya fue anulada.");

  const items = await db.select<
    {
      product_id: number | null;
      variant_id: number | null;
      qty: number;
      stock_qty: number | null;
    }[]
  >(
    "SELECT product_id, variant_id, qty, stock_qty FROM sale_items WHERE sale_id = $1",
    [saleId],
  );

  for (const it of items) {
    const stockQty = it.stock_qty ?? it.qty;
    if (it.variant_id != null) {
      await db.execute("UPDATE product_variants SET stock = stock + $1 WHERE id = $2", [
        it.qty,
        it.variant_id,
      ]);
    } else if (it.product_id != null) {
      await restoreStockForSale(it.product_id, stockQty, saleId, userId);
    }
  }

  if (isFiado(sale.payment_method) && sale.customer_id) {
    await subtractCustomerBalance(sale.customer_id, sale.total);
  }

  await db.execute(
    `UPDATE sales SET voided = 1, voided_at = datetime('now','localtime'), voided_by = $2
     WHERE id = $1`,
    [saleId, userId],
  );
}

export async function listSales(limit = 100): Promise<Sale[]> {
  const db = await getDb();
  return db.select<Sale[]>(
    `SELECT s.*, c.name AS customer_name
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     ORDER BY s.id DESC LIMIT $1`,
    [limit],
  );
}

export async function getSale(id: number): Promise<Sale | null> {
  const db = await getDb();
  const rows = await db.select<Sale[]>(
    `SELECT s.*, c.name AS customer_name
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.id = $1`,
    [id],
  );
  return rows[0] ?? null;
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
     FROM sales WHERE voided = 0 AND date(created_at) = date('now','localtime')`,
  );
  return { todayTotal: rows[0]?.total ?? 0, todayCount: rows[0]?.count ?? 0 };
}
