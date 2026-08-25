import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

export interface ProductBatch {
  id: number;
  product_id: number;
  lot_code: string | null;
  expires_at: string | null;
  qty: number;
  cost: number | null;
  created_at: string;
}

export interface BatchDraft {
  id?: number;
  lot_code: string;
  expires_at: string;
  qty: number;
}

export async function listProductBatches(productId: number): Promise<ProductBatch[]> {
  const db = await getDb();
  return db.select<ProductBatch[]>(
    `SELECT id, product_id, lot_code, expires_at, qty, cost, created_at
     FROM product_batches
     WHERE product_id = $1
     ORDER BY CASE WHEN expires_at IS NULL OR expires_at = '' THEN 1 ELSE 0 END,
              expires_at ASC, id ASC`,
    [productId],
  );
}

/** Reemplaza lotes del producto y sincroniza stock + track_batches. */
export async function saveProductBatches(
  productId: number,
  trackBatches: boolean,
  batches: BatchDraft[],
): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await db.execute("DELETE FROM product_batches WHERE product_id = $1", [productId]);

    let stockSum = 0;
    if (trackBatches) {
      for (const b of batches) {
        const qty = Math.max(0, Number(b.qty) || 0);
        if (qty <= 0 && !b.lot_code.trim() && !b.expires_at) continue;
        stockSum += qty;
        await db.execute(
          `INSERT INTO product_batches (product_id, lot_code, expires_at, qty)
           VALUES ($1, $2, $3, $4)`,
          [
            productId,
            b.lot_code.trim() || null,
            b.expires_at.trim() || null,
            qty,
          ],
        );
      }
    }

    await db.execute(
      `UPDATE products SET
         track_batches = $1,
         stock = CASE WHEN $1 = 1 THEN $2 ELSE stock END,
         updated_at = datetime('now','localtime')
       WHERE id = $3`,
      [trackBatches ? 1 : 0, stockSum, productId],
    );
  });
}
