import type { Sale, SaleItem } from "../types";
import { getDb } from "./index";
import {
  addCustomerBalance,
  assertCreditAvailable,
  subtractCustomerBalance,
} from "./customers";
import { deductStockForSale, restoreStockForSale } from "./stock";
import { withImmediateTransaction } from "./tx";

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
  mp_order_id?: string | null;
  mp_payment_id?: string | null;
  items: SaleItemInput[];
}

const FIADO_METHODS = ["fiado", "cuenta_corriente"];

function isFiado(method: string): boolean {
  return FIADO_METHODS.includes(method.toLowerCase());
}

async function allocateSaleDocNumber(): Promise<string> {
  const db = await getDb();
  const codeRows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'lan_sync_device_code' LIMIT 1",
  );
  let code = (codeRows[0]?.value || "").trim().toUpperCase();
  if (!code) {
    const idRows = await db.select<{ value: string }[]>(
      "SELECT value FROM settings WHERE key = 'lan_sync_device_id' LIMIT 1",
    );
    const id = (idRows[0]?.value || "").trim();
    code = id.length >= 4 ? `PC${id.slice(0, 4).toUpperCase()}` : "PC00";
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ('lan_sync_device_code', $1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [code],
    );
  }
  const seqRows = await db.select<{ next_value: number }[]>(
    `SELECT next_value FROM document_sequences
     WHERE device_code = $1 AND doc_type = 'V' LIMIT 1`,
    [code],
  );
  const next = seqRows[0]?.next_value ?? 1;
  await db.execute(
    `INSERT INTO document_sequences (device_code, doc_type, next_value)
     VALUES ($1, 'V', $2)
     ON CONFLICT(device_code, doc_type) DO UPDATE SET next_value = excluded.next_value`,
    [code, next + 1],
  );
  return `${code}-V-${String(next).padStart(8, "0")}`;
}

/** Cuerpo de la venta. Debe correr dentro de withImmediateTransaction. */
export async function recordSaleWithinTransaction(sale: SaleInput): Promise<number> {
  if (sale.cash_session_id == null) {
    throw new Error("Abrí el turno de caja antes de registrar una venta.");
  }
  if (sale.items.length === 0) {
    throw new Error("La venta debe tener al menos un producto.");
  }
  if (isFiado(sale.payment_method) && !sale.customer_id) {
    throw new Error("Seleccioná un cliente para vender a fiado.");
  }
  if (isFiado(sale.payment_method) && sale.customer_id) {
    await assertCreditAvailable(sale.customer_id, sale.total);
  }

  const db = await getDb();
  const docNumber = await allocateSaleDocNumber();

  const res = await db.execute(
    `INSERT INTO sales
       (subtotal, discount_pct, total, payment_method, paid, change_due, user_id,
        cash_session_id, customer_id, mp_order_id, mp_payment_id, doc_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
      sale.mp_order_id ?? null,
      sale.mp_payment_id ?? null,
      docNumber,
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
    } else if (it.product_id != null && stockQty !== 0) {
      await deductStockForSale(it.product_id, stockQty, saleId, sale.user_id ?? null);
    }
  }

  if (isFiado(sale.payment_method) && sale.customer_id) {
    await addCustomerBalance(sale.customer_id, sale.total, saleId);
  }

  return saleId;
}

/** Registra venta, stock y fiado en UNA sola transacción ACID. */
export async function recordSale(sale: SaleInput): Promise<number> {
  return withImmediateTransaction(() => recordSaleWithinTransaction(sale));
}

export async function voidSale(saleId: number, userId: number): Promise<void> {
  await withImmediateTransaction(async () => {
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
    >("SELECT product_id, variant_id, qty, stock_qty FROM sale_items WHERE sale_id = $1", [
      saleId,
    ]);

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
  });
}

export async function listSales(limit = 100): Promise<Sale[]> {
  const db = await getDb();
  return db.select<Sale[]>(
    `SELECT s.*, c.name AS customer_name, u.display_name AS seller_name
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN users u ON u.id = s.user_id
     ORDER BY s.id DESC LIMIT $1`,
    [limit],
  );
}

/** Ventas asociadas a un cliente (para historial / reclamos). */
export async function listSalesByCustomer(customerId: number, limit = 100): Promise<Sale[]> {
  const db = await getDb();
  return db.select<Sale[]>(
    `SELECT s.*, c.name AS customer_name, u.display_name AS seller_name
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.customer_id = $1
     ORDER BY s.id DESC LIMIT $2`,
    [customerId, limit],
  );
}

export async function getSale(id: number): Promise<Sale | null> {
  const db = await getDb();
  const rows = await db.select<Sale[]>(
    `SELECT s.*, c.name AS customer_name, u.display_name AS seller_name
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN users u ON u.id = s.user_id
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

export interface SaleUpdateItemInput extends SaleItemInput {
  id?: number;
}

export interface SaleUpdateInput {
  subtotal: number;
  discount_pct: number;
  total: number;
  payment_method: string;
  paid: number | null;
  change_due: number | null;
  items: SaleUpdateItemInput[];
  removed_item_ids: number[];
}

async function adjustItemStock(
  productId: number | null,
  variantId: number | null,
  oldStockQty: number,
  newStockQty: number,
  saleId: number,
  userId: number,
): Promise<void> {
  const delta = newStockQty - oldStockQty;
  if (delta === 0) return;
  const db = await getDb();
  if (variantId != null) {
    await db.execute("UPDATE product_variants SET stock = stock - $1 WHERE id = $2", [
      delta,
      variantId,
    ]);
    return;
  }
  if (productId != null) {
    if (delta > 0) {
      await deductStockForSale(productId, delta, saleId, userId);
    } else {
      await restoreStockForSale(productId, -delta, saleId, userId);
    }
  }
}

async function restoreItemStock(
  productId: number | null,
  variantId: number | null,
  stockQty: number,
  saleId: number,
  userId: number,
): Promise<void> {
  if (variantId != null) {
    const db = await getDb();
    await db.execute("UPDATE product_variants SET stock = stock + $1 WHERE id = $2", [
      stockQty,
      variantId,
    ]);
    return;
  }
  if (productId != null) {
    await restoreStockForSale(productId, stockQty, saleId, userId);
  }
}

/** Corrige una venta ya registrada. Todo en una única TX. */
export async function updateSale(
  saleId: number,
  userId: number,
  input: SaleUpdateInput,
): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const sales = await db.select<
      {
        voided: number;
        total: number;
        payment_method: string;
        customer_id: number | null;
      }[]
    >("SELECT voided, total, payment_method, customer_id FROM sales WHERE id = $1", [saleId]);

    const sale = sales[0];
    if (!sale) throw new Error("Venta no encontrada.");
    if (sale.voided) throw new Error("No se puede editar una venta anulada.");
    if (input.items.length === 0) throw new Error("La venta debe tener al menos un producto.");

    const oldItems = await db.select<
      {
        id: number;
        product_id: number | null;
        variant_id: number | null;
        qty: number;
        stock_qty: number | null;
      }[]
    >("SELECT id, product_id, variant_id, qty, stock_qty FROM sale_items WHERE sale_id = $1", [
      saleId,
    ]);

    const removed = new Set(input.removed_item_ids);
    for (const old of oldItems) {
      if (!removed.has(old.id)) continue;
      const stockQty = old.stock_qty ?? old.qty;
      await restoreItemStock(old.product_id, old.variant_id, stockQty, saleId, userId);
      await db.execute("DELETE FROM sale_items WHERE id = $1", [old.id]);
    }

    const oldById = new Map(oldItems.map((it) => [it.id, it]));

    for (const it of input.items) {
      const stockQty = it.stock_qty ?? it.qty;
      if (it.id != null) {
        const old = oldById.get(it.id);
        if (!old) throw new Error(`Ítem #${it.id} no pertenece a esta venta.`);
        const oldStockQty = old.stock_qty ?? old.qty;
        await adjustItemStock(
          it.product_id,
          it.variant_id,
          oldStockQty,
          stockQty,
          saleId,
          userId,
        );
        await db.execute(
          `UPDATE sale_items
           SET name=$2, qty=$3, unit_price=$4, discount_pct=$5, line_total=$6, stock_qty=$7
           WHERE id=$1`,
          [it.id, it.name, it.qty, it.unit_price, it.discount_pct, it.line_total, stockQty],
        );
        continue;
      }

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
        await deductStockForSale(it.product_id, stockQty, saleId, userId);
      }
    }

    if (isFiado(sale.payment_method) && sale.customer_id) {
      await subtractCustomerBalance(sale.customer_id, sale.total);
    }
    if (isFiado(input.payment_method) && sale.customer_id) {
      await assertCreditAvailable(sale.customer_id, input.total);
      await addCustomerBalance(sale.customer_id, input.total, saleId);
    }

    await db.execute(
      `UPDATE sales
       SET subtotal=$2, discount_pct=$3, total=$4,
           payment_method=$5, paid=$6, change_due=$7
       WHERE id=$1`,
      [
        saleId,
        input.subtotal,
        input.discount_pct,
        input.total,
        input.payment_method,
        input.paid,
        input.change_due,
      ],
    );
  });
}
