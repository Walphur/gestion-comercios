import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

/** Devuelve la conexión a la base SQLite local (se abre una sola vez). */
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:gestion.db");
  }
  return dbPromise;
}
