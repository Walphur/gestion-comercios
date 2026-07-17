import { getDb } from "./index";
import { isDbBusyError } from "../lib/userError";

/**
 * Ejecuta trabajo de negocio en una única transacción SQLite.
 * BEGIN IMMEDIATE → COMMIT; ante cualquier error → ROLLBACK.
 *
 * Importante: la conexión del plugin-sql es única; no anidar esta función
 * (el segundo BEGIN fallaría). Las APIs públicas de alto nivel deben
 * llamar a withImmediateTransaction; los helpers internos (stock, balance)
 * solo ejecutan statements y participan de la TX del caller.
 */
export async function withImmediateTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const db = await getDb();
  const maxAttempts = 6;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.execute("BEGIN IMMEDIATE");
    } catch (error) {
      lastError = error;
      if (isDbBusyError(error) && attempt < maxAttempts) {
        await sleep(40 * attempt * attempt);
        continue;
      }
      throw error;
    }

    try {
      const result = await fn();
      await db.execute("COMMIT");
      return result;
    } catch (error) {
      try {
        await db.execute("ROLLBACK");
      } catch {
        /* ROLLBACK puede fallar si ya no hay TX activa */
      }
      lastError = error;
      if (isDbBusyError(error) && attempt < maxAttempts) {
        await sleep(40 * attempt * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
