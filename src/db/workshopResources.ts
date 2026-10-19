import type { WorkshopResource, WorkshopResourceInput } from "../types";
import { getDb } from "./index";

export async function listWorkshopResources(search = ""): Promise<WorkshopResource[]> {
  const db = await getDb();
  if (search.trim()) {
    const q = `%${search.trim()}%`;
    return db.select<WorkshopResource[]>(
      `SELECT * FROM workshop_resources
       WHERE active = 1 AND (name LIKE $1 OR notes LIKE $1)
       ORDER BY sort_order, name LIMIT 100`,
      [q],
    );
  }
  return db.select<WorkshopResource[]>(
    "SELECT * FROM workshop_resources WHERE active = 1 ORDER BY sort_order, name LIMIT 200",
  );
}

/** Incluye inactivos — solo para administración. */
export async function listAllWorkshopResources(): Promise<WorkshopResource[]> {
  const db = await getDb();
  return db.select<WorkshopResource[]>(
    "SELECT * FROM workshop_resources ORDER BY sort_order, name",
  );
}

export async function getWorkshopResource(id: number): Promise<WorkshopResource | null> {
  const db = await getDb();
  const rows = await db.select<WorkshopResource[]>(
    "SELECT * FROM workshop_resources WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

function commissionPct(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  if (value < 0 || value > 100) throw new Error("La comisión va de 0 a 100 %.");
  return Math.round(value * 100) / 100;
}

export async function createWorkshopResource(input: WorkshopResourceInput): Promise<number> {
  const name = input.name.trim();
  if (!name) throw new Error("El nombre es obligatorio.");
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO workshop_resources (name, notes, sort_order, commission_service_pct, commission_product_pct)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      name,
      input.notes?.trim() || null,
      input.sort_order ?? 0,
      commissionPct(input.commission_service_pct),
      commissionPct(input.commission_product_pct),
    ],
  );
  return res.lastInsertId as number;
}

export async function updateWorkshopResource(
  id: number,
  input: WorkshopResourceInput,
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("El nombre es obligatorio.");
  const db = await getDb();
  await db.execute(
    `UPDATE workshop_resources
     SET name = $1, notes = $2, sort_order = $3,
         commission_service_pct = COALESCE($4, commission_service_pct),
         commission_product_pct = COALESCE($5, commission_product_pct),
         updated_at = datetime('now','localtime')
     WHERE id = $6`,
    [
      name,
      input.notes?.trim() || null,
      input.sort_order ?? 0,
      input.commission_service_pct == null ? null : commissionPct(input.commission_service_pct),
      input.commission_product_pct == null ? null : commissionPct(input.commission_product_pct),
      id,
    ],
  );
}

export async function deactivateWorkshopResource(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE workshop_resources SET active = 0, updated_at = datetime('now','localtime')
     WHERE id = $1`,
    [id],
  );
}

export async function listWorkshopResourceFilterOptions(): Promise<string[]> {
  const db = await getDb();
  const catalog = await db.select<{ name: string }[]>(
    "SELECT name FROM workshop_resources WHERE active = 1 ORDER BY sort_order, name",
  );
  const legacy = await db.select<{ resource_name: string }[]>(
    `SELECT DISTINCT resource_name FROM appointments
     WHERE resource_name IS NOT NULL AND trim(resource_name) != ''
       AND (resource_id IS NULL OR resource_id NOT IN (
         SELECT id FROM workshop_resources WHERE active = 1
       ))
     ORDER BY resource_name`,
  );
  const names = new Set<string>();
  for (const r of catalog) names.add(r.name);
  for (const r of legacy) names.add(r.resource_name);
  return [...names].sort((a, b) => a.localeCompare(b, "es"));
}
