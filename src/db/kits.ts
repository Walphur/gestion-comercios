import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

export interface KitComponentDraft {
  component_product_id: number;
  name: string;
  qty: number;
}

export async function listKitComponents(productId: number): Promise<KitComponentDraft[]> {
  const db = await getDb();
  return db.select<KitComponentDraft[]>(
    `SELECT ki.component_product_id, p.name, ki.qty
     FROM product_kits pk
     JOIN kit_items ki ON ki.kit_id = pk.id
     JOIN products p ON p.id = ki.component_product_id
     WHERE pk.kit_product_id = $1
     ORDER BY p.name`,
    [productId],
  );
}

/** Guarda el combo (kit). Si items está vacío, lo elimina. */
export async function saveProductKit(
  productId: number,
  items: { component_product_id: number; qty: number }[],
): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const cleaned = items
      .filter((i) => i.component_product_id > 0 && i.qty > 0)
      .filter((i) => i.component_product_id !== productId);

    if (cleaned.length === 0) {
      await db.execute("DELETE FROM kit_items WHERE kit_id IN (SELECT id FROM product_kits WHERE kit_product_id = $1)", [
        productId,
      ]);
      await db.execute("DELETE FROM product_kits WHERE kit_product_id = $1", [productId]);
      await db.execute("UPDATE products SET is_kit = 0, updated_at=datetime('now','localtime') WHERE id = $1", [
        productId,
      ]);
      return;
    }

    await db.execute("UPDATE products SET is_kit = 1, updated_at=datetime('now','localtime') WHERE id = $1", [
      productId,
    ]);

    let kitRows = await db.select<{ id: number }[]>(
      "SELECT id FROM product_kits WHERE kit_product_id = $1",
      [productId],
    );
    if (!kitRows.length) {
      const res = await db.execute(
        "INSERT INTO product_kits (kit_product_id) VALUES ($1)",
        [productId],
      );
      kitRows = [{ id: res.lastInsertId as number }];
    }
    const kitId = kitRows[0].id;
    await db.execute("DELETE FROM kit_items WHERE kit_id = $1", [kitId]);
    for (const it of cleaned) {
      await db.execute(
        `INSERT INTO kit_items (kit_id, component_product_id, qty)
         VALUES ($1, $2, $3)`,
        [kitId, it.component_product_id, it.qty],
      );
    }
  });
}
