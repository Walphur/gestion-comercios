import type { Appointment, AppointmentStatus } from "../types";
import { notifyWorkshopSync } from "../lib/workshopSync";
import {
  rangesOverlap,
  resourceAllowed,
  sameResource,
  slotInsideHours,
} from "../lib/appointmentRules";
import { getWorkshopResource } from "./workshopResources";
import { getSetting } from "./settings";
import { getDb } from "./index";

export interface AppointmentInput {
  customer_id: number | null;
  vehicle_id?: number | null;
  title: string;
  resource_id?: number | null;
  resource_name?: string | null;
  subject_notes?: string | null;
  starts_at: string;
  ends_at: string;
  notes?: string | null;
  user_id?: number | null;
}

async function resolveResourceFields(
  resourceId: number | null | undefined,
  resourceName: string | null | undefined,
): Promise<{ resource_id: number | null; resource_name: string | null }> {
  if (resourceId) {
    const r = await getWorkshopResource(resourceId);
    return {
      resource_id: resourceId,
      resource_name: r?.name ?? (resourceName?.trim() || null),
    };
  }
  return {
    resource_id: null,
    resource_name: resourceName?.trim() || null,
  };
}

const APPOINTMENT_SELECT = `a.*,
            c.name AS customer_name,
            c.phone AS customer_phone,
            u.display_name AS seller_name,
            v.plate AS vehicle_plate,
            v.brand AS vehicle_brand,
            v.model AS vehicle_model`;

const APPOINTMENT_FROM = `FROM appointments a
     LEFT JOIN customers c ON c.id = a.customer_id
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN vehicles v ON v.id = a.vehicle_id`;

function dayRange(dateYmd: string): { from: string; to: string } {
  return {
    from: `${dateYmd} 00:00:00`,
    to: `${dateYmd} 23:59:59`,
  };
}

export function buildDateTime(dateYmd: string, timeHm: string): string {
  const t = timeHm.length === 5 ? `${timeHm}:00` : timeHm;
  return `${dateYmd} ${t}`;
}

export function addMinutesToDateTime(startIso: string, minutes: number): string {
  const d = new Date(startIso.replace(" ", "T"));
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function listAppointmentsForDay(dateYmd: string): Promise<Appointment[]> {
  const db = await getDb();
  const { from, to } = dayRange(dateYmd);
  return db.select<Appointment[]>(
    `SELECT ${APPOINTMENT_SELECT}
     ${APPOINTMENT_FROM}
     WHERE a.starts_at >= $1 AND a.starts_at <= $2
     ORDER BY a.starts_at`,
    [from, to],
  );
}

export async function listUpcomingAppointments(limit = 30): Promise<Appointment[]> {
  const db = await getDb();
  return db.select<Appointment[]>(
    `SELECT ${APPOINTMENT_SELECT}
     ${APPOINTMENT_FROM}
     WHERE a.starts_at >= datetime('now','localtime')
       AND a.status NOT IN ('cancelled', 'completed', 'no_show')
     ORDER BY a.starts_at
     LIMIT $1`,
    [limit],
  );
}

export async function getAppointment(id: number): Promise<Appointment | null> {
  const db = await getDb();
  const rows = await db.select<Appointment[]>(
    `SELECT ${APPOINTMENT_SELECT}
     ${APPOINTMENT_FROM}
     WHERE a.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function staffForTitle(title: string): Promise<number[] | null> {
  const db = await getDb();
  const rows = await db.select<{ id: number; ids: string | null }[]>(
    `SELECT p.id,
            (SELECT group_concat(sr.resource_id) FROM service_resources sr WHERE sr.product_id = p.id) AS ids
     FROM products p
     WHERE p.active = 1
       AND lower(trim(p.name)) = lower(trim($1))
       AND lower(p.unit) IN ('servicio', 'práctica', 'practica', 'sesión', 'sesion')
     LIMIT 1`,
    [title],
  );
  const row = rows[0];
  if (!row) return null;
  return String(row.ids ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function assertAppointmentRules(input: AppointmentInput, ignoreId?: number): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new Error("Indicá el servicio o motivo del turno.");
  if (input.ends_at <= input.starts_at) {
    throw new Error("La hora de fin debe ser posterior al inicio.");
  }
  const minutes = Math.round(
    (new Date(input.ends_at.replace(" ", "T")).getTime() -
      new Date(input.starts_at.replace(" ", "T")).getTime()) /
      60000,
  );
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 480) {
    throw new Error("La duración del turno no es válida.");
  }
  const rubro = await getSetting("rubro");
  const allowed = await staffForTitle(title);
  const verdict = resourceAllowed(allowed, input.resource_id ?? null, rubro === "clinica");
  if (verdict === "missing-staff") {
    throw new Error("Este servicio no tiene profesionales habilitados. Asignalos en Servicios.");
  }
  if (verdict === "need-resource" || verdict === "not-allowed") {
    throw new Error("Ese profesional no está habilitado para este servicio.");
  }
  const hours = await getSetting("booking_hours");
  if (!slotInsideHours(input.starts_at, input.ends_at, hours)) {
    throw new Error("Ese horario está fuera del horario de atención.");
  }
  const db = await getDb();
  const rows = await db.select<
    { id: number; resource_id: number | null; resource_name: string | null; starts_at: string; ends_at: string }[]
  >(
    `SELECT id, resource_id, resource_name, starts_at, ends_at
     FROM appointments
     WHERE status IN ('scheduled', 'confirmed', 'in_progress', 'completed')
       AND starts_at < $1 AND ends_at > $2`,
    [input.ends_at, input.starts_at],
  );
  const clash = rows.some(
    (row) =>
      row.id !== ignoreId &&
      rangesOverlap(input.starts_at, input.ends_at, row.starts_at, row.ends_at) &&
      sameResource(input.resource_id, input.resource_name, row.resource_id, row.resource_name),
  );
  if (clash) throw new Error("Ese horario ya está ocupado para ese profesional.");
}

export async function createAppointment(input: AppointmentInput): Promise<number> {
  await assertAppointmentRules(input);
  const title = input.title.trim();
  const db = await getDb();
  const resource = await resolveResourceFields(input.resource_id, input.resource_name);
  const res = await db.execute(
    `INSERT INTO appointments
       (customer_id, vehicle_id, title, resource_id, resource_name, subject_notes, starts_at, ends_at, notes, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.customer_id,
      input.vehicle_id ?? null,
      title,
      resource.resource_id,
      resource.resource_name,
      input.subject_notes?.trim() || null,
      input.starts_at,
      input.ends_at,
      input.notes?.trim() || null,
      input.user_id ?? null,
    ],
  );
  const id = res.lastInsertId as number;
  void notifyWorkshopSync("appointment", id);
  return id;
}

export async function updateAppointment(id: number, input: AppointmentInput): Promise<void> {
  const existing = await getAppointment(id);
  if (!existing) throw new Error("Turno no encontrado.");
  if (existing.status === "completed" || existing.status === "cancelled") {
    throw new Error("No se puede editar un turno finalizado o cancelado.");
  }
  await assertAppointmentRules(input, id);
  const title = input.title.trim();
  const db = await getDb();
  const resource = await resolveResourceFields(input.resource_id, input.resource_name);
  await db.execute(
    `UPDATE appointments SET
       customer_id=$1, vehicle_id=$2, title=$3, resource_id=$4, resource_name=$5, subject_notes=$6,
       starts_at=$7, ends_at=$8, notes=$9,
       updated_at=datetime('now','localtime')
     WHERE id=$10`,
    [
      input.customer_id,
      input.vehicle_id ?? null,
      title,
      resource.resource_id,
      resource.resource_name,
      input.subject_notes?.trim() || null,
      input.starts_at,
      input.ends_at,
      input.notes?.trim() || null,
      id,
    ],
  );
  void notifyWorkshopSync("appointment", id);
}

export async function setAppointmentStatus(
  id: number,
  status: AppointmentStatus,
): Promise<void> {
  const existing = await getAppointment(id);
  if (!existing) throw new Error("Turno no encontrado.");
  const db = await getDb();
  await db.execute(
    `UPDATE appointments SET status=$1, updated_at=datetime('now','localtime') WHERE id=$2`,
    [status, id],
  );
  void notifyWorkshopSync("appointment", id);
}

export async function deleteAppointment(id: number): Promise<void> {
  const existing = await getAppointment(id);
  if (!existing) return;
  if (existing.status === "in_progress") {
    throw new Error("No se puede eliminar un turno en curso.");
  }
  const db = await getDb();
  await db.execute("DELETE FROM appointments WHERE id = $1", [id]);
}

export async function listDistinctResources(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ resource_name: string }[]>(
    `SELECT DISTINCT resource_name FROM appointments
     WHERE resource_name IS NOT NULL AND trim(resource_name) != ''
     ORDER BY resource_name`,
  );
  return rows.map((r) => r.resource_name);
}
