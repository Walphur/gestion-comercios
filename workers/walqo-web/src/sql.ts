/**
 * Las consultas de src/db están escritas para el plugin SQL de la PC.
 * Acá se adaptan a la base SQLite del Durable Object.
 */

/** Argentina no tiene horario de verano: 'localtime' en la PC equivale a UTC−3. */
const LOCALTIME_RE = /'localtime'/gi;
const ARG_OFFSET = "'-3 hours'";

/** El plugin acepta $1, $2…; en el Durable Object van como ?1, ?2… */
const DOLLAR_PARAM_RE = /\$(\d+)/g;

export function adaptSql(sql: string): string {
  return sql.replace(LOCALTIME_RE, ARG_OFFSET).replace(DOLLAR_PARAM_RE, "?$1");
}

type SqlValue = string | number | null | ArrayBuffer;

function bindValue(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }
  return JSON.stringify(value);
}

function binds(values?: unknown[]): SqlValue[] {
  return (values ?? []).map(bindValue);
}

/** Pragmas que la PC pone al abrir la base y que acá no aplican. */
const IGNORED_RE = /^\s*PRAGMA\s+(busy_timeout|foreign_keys|journal_mode|synchronous)\b/i;
/** Las transacciones van por ctx.storage.transaction (src/db/tx.ts), no por SQL. */
const TX_RE = /^\s*(BEGIN|COMMIT|END|ROLLBACK)\b/i;

/** Desde el navegador (/v1/sql) no se tocan la licencia, la prueba ni el esquema interno. */
const BLOCKED_SQL = /_walqo_|sqlite_|\bATTACH\b|\bDETACH\b|\bPRAGMA\b/i;

export function assertBrowserSql(sql: string): void {
  if (BLOCKED_SQL.test(sql) && !IGNORED_RE.test(sql)) {
    throw new Error("Esa consulta no está permitida en WalQo Web.");
  }
}

export function runSelect(storage: DurableObjectStorage, sql: string, values?: unknown[]) {
  if (IGNORED_RE.test(sql)) return [];
  return storage.sql.exec(adaptSql(sql), ...binds(values)).toArray();
}

export function runExecute(storage: DurableObjectStorage, sql: string, values?: unknown[]) {
  if (IGNORED_RE.test(sql)) return { rowsAffected: 0, lastInsertId: 0 };
  if (TX_RE.test(sql)) {
    throw new Error("En la web las transacciones se abren con withImmediateTransaction.");
  }
  storage.sql.exec(adaptSql(sql), ...binds(values)).toArray();
  const info = storage.sql
    .exec<{ changes: number; id: number }>("SELECT changes() AS changes, last_insert_rowid() AS id")
    .one();
  return { rowsAffected: Number(info.changes), lastInsertId: Number(info.id) };
}
