import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";
import { addCustomerBalanceDelta } from "./customers";

type FiadoLine = {
  item_id: number;
  sale_id: number;
  customer_id: number;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Si cambia el precio de un producto/variante, actualiza ítems de ventas a fiado
 * no anuladas y ajusta la deuda del cliente (para no perder plata).
 */
export async function repriceOpenFiadoLines(opts: {
  productId?: number;
  variantId?: number;
  newUnitPrice: number;
}): Promise<{ lines: number; debtDelta: number }> {
  const newPrice = roundMoney(opts.newUnitPrice);
  if (!Number.isFinite(newPrice) || newPrice < 0) {
    return { lines: 0, debtDelta: 0 };
  }
  if (opts.variantId == null && opts.productId == null) {
    return { lines: 0, debtDelta: 0 };
  }

  return withImmediateTransaction(async () => {
    const db = await getDb();
    const params: unknown[] = [];
    let whereItem = "";
    if (opts.variantId != null) {
      params.push(opts.variantId);
      whereItem = `si.variant_id = $${params.length}`;
    } else {
      params.push(opts.productId);
      whereItem = `si.product_id = $${params.length} AND (si.variant_id IS NULL OR si.variant_id = 0)`;
    }

    const rows = await db.select<FiadoLine[]>(
      `SELECT si.id AS item_id, si.sale_id, s.customer_id,
              si.qty, si.unit_price, si.discount_pct, si.line_total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       WHERE ${whereItem}
         AND s.voided = 0
         AND s.customer_id IS NOT NULL
         AND s.payment_method IN ('fiado', 'cuenta_corriente')`,
      params,
    );

    if (rows.length === 0) return { lines: 0, debtDelta: 0 };

    const byCustomer = new Map<number, number>();
    const bySale = new Map<number, number>();
    let lines = 0;
    let debtDelta = 0;

    for (const row of rows) {
      if (Math.abs(row.unit_price - newPrice) < 0.001) continue;
      const disc = Number(row.discount_pct) || 0;
      const newLine = roundMoney(row.qty * newPrice * (1 - disc / 100));
      const delta = roundMoney(newLine - row.line_total);
      if (Math.abs(delta) < 0.001) continue;

      await db.execute(
        `UPDATE sale_items SET unit_price = $1, line_total = $2 WHERE id = $3`,
        [newPrice, newLine, row.item_id],
      );
      bySale.set(row.sale_id, roundMoney((bySale.get(row.sale_id) ?? 0) + delta));
      byCustomer.set(
        row.customer_id,
        roundMoney((byCustomer.get(row.customer_id) ?? 0) + delta),
      );
      lines += 1;
      debtDelta = roundMoney(debtDelta + delta);
    }

    for (const [saleId, delta] of bySale) {
      await db.execute(
        `UPDATE sales SET
           total = ROUND(total + $1, 2),
           subtotal = ROUND(subtotal + $1, 2)
         WHERE id = $2`,
        [delta, saleId],
      );
    }

    for (const [customerId, delta] of byCustomer) {
      if (Math.abs(delta) < 0.001) continue;
      await addCustomerBalanceDelta(
        customerId,
        delta,
        "price_adjust",
        opts.variantId != null ? "variant" : "product",
        opts.variantId ?? opts.productId ?? null,
      );
    }

    return { lines, debtDelta };
  });
}

/** Tras un ajuste masivo de precios: sincroniza fiados de cada producto tocado. */
export async function repriceOpenFiadoForProductIds(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const rows = await db.select<{ id: number; price: number }[]>(
    `SELECT id, price FROM products WHERE id IN (${placeholders})`,
    ids,
  );
  for (const r of rows) {
    await repriceOpenFiadoLines({ productId: r.id, newUnitPrice: r.price });
  }
}
