import { getDb } from "./index";

const MAX_NOTE_LENGTH = 4000;

export interface VisitNoteHistoryItem {
  appointment_id: number;
  starts_at: string;
  professional: string | null;
  service: string;
  body: string;
}

export async function getVisitNote(appointmentId: number): Promise<string> {
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) return "";
  const db = await getDb();
  const rows = await db.select<{ body: string }[]>(
    `SELECT body FROM appointment_visit_notes
     WHERE appointment_id = $1 AND length(trim(body)) > 0`,
    [appointmentId],
  );
  return rows[0]?.body ?? "";
}

export async function saveVisitNote(appointmentId: number, body: string): Promise<void> {
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    throw new Error("No se pudo guardar la nota.");
  }
  const text = body.trim();
  if (text.length > MAX_NOTE_LENGTH) {
    throw new Error("La nota es demasiado larga.");
  }
  const db = await getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM appointments WHERE id = $1",
    [appointmentId],
  );
  if (!existing.length) throw new Error("No se pudo guardar la nota.");
  if (!text) {
    await db.execute("DELETE FROM appointment_visit_notes WHERE appointment_id = $1", [
      appointmentId,
    ]);
    return;
  }
  await db.execute(
    `INSERT INTO appointment_visit_notes (appointment_id, body, updated_at)
     VALUES ($1, $2, datetime('now','localtime'))
     ON CONFLICT(appointment_id) DO UPDATE SET
       body = excluded.body,
       updated_at = datetime('now','localtime')`,
    [appointmentId, text],
  );
}

export async function listVisitNotesForCustomer(
  customerId: number,
): Promise<VisitNoteHistoryItem[]> {
  if (!Number.isInteger(customerId) || customerId <= 0) return [];
  const db = await getDb();
  return db.select<VisitNoteHistoryItem[]>(
    `SELECT a.id AS appointment_id,
            a.starts_at,
            NULLIF(trim(a.resource_name), '') AS professional,
            a.title AS service,
            n.body AS body
     FROM appointment_visit_notes n
     INNER JOIN appointments a ON a.id = n.appointment_id
     WHERE a.customer_id = $1
       AND length(trim(n.body)) > 0
     ORDER BY a.starts_at DESC
     LIMIT 100`,
    [customerId],
  );
}
