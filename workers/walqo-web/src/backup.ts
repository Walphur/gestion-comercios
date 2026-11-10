/**
 * Copia de seguridad de WalQo Web: todas las tablas del comercio en JSON comprimido (gzip).
 * Restaurar reemplaza los datos en una sola transacción; si algo falla, no cambia nada.
 * La licencia, la prueba y la cuenta (_walqo_meta) no viajan en la copia.
 */
import { currentStorage } from "./context";
import { MIGRATIONS } from "./generated/migrations";
import { currentLicenseStatus } from "./license";

const FORMAT = "walqo-web-backup";
const VERSION = 1;

type SqlValue = string | number | null | ArrayBuffer;

interface BackupTable {
  columns: string[];
  rows: unknown[][];
}

interface BackupFile {
  format: string;
  version: number;
  migration: number;
  created_at: string;
  business_name: string;
  tables: Record<string, BackupTable>;
}

const latestMigration = () => MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Tablas del comercio: sin las internas de SQLite, Cloudflare y WalQo, ni el índice de búsqueda. */
function dataTables(): string[] {
  const sql = currentStorage().sql;
  const all = sql
    .exec<{ name: string; sql: string | null }>("SELECT name, sql FROM sqlite_master WHERE type = 'table'")
    .toArray();
  const virtual = all.filter((t) => /^CREATE\s+VIRTUAL/i.test(t.sql ?? "")).map((t) => t.name);
  return all
    .map((t) => t.name)
    .filter(
      (name) =>
        !name.startsWith("sqlite_") &&
        !name.startsWith("_cf_") &&
        !name.startsWith("_walqo_") &&
        !virtual.some((v) => name === v || name.startsWith(`${v}_`)),
    )
    .sort();
}

function columnsOf(table: string): string[] {
  return currentStorage()
    .sql.exec<{ name: string }>(`SELECT name FROM pragma_table_info(?)`, table)
    .toArray()
    .map((c) => c.name);
}

function encodeValue(v: SqlValue): unknown {
  if (v instanceof ArrayBuffer) {
    let bin = "";
    for (const b of new Uint8Array(v)) bin += String.fromCharCode(b);
    return { $b64: btoa(bin) };
  }
  return v;
}

function decodeValue(v: unknown): SqlValue {
  if (v && typeof v === "object" && "$b64" in v) {
    const bin = atob(String((v as { $b64: string }).$b64));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  if (v === null || typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return JSON.stringify(v);
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function settingValue(key: string): string | null {
  const row = currentStorage()
    .sql.exec<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", key)
    .toArray()[0];
  return row?.value ?? null;
}

export async function createBackup(): Promise<{ data: string; tables: number; rows: number }> {
  const sql = currentStorage().sql;
  const tables: Record<string, BackupTable> = {};
  let rowCount = 0;
  for (const name of dataTables()) {
    const columns = columnsOf(name);
    const cursor = sql.exec(`SELECT * FROM ${quoteIdent(name)}`);
    const rows = Array.from(cursor.raw(), (r) => r.map((v) => encodeValue(v as SqlValue)));
    rowCount += rows.length;
    tables[name] = { columns, rows };
  }
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    migration: latestMigration(),
    created_at: new Date().toISOString(),
    business_name: settingValue("business_name") ?? "",
    tables,
  };
  return { data: toBase64(await gzip(JSON.stringify(file))), tables: Object.keys(tables).length, rows: rowCount };
}

export async function restoreBackup(dataBase64: string): Promise<{ tables: number; rows: number }> {
  let file: BackupFile;
  try {
    file = JSON.parse(await gunzip(fromBase64(dataBase64))) as BackupFile;
  } catch {
    throw new Error("Ese archivo no es una copia de WalQo Web.");
  }
  if (file?.format !== FORMAT || typeof file.tables !== "object") {
    throw new Error("Ese archivo no es una copia de WalQo Web.");
  }
  if (Number(file.version) > VERSION || Number(file.migration) > latestMigration()) {
    throw new Error("La copia es de una versión más nueva de WalQo. Actualizá y probá de nuevo.");
  }

  const storage = currentStorage();
  const sql = storage.sql;
  const current = new Set(dataTables());
  let restoredRows = 0;
  let restoredTables = 0;

  storage.transactionSync(() => {
    // Los triggers (libro de fiado que no se borra, cola de sincronización) frenarían el reemplazo.
    const triggers = sql
      .exec<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL")
      .toArray();
    sql.exec("PRAGMA defer_foreign_keys = ON");
    for (const t of triggers) sql.exec(`DROP TRIGGER IF EXISTS ${quoteIdent(t.name)}`);

    for (const name of current) sql.exec(`DELETE FROM ${quoteIdent(name)}`);

    for (const [name, table] of Object.entries(file.tables)) {
      if (!current.has(name) || !Array.isArray(table?.columns) || !Array.isArray(table.rows)) continue;
      const existing = new Set(columnsOf(name));
      const keep = table.columns.map((c, i) => [c, i] as const).filter(([c]) => existing.has(c));
      if (keep.length === 0) continue;
      const insert = `INSERT INTO ${quoteIdent(name)} (${keep.map(([c]) => quoteIdent(c)).join(", ")})
        VALUES (${keep.map(() => "?").join(", ")})`;
      for (const row of table.rows) {
        sql.exec(insert, ...keep.map(([, i]) => decodeValue(row[i])));
        restoredRows += 1;
      }
      restoredTables += 1;
    }

    for (const t of triggers) sql.exec(t.sql);
    sql.exec("DELETE FROM products_fts");
    sql.exec(
      `INSERT INTO products_fts(rowid, name, barcode, sku)
       SELECT id, name, COALESCE(barcode, ''), COALESCE(sku, '') FROM products WHERE active = 1`,
    );
  });

  // Los módulos Pro de settings vuelven a quedar según la licencia actual, no la de la copia.
  currentLicenseStatus();
  return { tables: restoredTables, rows: restoredRows };
}
