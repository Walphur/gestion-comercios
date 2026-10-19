import { getDb } from "./index";
import { getSetting, setSetting } from "./settings";
import { resolveAppVersion } from "../lib/appVersion";
import { notesSince } from "../lib/whatsNew";
import type { ChangeContext, ReleaseNote } from "../config/changelog";

const SEEN_KEY = "whats_new_seen";
/** Instalaciones que ya existían antes de las novedades: ven desde acá. */
const BASELINE = "1.2.73";

/**
 * Una PC actualizada tiene la primera y la última migración con fechas distintas;
 * una instalación nueva las corre todas juntas.
 */
async function wasUpdated(): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = await db.select<{ hours: number | null }[]>(
      `SELECT (julianday(MAX(installed_on)) - julianday(MIN(installed_on))) * 24 AS hours
       FROM _sqlx_migrations`,
    );
    return (rows[0]?.hours ?? 0) > 1;
  } catch {
    return false;
  }
}

export interface PendingNotes {
  version: string;
  notes: ReleaseNote[];
}

export async function loadPendingNotes(ctx: ChangeContext): Promise<PendingNotes | null> {
  const current = await resolveAppVersion();
  let seen = await getSetting(SEEN_KEY);
  if (!seen) {
    if (!(await wasUpdated())) {
      await setSetting(SEEN_KEY, current);
      return null;
    }
    seen = BASELINE;
  }
  const notes = notesSince(seen, current, ctx);
  if (notes.length === 0) {
    if (seen !== current) await setSetting(SEEN_KEY, current);
    return null;
  }
  return { version: current, notes };
}

export async function markNotesSeen(version: string): Promise<void> {
  await setSetting(SEEN_KEY, version);
}
