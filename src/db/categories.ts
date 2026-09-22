import type { Category } from "../types";
import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  return db.select<Category[]>("SELECT * FROM categories ORDER BY name");
}

export async function createCategory(name: string): Promise<number> {
  const db = await getDb();
  const trimmed = name.trim();
  if (!trimmed) return 0;
  await db.execute("INSERT OR IGNORE INTO categories (name) VALUES ($1)", [trimmed]);
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM categories WHERE name = $1",
    [trimmed],
  );
  return rows[0]?.id ?? 0;
}

/** Crea categorías sugeridas del rubro sin borrar las existentes. */
export async function ensureSuggestedCategories(names: string[]): Promise<void> {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return;
  const db = await getDb();
  for (const name of cleaned) {
    await db.execute("INSERT OR IGNORE INTO categories (name) VALUES ($1)", [name]);
  }
}

export async function deleteCategory(id: number): Promise<number> {
  return withImmediateTransaction(async () => {
    const db = await getDb();
    await db.execute("UPDATE products SET category_id = NULL WHERE category_id = $1", [id]);
    const res = await db.execute("DELETE FROM categories WHERE id = $1", [id]);
    return res.rowsAffected ?? 0;
  });
}
