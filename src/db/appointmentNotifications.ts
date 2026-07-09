import { getDb } from "./index";

export interface RescheduleAlert {
  id: number;
  appointment_id: number;
  sent_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  title: string;
  starts_at: string;
}

export async function listUnreadRescheduleAlerts(): Promise<RescheduleAlert[]> {
  const db = await getDb();
  return db.select<RescheduleAlert[]>(
    `SELECT n.id, n.appointment_id, n.sent_at,
            a.customer_name, a.customer_phone, a.title, a.starts_at
     FROM appointment_notifications n
     INNER JOIN appointments a ON a.id = n.appointment_id
     WHERE n.kind = 'whatsapp_reschedule' AND n.seen_at IS NULL
     ORDER BY n.sent_at DESC
     LIMIT 20`,
  );
}

export async function countUnreadRescheduleAlerts(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM appointment_notifications
     WHERE kind = 'whatsapp_reschedule' AND seen_at IS NULL`,
  );
  return rows[0]?.n ?? 0;
}

export async function markRescheduleAlertSeen(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE appointment_notifications
     SET seen_at = datetime('now','localtime')
     WHERE id = $1`,
    [id],
  );
}

export async function markRescheduleAlertsSeenForAppointment(appointmentId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE appointment_notifications
     SET seen_at = datetime('now','localtime')
     WHERE appointment_id = $1 AND kind = 'whatsapp_reschedule' AND seen_at IS NULL`,
    [appointmentId],
  );
}
