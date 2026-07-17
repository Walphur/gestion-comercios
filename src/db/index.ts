import Database from "@tauri-apps/plugin-sql";

const DB_URI = "sqlite:gestion.db";

let dbPromise: Promise<Database> | null = null;

/** Devuelve la conexión a la base SQLite local (se abre una sola vez). */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.load(DB_URI);
      try {
        // Evita fallos intermitentes cuando Rust (sync/licencia) también escribe.
        await db.execute("PRAGMA busy_timeout = 30000");
        await db.execute("PRAGMA foreign_keys = ON");
      } catch {
        /* pragmas best-effort */
      }
      return db;
    })();
  }
  return dbPromise;
}

/** Cierra la conexión JS antes de tareas pesadas en Rust (evita corrupción). */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    await db.close(DB_URI);
  } catch {
    /* ya cerrada */
  }
  dbPromise = null;
}
