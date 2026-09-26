import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";
import { recipeUnitCost } from "../lib/recipeMath";

export interface RecipeItemDraft {
  ingredient_product_id: number;
  name: string;
  unit: string;
  cost: number;
  stock: number;
  qty: number;
}

export interface ProductRecipe {
  id: number;
  product_id: number;
  yield_qty: number;
  notes: string | null;
  items: RecipeItemDraft[];
}

export async function getProductRecipe(productId: number): Promise<ProductRecipe | null> {
  const db = await getDb();
  const rows = await db.select<{ id: number; product_id: number; yield_qty: number; notes: string | null }[]>(
    `SELECT id, product_id, yield_qty, notes FROM product_recipes WHERE product_id = $1`,
    [productId],
  );
  if (!rows.length) return null;
  const recipe = rows[0];
  const items = await db.select<RecipeItemDraft[]>(
    `SELECT ri.ingredient_product_id, p.name, p.unit, p.cost, p.stock, ri.qty
     FROM recipe_items ri
     JOIN products p ON p.id = ri.ingredient_product_id
     WHERE ri.recipe_id = $1
     ORDER BY p.name`,
    [recipe.id],
  );
  return { ...recipe, items };
}

/** qty de cada insumo por 1 unidad del producto (dividido por yield). */
export async function getRecipeQtyPerUnit(
  productId: number,
): Promise<{ ingredient_product_id: number; qty: number }[]> {
  const recipe = await getProductRecipe(productId);
  if (!recipe || recipe.items.length === 0) return [];
  const y = recipe.yield_qty > 0 ? recipe.yield_qty : 1;
  return recipe.items.map((it) => ({
    ingredient_product_id: it.ingredient_product_id,
    qty: it.qty / y,
  }));
}

export async function saveProductRecipe(
  productId: number,
  input: {
    yield_qty: number;
    notes?: string | null;
    items: { ingredient_product_id: number; qty: number }[];
  } | null,
): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    if (!input || input.items.length === 0) {
      await db.execute(
        "DELETE FROM recipe_items WHERE recipe_id IN (SELECT id FROM product_recipes WHERE product_id = $1)",
        [productId],
      );
      await db.execute("DELETE FROM product_recipes WHERE product_id = $1", [productId]);
      return;
    }

    const cleaned = input.items
      .filter((i) => i.ingredient_product_id > 0 && i.qty > 0)
      .filter((i) => i.ingredient_product_id !== productId);

    if (cleaned.length === 0) {
      await db.execute(
        "DELETE FROM recipe_items WHERE recipe_id IN (SELECT id FROM product_recipes WHERE product_id = $1)",
        [productId],
      );
      await db.execute("DELETE FROM product_recipes WHERE product_id = $1", [productId]);
      return;
    }

    const yieldQty = input.yield_qty > 0 ? input.yield_qty : 1;
    let rows = await db.select<{ id: number }[]>(
      "SELECT id FROM product_recipes WHERE product_id = $1",
      [productId],
    );
    if (!rows.length) {
      const res = await db.execute(
        `INSERT INTO product_recipes (product_id, yield_qty, notes) VALUES ($1, $2, $3)`,
        [productId, yieldQty, input.notes ?? null],
      );
      rows = [{ id: res.lastInsertId as number }];
    } else {
      await db.execute(
        `UPDATE product_recipes
         SET yield_qty = $1, notes = $2, updated_at = datetime('now','localtime')
         WHERE id = $3`,
        [yieldQty, input.notes ?? null, rows[0].id],
      );
    }
    const recipeId = rows[0].id;
    await db.execute("DELETE FROM recipe_items WHERE recipe_id = $1", [recipeId]);
    for (const it of cleaned) {
      await db.execute(
        `INSERT INTO recipe_items (recipe_id, ingredient_product_id, qty) VALUES ($1, $2, $3)`,
        [recipeId, it.ingredient_product_id, it.qty],
      );
    }

    // Actualizar costo del elaborado si hay costos de insumos.
    const costs = await db.select<{ cost: number; qty: number }[]>(
      `SELECT p.cost, ri.qty FROM recipe_items ri
       JOIN products p ON p.id = ri.ingredient_product_id
       WHERE ri.recipe_id = $1`,
      [recipeId],
    );
    const unitCost = recipeUnitCost(
      costs.map((c) => ({ qtyPerYield: c.qty, unitCost: c.cost })),
      yieldQty,
    );
    if (unitCost > 0) {
      await db.execute(
        `UPDATE products SET cost = $1, updated_at = datetime('now','localtime') WHERE id = $2`,
        [Math.round(unitCost * 100) / 100, productId],
      );
    }
  });
}

export async function listRecipesForProducts(
  productIds: number[],
): Promise<Map<number, ProductRecipe>> {
  const map = new Map<number, ProductRecipe>();
  if (productIds.length === 0) return map;
  for (const id of productIds) {
    const r = await getProductRecipe(id);
    if (r) map.set(id, r);
  }
  return map;
}
