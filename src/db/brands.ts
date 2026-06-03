import type { Brand } from "../types";
import { getDb } from "./index";

export async function listBrands(): Promise<Brand[]> {
  const db = await getDb();
  return db.select<Brand[]>("SELECT * FROM brands ORDER BY name");
}

export async function createBrand(name: string): Promise<number> {
  const db = await getDb();
  await db.execute("INSERT OR IGNORE INTO brands (name) VALUES ($1)", [name.trim()]);
  const rows = await db.select<{ id: number }[]>("SELECT id FROM brands WHERE name = $1", [
    name.trim(),
  ]);
  return rows[0]?.id ?? 0;
}

export async function deleteBrand(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE products SET brand_id = NULL WHERE brand_id = $1", [id]);
  await db.execute("DELETE FROM brands WHERE id = $1", [id]);
}

export async function ensureBrand(name: string): Promise<number> {
  const id = await createBrand(name);
  if (id) return id;
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>("SELECT id FROM brands WHERE name = $1", [name]);
  return rows[0].id;
}
