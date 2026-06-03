import type { Category } from "../types";
import { getDb } from "./index";

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  return db.select<Category[]>("SELECT * FROM categories ORDER BY name");
}

export async function createCategory(name: string): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT OR IGNORE INTO categories (name) VALUES ($1)", [
    name.trim(),
  ]);
}

export async function deleteCategory(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM categories WHERE id = $1", [id]);
}
