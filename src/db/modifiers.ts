import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

export interface ProductModifier {
  id: number;
  product_id: number;
  name: string;
  price_delta: number;
  sort_order: number;
  active: number;
  /** Producto que se descuenta al elegir esta opción (guarnición). */
  linked_product_id?: number | null;
  /** Cantidad del producto ligado por cada unidad vendida. */
  qty?: number;
}

export interface ModifierDraft {
  id?: number;
  name: string;
  price_delta: number;
  linked_product_id?: number | null;
  qty?: number;
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
        `INSERT INTO product_modifiers
           (product_id, name, price_delta, sort_order, active, linked_product_id, qty)
         VALUES ($1, $2, $3, $4, 1, $5, $6)`,
        [
          productId,
          name,
          Number(d.price_delta) || 0,
          order++,
          d.linked_product_id ?? null,
          d.qty && d.qty > 0 ? d.qty : 1,
        ],
      );
    }
  });
}
