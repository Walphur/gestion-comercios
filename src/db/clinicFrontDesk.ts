import type { AppointmentStatus } from "../types";
import { getDb } from "./index";

export interface ClinicDayTurn {
  id: number;
  starts_at: string;
  title: string;
  status: AppointmentStatus;
  resource_id: number | null;
  resource_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  insurance: string | null;
}

export interface ClinicServiceRow {
  id: number;
  name: string;
  professionals: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function listClinicDayTurns(dateYmd: string): Promise<ClinicDayTurn[]> {
  if (!DAY.test(dateYmd)) return [];
  const db = await getDb();
  return db.select<ClinicDayTurn[]>(
    `SELECT a.id, a.starts_at, a.title, a.status, a.resource_id, a.resource_name,
            c.name AS customer_name, c.phone AS customer_phone, c.insurance AS insurance
     FROM appointments a
     LEFT JOIN customers c ON c.id = a.customer_id
     WHERE a.starts_at >= $1 AND a.starts_at <= $2
       AND a.status != 'cancelled'
     ORDER BY a.starts_at`,
    [`${dateYmd} 00:00:00`, `${dateYmd} 23:59:59`],
  );
}

export async function listClinicServices(): Promise<ClinicServiceRow[]> {
  const db = await getDb();
  return db.select<ClinicServiceRow[]>(
    `SELECT p.id, p.name,
            (
              SELECT group_concat(r.name, ' · ')
              FROM service_resources sr
              JOIN workshop_resources r ON r.id = sr.resource_id AND r.active = 1
              WHERE sr.product_id = p.id
            ) AS professionals
     FROM products p
     WHERE p.active = 1
       AND lower(p.unit) IN ('servicio', 'práctica', 'practica', 'sesión', 'sesion')
     ORDER BY p.name
     LIMIT 40`,
  );
}
