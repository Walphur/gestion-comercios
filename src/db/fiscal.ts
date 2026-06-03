import { getDb } from "./index";

export interface SyncQueueRow {
  id: number;
  entity_type: string;
  entity_id: number;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
}

export async function listSyncQueue(limit = 50): Promise<SyncQueueRow[]> {
  const db = await getDb();
  return db.select<SyncQueueRow[]>(
    `SELECT id, entity_type, entity_id, status, attempts, last_error, created_at, processed_at
     FROM sync_queue ORDER BY id DESC LIMIT $1`,
    [limit],
  );
}

export async function countSyncByStatus(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.select<{ status: string; c: number }[]>(
    "SELECT status, COUNT(*) AS c FROM sync_queue GROUP BY status",
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.c;
  return out;
}
