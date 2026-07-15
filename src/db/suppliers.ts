import type { Supplier } from "../types";
import { getDb } from "./index";

export async function listSuppliers(): Promise<Supplier[]> {
  const db = await getDb();
  return db.select<Supplier[]>("SELECT * FROM suppliers ORDER BY name");
}

export async function createSupplier(name: string, phone?: string, notes?: string): Promise<number> {
  const db = await getDb();
  await db.execute("INSERT OR IGNORE INTO suppliers (name, phone, notes) VALUES ($1,$2,$3)", [
    name.trim(),
    phone?.trim() || null,
    notes?.trim() || null,
  ]);
  const rows = await db.select<{ id: number }[]>("SELECT id FROM suppliers WHERE name = $1", [
    name.trim(),
  ]);
  return rows[0]?.id ?? 0;
}

export async function deleteSupplier(id: number): Promise<void> {
  const { withImmediateTransaction } = await import("./tx");
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await db.execute("UPDATE products SET supplier_id = NULL WHERE supplier_id = $1", [id]);
    await db.execute("DELETE FROM suppliers WHERE id = $1", [id]);
  });
}

export async function ensureSupplier(name: string): Promise<number> {
  const id = await createSupplier(name);
  if (id) return id;
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>("SELECT id FROM suppliers WHERE name = $1", [
    name,
  ]);
  return rows[0].id;
}
