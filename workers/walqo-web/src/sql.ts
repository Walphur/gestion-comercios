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

/**
 * La consulta sin comentarios, textos ni nombres entre comillas: lo que queda son las
 * palabras de SQL, para revisarlas sin que un texto o un comentario las esconda.
 */
function sqlSkeleton(sql: string): string {
  let out = "";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      out += " ";
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i++;
      out += " ";
    } else if (c === "'" || c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c;
      const start = ++i;
      while (i < sql.length) {
        if (sql[i] === close) {
          if (close !== "]" && sql[i + 1] === close) i += 2;
          else break;
        } else i++;
      }
      // Un nombre entre comillas sigue siendo un nombre: se revisa igual que sin comillas.
      out += c === "'" ? " '' " : ` ${sql.slice(start, i).replace(/[^\w]/g, "_")} `;
    } else {
      out += c;
    }
  }
  return out;
}

const BROWSER_SQL_DENIED = "Esa consulta no está permitida en WalQo Web.";
/** Lo interno de WalQo y de SQLite, y lo que guarda PIN, contraseñas o claves. */
const BLOCKED_NAMES = /_walqo_|sqlite_|pragma_|\b(pin|admin_pin|password|password_hash|settings)\b/i;
const WRITE_WORDS =
  /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|ANALYZE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b|\bREPLACE\b(?!\s*\()/gi;
/** Lo único que la interfaz escribe sin pasar por el servidor: los precios con el dólar del día. */
const BROWSER_WRITE_RE = /^\s*UPDATE\s+products\s+SET\b/i;

/**
 * /v1/sql: una sola consulta de lectura, o el UPDATE de precios en dólares de src/lib/usdRate.ts.
 * El resto de las escrituras van por las funciones de src/db, que corren en el servidor.
 */
export function assertBrowserSql(kind: "select" | "execute", sql: string): void {
  if (IGNORED_RE.test(sql)) return;
  const skeleton = sqlSkeleton(sql);
  const body = skeleton.replace(/;\s*$/, "");
  if (body.includes(";") || BLOCKED_NAMES.test(skeleton)) throw new Error(BROWSER_SQL_DENIED);
  const writes = body.match(WRITE_WORDS) ?? [];
  if (kind === "select") {
    if (!/^\s*(SELECT|WITH)\b/i.test(body) || writes.length > 0) throw new Error(BROWSER_SQL_DENIED);
    return;
  }
  if (!BROWSER_WRITE_RE.test(body) || writes.length !== 1) throw new Error(BROWSER_SQL_DENIED);
}

export function runSelect(storage: DurableObjectStorage, sql: string, values?: unknown[]) {
  if (IGNORED_RE.test(sql)) return [];
  return storage.sql.exec(adaptSql(sql), ...binds(values)).toArray();
}

/** Lectura del navegador: si la consulta llegara a escribir algo, se deshace. */
export function runBrowserSelect(storage: DurableObjectStorage, sql: string, values?: unknown[]) {
  if (IGNORED_RE.test(sql)) return [];
  return storage.transactionSync(() => {
    const cursor = storage.sql.exec(adaptSql(sql), ...binds(values));
    const rows = cursor.toArray();
    if (cursor.rowsWritten > 0) throw new Error(BROWSER_SQL_DENIED);
    return rows;
  });
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
