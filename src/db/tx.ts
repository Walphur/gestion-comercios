import { getDb } from "./index";

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
  await db.execute("BEGIN IMMEDIATE");
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
    throw error;
  }
}
