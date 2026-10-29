import type { Vehicle, VehicleInput } from "../types";
import { notifyWorkshopSync } from "../lib/workshopSync";
import { getDb } from "./index";

const VEHICLE_SELECT = `v.*, c.name AS customer_name`;

const VEHICLE_FROM = `FROM vehicles v LEFT JOIN customers c ON c.id = v.customer_id`;

export async function listVehicles(customerId?: number | null): Promise<Vehicle[]> {
  const db = await getDb();
  if (customerId != null) {
    return db.select<Vehicle[]>(
      `SELECT ${VEHICLE_SELECT} ${VEHICLE_FROM}
       WHERE v.active = 1 AND v.customer_id = $1
       ORDER BY v.plate`,
      [customerId],
    );
  }
  return db.select<Vehicle[]>(
    `SELECT ${VEHICLE_SELECT} ${VEHICLE_FROM}
     WHERE v.active = 1
     ORDER BY v.plate
     LIMIT 500`,
  );
}

export async function listVehiclesWithoutCustomer(): Promise<Vehicle[]> {
  const db = await getDb();
  return db.select<Vehicle[]>(
    `SELECT ${VEHICLE_SELECT} ${VEHICLE_FROM}
     WHERE v.active = 1 AND v.customer_id IS NULL
     ORDER BY v.plate
     LIMIT 500`,
  );
}

export async function getVehicle(id: number): Promise<Vehicle | null> {
  const db = await getDb();
  const rows = await db.select<Vehicle[]>(
    `SELECT ${VEHICLE_SELECT} ${VEHICLE_FROM} WHERE v.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function findVehicleByPlate(plate: string): Promise<Vehicle | null> {
  const key = normalizePlate(plate);
  if (key.length < 5) return null;
  const db = await getDb();
  const rows = await db.select<Vehicle[]>(
    `SELECT ${VEHICLE_SELECT} ${VEHICLE_FROM} WHERE v.active = 1`,
  );
  return rows.find((row) => normalizePlate(row.plate) === key) ?? null;
}

export async function createVehicle(input: VehicleInput): Promise<number> {
  const plate = input.plate.trim().toUpperCase();
  if (!plate) throw new Error("Indicá la patente del vehículo.");
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO vehicles
       (customer_id, plate, kind, brand, model, year, odometer_km, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.customer_id,
      plate,
      input.kind?.trim() || null,
      input.brand?.trim() || null,
      input.model?.trim() || null,
      input.year ?? null,
      input.odometer_km ?? null,
      input.notes?.trim() || null,
    ],
  );
  const id = res.lastInsertId as number;
  void notifyWorkshopSync("vehicle", id);
  return id;
}

export async function updateVehicle(id: number, input: VehicleInput): Promise<void> {
  const plate = input.plate.trim().toUpperCase();
  if (!plate) throw new Error("Indicá la patente del vehículo.");
  const db = await getDb();
  await db.execute(
    `UPDATE vehicles SET
       customer_id=$1, plate=$2, kind=$3, brand=$4, model=$5, year=$6,
       odometer_km=$7, notes=$8,
       updated_at=datetime('now','localtime')
     WHERE id=$9`,
    [
      input.customer_id,
      plate,
      input.kind?.trim() || null,
      input.brand?.trim() || null,
      input.model?.trim() || null,
      input.year ?? null,
      input.odometer_km ?? null,
      input.notes?.trim() || null,
      id,
    ],
  );
  void notifyWorkshopSync("vehicle", id);
}

export interface VehicleHistory {
  appointments: { id: number; title: string; starts_at: string; status: string }[];
  quotes: { id: number; quote_number: string; status: string; total: number; created_at: string }[];
  orders: { id: number; order_number: string; title: string; status: string; total: number; created_at: string }[];
}

export async function getVehicleHistory(vehicleId: number): Promise<VehicleHistory> {
  const db = await getDb();
  const [appointments, quotes, orders] = await Promise.all([
    db.select<VehicleHistory["appointments"]>(
      `SELECT id, title, starts_at, status FROM appointments
       WHERE vehicle_id = $1 ORDER BY starts_at DESC LIMIT 20`,
      [vehicleId],
    ),
    db.select<VehicleHistory["quotes"]>(
      `SELECT id, quote_number, status, total, created_at FROM quotes
       WHERE vehicle_id = $1 ORDER BY id DESC LIMIT 20`,
      [vehicleId],
    ),
    db.select<VehicleHistory["orders"]>(
      `SELECT id, order_number, title, status, total, created_at FROM service_orders
       WHERE vehicle_id = $1 ORDER BY id DESC LIMIT 20`,
      [vehicleId],
    ),
  ]);
  return { appointments, quotes, orders };
}
