import { DurableObject } from "cloudflare:workers";
import { storeContext } from "./context";
import { DB_MODULES } from "./generated/dbModules";
import { MIGRATIONS } from "./generated/migrations";
import { saveAccount } from "./license";
import type { WebAccountInfo, WebLicenseInfo } from "./licenseApi";
import { readMeta, writeMeta } from "./meta";
import { NATIVE_COMMANDS } from "./native";
import { ensurePhotoTable } from "./photos";
import {
  ADMIN_REQUIRED_MESSAGE,
  assertPinNotLocked,
  dropAllStaff,
  dropStaff,
  elevateStaff,
  unelevateStaff,
  ensureSecurityTables,
  issueStaffToken,
  nativeNeedsAdmin,
  recordPinAttempt,
  redactSecrets,
  resolveStaff,
  rpcNeedsAdmin,
  sqlNeedsAdmin,
} from "./security";
import { adaptSql, assertBrowserSql, runExecute, runSelect } from "./sql";

export type CallResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { name: string; message: string } };

/** Lo que trae cada pedido del navegador además de la llamada. */
export interface CallAuth {
  /** Versión de la sesión de la cuenta: si no coincide, la sesión se cerró en todos los aparatos. */
  epoch: number;
  /** Empleado que entró con PIN (vacío antes del PIN). */
  staff: string;
}

class AuthError extends Error {
  override name = "AuthError";
}

class AdminRequiredError extends Error {
  override name = "AdminRequired";
}

function failure(error: unknown): CallResult {
  if (error instanceof Error) {
    const name = error.name && error.name !== "Error" ? error.name : error.constructor?.name || "Error";
    return { ok: false, error: { name, message: error.message } };
  }
  return { ok: false, error: { name: "Error", message: String(error) } };
}

function sessionEpoch(): number {
  return Number(readMeta("session_epoch") ?? "0") || 0;
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
    ensureSecurityTables(sql);
    ensurePhotoTable(sql);
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
        return { ok: true, value: redactSecrets((await work()) ?? null) } as CallResult;
      } catch (error) {
        return failure(error);
      }
    });
  }

  /** Sesión vigente y, si hace falta, empleado administrador. */
  private async guard(auth: CallAuth, needsAdmin: boolean): Promise<void> {
    if ((auth.epoch || 0) !== sessionEpoch()) {
      throw new AuthError("Tu sesión terminó. Iniciá sesión de nuevo.");
    }
    if (!needsAdmin) return;
    const staff = await resolveStaff(auth.staff);
    if (staff?.role !== "admin") throw new AdminRequiredError(ADMIN_REQUIRED_MESSAGE);
  }

  rpc(module: string, fn: string, args: unknown[], auth: CallAuth): Promise<CallResult> {
    return this.run(async () => {
      await this.guard(auth, rpcNeedsAdmin(module, fn, args));
      const target = DB_MODULES[module]?.[fn];
      if (typeof target !== "function") throw new Error(`No existe ${module}.${fn}.`);
      const call = () => (target as (...a: unknown[]) => unknown)(...args);
      if (module === "users" && fn === "verifyAdminUnlockPin") {
        assertPinNotLocked();
        const ok = Boolean(await call());
        recordPinAttempt(ok);
        if (ok) await elevateStaff(auth.staff);
        return ok;
      }
      return call();
    });
  }

  query(kind: "select" | "execute", sql: string, params: unknown[], auth: CallAuth): Promise<CallResult> {
    return this.run(async () => {
      assertBrowserSql(sql);
      await this.guard(auth, sqlNeedsAdmin(kind, sql));
      return kind === "select"
        ? runSelect(this.ctx.storage, sql, params)
        : runExecute(this.ctx.storage, sql, params);
    });
  }

  /** Al entrar: deja la cuenta y su licencia en la base del comercio. Devuelve la versión de sesión. */
  attach(account: WebAccountInfo, license: WebLicenseInfo): Promise<CallResult> {
    return this.run(async () => {
      saveAccount(account, license);
      return sessionEpoch();
    });
  }

  native(cmd: string, args: Record<string, unknown>, auth: CallAuth): Promise<CallResult> {
    return this.run(async () => {
      await this.guard(auth, nativeNeedsAdmin(cmd));
      if (cmd === "web_staff_logout") {
        await dropStaff(auth.staff);
        return null;
      }
      if (cmd === "web_staff_unelevate") {
        await unelevateStaff(auth.staff);
        return null;
      }
      if (cmd === "web_sessions_revoke_all") {
        writeMeta("session_epoch", String(sessionEpoch() + 1));
        dropAllStaff();
        return null;
      }
      const handler = NATIVE_COMMANDS[cmd];
      if (!handler) {
        console.warn(`[walqo-web] comando sin versión web: ${cmd}`);
        throw new Error(`«${cmd}» todavía no está disponible en WalQo Web.`);
      }
      if (cmd === "verify_user_pin" || cmd === "license_recover_admin_pin") {
        assertPinNotLocked();
        let result: unknown;
        try {
          result = await handler(args);
        } catch (error) {
          recordPinAttempt(false);
          throw error;
        }
        recordPinAttempt(true);
        if (cmd === "verify_user_pin") {
          const user = result as { id: number; role: string };
          await dropStaff(auth.staff);
          return { ...user, staff_session: await issueStaffToken(user.id, user.role) };
        }
        return result;
      }
      return handler(args);
    });
  }
}
