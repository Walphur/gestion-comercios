import { getDb } from "./index";

export interface ActionLogRow {
  id: number;
  user_id: number | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  details: string | null;
  created_at: string;
  display_name?: string;
}

export async function listActionLog(limit = 200): Promise<ActionLogRow[]> {
  const db = await getDb();
  return db.select<ActionLogRow[]>(
    `SELECT a.*, u.display_name
     FROM action_log a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC LIMIT $1`,
    [limit],
  );
}
