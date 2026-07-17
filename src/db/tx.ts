import { getDb } from "./index";

/**
 * Ejecuta trabajo de negocio en una única transacción SQLite.
 * BEGIN IMMEDIATE → COMMIT; ante cualquier error → ROLLBACK.
 *
 * - Serializa TXs en JS (una sola a la vez sobre la conexión del plugin).
 * - Antes de BEGIN hace ROLLBACK preventivo: limpia transacciones huérfanas
 *   que dejan el error "cannot start a transaction within a transaction"
 *   aunque el usuario no vea otra operación en curso.
 */

let txChain: Promise<unknown> = Promise.resolve();

function rawMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function isNestedTxError(e: unknown): boolean {
  const m = rawMsg(e).toLowerCase();
  return (
    m.includes("within a transaction") ||
    m.includes("cannot start a transaction") ||
    m.includes("transaction within")
  );
}

function isBusyError(e: unknown): boolean {
  const m = rawMsg(e).toLowerCase();
  return (
    m.includes("database is locked") ||
    m.includes("database is busy") ||
    m.includes("sqlite_busy") ||
    m.includes("sqlite_locked") ||
    (m.includes("busy") && m.includes("database"))
  );
}

async function clearOrphanTransaction(): Promise<void> {
  const db = await getDb();
  try {
    await db.execute("ROLLBACK");
  } catch {
    /* no había TX abierta — normal */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withImmediateTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const db = await getDb();
    const maxAttempts = 8;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await clearOrphanTransaction();

      try {
        await db.execute("BEGIN IMMEDIATE");
      } catch (error) {
        lastError = error;
        if ((isBusyError(error) || isNestedTxError(error)) && attempt < maxAttempts) {
          await clearOrphanTransaction();
          await sleep(50 * attempt * attempt);
          continue;
        }
        if (isNestedTxError(error)) {
          throw new Error(
            "La base quedó en un estado inconsistente. Cerrá y volvé a abrir la app, e intentá de nuevo.",
          );
        }
        if (isBusyError(error)) {
          throw new Error(
            "La base de datos está ocupada (otra operación en curso). Esperá un segundo e intentá de nuevo.",
          );
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
          /* ok */
        }
        lastError = error;
        if ((isBusyError(error) || isNestedTxError(error)) && attempt < maxAttempts) {
          await sleep(50 * attempt * attempt);
          continue;
        }
        throw error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };

  const next = txChain.then(run, run);
  // No bloquear la cola si esta TX falla.
  txChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
