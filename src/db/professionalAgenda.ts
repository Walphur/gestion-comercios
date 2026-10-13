import type { AppointmentStatus } from "../types";
import { getDb } from "./index";

export interface ProfessionalAgendaEntry {
  id: number;
  starts_at: string;
  ends_at: string;
  title: string;
  status: AppointmentStatus;
  customer_name: string | null;
  customer_phone: string | null;
  insurance: string | null;
  affiliate_number: string | null;
  has_visit_note: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function listProfessionalAgenda(
  dateYmd: string,
  resourceId: number,
  resourceName: string,
): Promise<ProfessionalAgendaEntry[]> {
  if (!DAY.test(dateYmd) || !Number.isInteger(resourceId) || resourceId <= 0) return [];
  const db = await getDb();
  return db.select<ProfessionalAgendaEntry[]>(
    `SELECT a.id, a.starts_at, a.ends_at, a.title, a.status,
            c.name AS customer_name,
            c.phone AS customer_phone,
            c.insurance AS insurance,
            c.affiliate_number AS affiliate_number,
            CASE
              WHEN n.id IS NOT NULL AND length(trim(n.body)) > 0 THEN 1
              ELSE 0
            END AS has_visit_note
     FROM appointments a
     LEFT JOIN customers c ON c.id = a.customer_id
     LEFT JOIN appointment_visit_notes n ON n.appointment_id = a.id
     WHERE a.starts_at >= $1 AND a.starts_at <= $2
       AND a.status != 'cancelled'
       AND (
         a.resource_id = $3
         OR (
           a.resource_id IS NULL
           AND lower(trim(a.resource_name)) = lower(trim($4))
         )
       )
     ORDER BY a.starts_at`,
    [`${dateYmd} 00:00:00`, `${dateYmd} 23:59:59`, resourceId, resourceName],
  );
}
