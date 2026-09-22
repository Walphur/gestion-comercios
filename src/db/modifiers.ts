import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

export interface ProductModifier {
  id: number;
  product_id: number;
  name: string;
  price_delta: number;
  sort_order: number;
  active: number;
}

export interface ModifierDraft {
  id?: number;
  name: string;
  price_delta: number;
}

export async function listProductModifiers(productId: number): Promise<ProductModifier[]> {
  const db = await getDb();
  return db.select<ProductModifier[]>(
    `SELECT * FROM product_modifiers
     WHERE product_id = $1 AND active = 1
     ORDER BY sort_order, id`,
    [productId],
  );
}

export async function saveProductModifiers(
  productId: number,
  drafts: ModifierDraft[],
): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await db.execute("DELETE FROM product_modifiers WHERE product_id = $1", [productId]);
    let order = 0;
    for (const d of drafts) {
      const name = d.name.trim();
      if (!name) continue;
      await db.execute(
        `INSERT INTO product_modifiers (product_id, name, price_delta, sort_order, active)
         VALUES ($1, $2, $3, $4, 1)`,
        [productId, name, Number(d.price_delta) || 0, order++],
      );
    }
  });
}
