import { closeDb } from "../db";

/** Cierra la conexión JS antes de operaciones Rust en SQLite (evita «database malformed»). */
export async function withRustDb<T>(fn: () => Promise<T>): Promise<T> {
  await closeDb();
  return fn();
}
