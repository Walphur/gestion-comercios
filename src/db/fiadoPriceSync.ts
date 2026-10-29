import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";
import { addCustomerBalanceDelta } from "./customers";
import { formatMoney, formatQty } from "../lib/format";

type FiadoLine = {
  item_id: number;
  sale_id: number;
  customer_id: number;
  device_code: string | null;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * Ventas a fiado que todavía no se pagaron: los cobros cancelan primero lo más viejo,
 * así que solo quedan impagas las más nuevas que entran enteras en el saldo actual.
 */
async function unpaidFiadoSaleIds(db: Db, customerId: number): Promise<Set<number>> {
  const bal = await db.select<{ balance: number }[]>(
    `SELECT COALESCE(SUM(delta), 0) AS balance FROM customer_balance_movements WHERE customer_id = $1`,
    [customerId],
  );
  let remaining = Number(bal[0]?.balance) || 0;
  const sales = await db.select<{ id: number; total: number }[]>(
    `SELECT id, total FROM sales
     WHERE customer_id = $1 AND voided = 0 AND payment_method IN ('fiado', 'cuenta_corriente')
     ORDER BY created_at DESC, id DESC`,
    [customerId],
  );
  const open = new Set<number>();
  for (const s of sales) {
    const total = Number(s.total) || 0;
    if (remaining + 0.005 < total) break;
    open.add(s.id);
    remaining -= total;
  }
  return open;
}

/**
 * Si cambia el precio de un producto/variante, actualiza ítems de ventas a fiado
 * todavía impagas y ajusta la deuda del cliente (para no perder plata).
 * Lo ya pagado no se toca. Con sincronización entre cajas, cada PC ajusta solo sus ventas.
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
      `SELECT si.id AS item_id, si.sale_id, s.customer_id, s.device_code, si.name,
              si.qty, si.unit_price, si.discount_pct, si.line_total
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       WHERE ${whereItem}
         AND s.voided = 0
         AND s.customer_id IS NOT NULL
         AND s.payment_method IN ('fiado', 'cuenta_corriente')
       ORDER BY s.id`,
      params,
    );

    if (rows.length === 0) return { lines: 0, debtDelta: 0 };

    const lanRows = await db.select<{ key: string; value: string }[]>(
      `SELECT key, value FROM settings WHERE key IN ('lan_sync_enabled', 'lan_sync_device_code')`,
    );
    const lanOn = lanRows.find((r) => r.key === "lan_sync_enabled")?.value === "1";
    const localCode = (lanRows.find((r) => r.key === "lan_sync_device_code")?.value ?? "").trim().toUpperCase();

    const openByCustomer = new Map<number, Set<number>>();
    const byCustomer = new Map<number, number>();
    const notesByCustomer = new Map<number, Map<string, { qty: number; sales: Set<number> }>>();
    const bySale = new Map<number, number>();
    let lines = 0;
    let debtDelta = 0;

    for (const row of rows) {
      if (Math.abs(row.unit_price - newPrice) < 0.001) continue;
      if (lanOn) {
        const code = (row.device_code ?? "").trim().toUpperCase();
        if (code && code !== localCode) continue;
      }
      let open = openByCustomer.get(row.customer_id);
      if (!open) {
        open = await unpaidFiadoSaleIds(db, row.customer_id);
        openByCustomer.set(row.customer_id, open);
      }
      if (!open.has(row.sale_id)) continue;

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
      const notes = notesByCustomer.get(row.customer_id) ?? new Map();
      const key = `${row.name}\u0000${row.unit_price}`;
      const agg = notes.get(key) ?? { qty: 0, sales: new Set<number>() };
      agg.qty += Number(row.qty) || 0;
      agg.sales.add(row.sale_id);
      notes.set(key, agg);
      notesByCustomer.set(row.customer_id, notes);
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
      const detail = [...(notesByCustomer.get(customerId) ?? new Map()).entries()]
        .map(([key, agg]) => {
          const [name, oldPrice] = key.split("\u0000");
          const salesList = [...agg.sales].map((id) => `#${id}`).join(", ");
          const salesLabel = agg.sales.size > 1 ? "ventas" : "venta";
          return `${name}: ${formatMoney(Number(oldPrice))} → ${formatMoney(newPrice)} · ${formatQty(agg.qty)} u. (${salesLabel} ${salesList})`;
        })
        .join(" · ");
      await addCustomerBalanceDelta(
        customerId,
        delta,
        "price_adjust",
        opts.variantId != null ? "variant" : "product",
        opts.variantId ?? opts.productId ?? null,
        detail || null,
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
