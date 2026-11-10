import { DurableObject } from "cloudflare:workers";
import { storeContext } from "./context";
import { DB_MODULES } from "./generated/dbModules";
import { MIGRATIONS } from "./generated/migrations";
import { saveAccount } from "./license";
import type { WebAccountInfo, WebLicenseInfo } from "./licenseApi";
import { NATIVE_COMMANDS } from "./native";
import { adaptSql, assertBrowserSql, runExecute, runSelect } from "./sql";

export type CallResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { name: string; message: string } };

function failure(error: unknown): CallResult {
  if (error instanceof Error) {
    const name = error.name && error.name !== "Error" ? error.name : error.constructor?.name || "Error";
    return { ok: false, error: { name, message: error.message } };
  }
  return { ok: false, error: { name: "Error", message: String(error) } };
}

/** La base SQLite de un comercio: mismas tablas y mismas funciones de src/db que la PC. */
export class StoreDb extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate() {
    const sql = this.ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS _walqo_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS _walqo_migrations (
      version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    // Archivos que en la PC van a la carpeta de datos (logo); entran en la copia de seguridad.
    sql.exec(`CREATE TABLE IF NOT EXISTS web_assets (key TEXT PRIMARY KEY, data TEXT NOT NULL)`);
    const done = new Set(
      sql.exec<{ version: number }>("SELECT version FROM _walqo_migrations").toArray().map((r) => r.version),
    );
    for (const migration of MIGRATIONS) {
      if (done.has(migration.version)) continue;
      try {
        this.ctx.storage.transactionSync(() => {
          sql.exec(adaptSql(migration.sql));
          sql.exec("INSERT INTO _walqo_migrations (version) VALUES (?)", migration.version);
        });
      } catch (error) {
        throw new Error(`Migración ${migration.version}: ${(error as Error).message}`);
      }
    }
  }

  private run(work: () => Promise<unknown>): Promise<CallResult> {
    return storeContext.run({ storage: this.ctx.storage, env: this.env }, async () => {
      try {
        return { ok: true, value: (await work()) ?? null } as CallResult;
      } catch (error) {
        return failure(error);
      }
    });
  }

  rpc(module: string, fn: string, args: unknown[]): Promise<CallResult> {
    return this.run(async () => {
      const target = DB_MODULES[module]?.[fn];
      if (typeof target !== "function") throw new Error(`No existe ${module}.${fn}.`);
      return (target as (...a: unknown[]) => unknown)(...args);
    });
  }

  query(kind: "select" | "execute", sql: string, params: unknown[]): Promise<CallResult> {
    return this.run(async () => {
      assertBrowserSql(sql);
      return kind === "select"
        ? runSelect(this.ctx.storage, sql, params)
        : runExecute(this.ctx.storage, sql, params);
    });
  }

  /** Al entrar: deja la cuenta y su licencia en la base del comercio. */
  attach(account: WebAccountInfo, license: WebLicenseInfo): Promise<CallResult> {
    return this.run(async () => {
      saveAccount(account, license);
      return null;
    });
  }

  native(cmd: string, args: Record<string, unknown>): Promise<CallResult> {
    return this.run(async () => {
      const handler = NATIVE_COMMANDS[cmd];
      if (!handler) {
        console.warn(`[walqo-web] comando sin versión web: ${cmd}`);
        throw new Error(`«${cmd}» todavía no está disponible en WalQo Web.`);
      }
      return handler(args);
    });
  }
}
