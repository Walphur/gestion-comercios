import type { VehicleInspection, VehicleInspectionInput } from "../types";
import { getDb } from "./index";

const SELECT = `i.*,
  c.name AS customer_name,
  v.plate AS vehicle_plate,
  v.brand AS vehicle_brand,
  v.model AS vehicle_model,
  v.year AS vehicle_year`;

const FROM = `FROM vehicle_inspections i
  LEFT JOIN customers c ON c.id = i.customer_id
  LEFT JOIN vehicles v ON v.id = i.vehicle_id`;

async function nextInspectionNumber(): Promise<string> {
  const db = await getDb();
  const year = new Date().getFullYear();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM vehicle_inspections
     WHERE inspection_number LIKE $1`,
    [`PER-${year}-%`],
  );
  const seq = (rows[0]?.n ?? 0) + 1;
  return `PER-${year}-${String(seq).padStart(4, "0")}`;
}

export async function listInspectionsForVehicle(vehicleId: number): Promise<VehicleInspection[]> {
  const db = await getDb();
  return db.select<VehicleInspection[]>(
    `SELECT ${SELECT} ${FROM}
     WHERE i.vehicle_id = $1
     ORDER BY i.id DESC
     LIMIT 50`,
    [vehicleId],
  );
}

export async function getInspection(id: number): Promise<VehicleInspection | null> {
  const db = await getDb();
  const rows = await db.select<VehicleInspection[]>(
    `SELECT ${SELECT} ${FROM} WHERE i.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createInspection(input: VehicleInspectionInput): Promise<number> {
  const db = await getDb();
  const number = await nextInspectionNumber();
  const res = await db.execute(
    `INSERT INTO vehicle_inspections
       (inspection_number, vehicle_id, customer_id, odometer_km, fuel_level,
        exterior_condition, interior_condition, belongings, customer_reported,
        notes, received_by, service_order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      number,
      input.vehicle_id,
      input.customer_id ?? null,
      input.odometer_km ?? null,
      input.fuel_level?.trim() || null,
      input.exterior_condition?.trim() || null,
      input.interior_condition?.trim() || null,
      input.belongings?.trim() || null,
      input.customer_reported?.trim() || null,
      input.notes?.trim() || null,
      input.received_by?.trim() || null,
      input.service_order_id ?? null,
    ],
  );
  const id = res.lastInsertId as number;

  if (input.odometer_km != null) {
    await db.execute(
      `UPDATE vehicles SET odometer_km = $1, updated_at = datetime('now','localtime')
       WHERE id = $2`,
      [input.odometer_km, input.vehicle_id],
    );
  }

  return id;
}

export async function updateInspection(
  id: number,
  input: Omit<VehicleInspectionInput, "vehicle_id"> & { vehicle_id?: number },
): Promise<void> {
  const db = await getDb();
  const existing = await getInspection(id);
  if (!existing) throw new Error("Peritaje no encontrado");

  await db.execute(
    `UPDATE vehicle_inspections SET
       odometer_km=$1, fuel_level=$2, exterior_condition=$3, interior_condition=$4,
       belongings=$5, customer_reported=$6, notes=$7, received_by=$8,
       updated_at=datetime('now','localtime')
     WHERE id=$9`,
    [
      input.odometer_km ?? null,
      input.fuel_level?.trim() || null,
      input.exterior_condition?.trim() || null,
      input.interior_condition?.trim() || null,
      input.belongings?.trim() || null,
      input.customer_reported?.trim() || null,
      input.notes?.trim() || null,
      input.received_by?.trim() || null,
      id,
    ],
  );

  if (input.odometer_km != null) {
    await db.execute(
      `UPDATE vehicles SET odometer_km = $1, updated_at = datetime('now','localtime')
       WHERE id = $2`,
      [input.odometer_km, existing.vehicle_id],
    );
  }
}
