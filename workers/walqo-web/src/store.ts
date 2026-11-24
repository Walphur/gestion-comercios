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
  isSecretSetting,
  nativeNeedsAdmin,
  recordPinAttempt,
  redactSecrets,
  resolveStaff,
  rpcNeedsAdmin,
  sqlNeedsAdmin,
} from "./security";
import { adaptSql, assertBrowserSql, runBrowserSelect, runExecute, runSelect } from "./sql";

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

/** Solo funciones propias del registro, nunca `constructor`, `__proto__` y compañía. */
function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function sessionEpoch(): number {
  return Number(readMeta("session_epoch") ?? "0") || 0;
}

/** SQL listo para el DO: adapta placeholders. La 79 no usa este path (ver applyMigration79). */
function prepareMigrationSql(_version: number, sql: string): string {
  return adaptSql(sql);
}

type DoSql = DurableObjectStorage["sql"];

/** true si el CREATE de `users` en sqlite_master ya incluye el rol plus. */
function usersSqlHasPlus(sql: DoSql): boolean {
  try {
    const row = sql
      .exec<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1",
      )
      .toArray()[0];
    return /\bplus\b/i.test(row?.sql ?? "");
  } catch {
    return false;
  }
}

/** Comprueba que el CHECK en vivo acepta role='plus' (no solo el texto en sqlite_master). */
function usersCheckAcceptsPlus(sql: DoSql): boolean {
  const row = sql
    .exec<{ id: number; role: string }>("SELECT id, role FROM users ORDER BY id LIMIT 1")
    .toArray()[0];
  if (!row) return usersSqlHasPlus(sql);
  try {
    sql.exec("SAVEPOINT walqo_verify_plus");
    sql.exec("UPDATE users SET role = 'plus' WHERE id = ?", row.id);
    sql.exec("UPDATE users SET role = ? WHERE id = ?", row.role, row.id);
    sql.exec("RELEASE SAVEPOINT walqo_verify_plus");
    return true;
  } catch {
    try {
      sql.exec("ROLLBACK TO SAVEPOINT walqo_verify_plus");
      sql.exec("RELEASE SAVEPOINT walqo_verify_plus");
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * Amplía el CHECK de role a incluir 'plus' reescribiendo sqlite_master.
 * No hace DROP de `users` → no toca FKs de sales/caja/etc.
 * En el DO, defer_foreign_keys + DROP deja el commit inválido y Cloudflare resetea el objeto.
 */
function patchUsersPlusCheck(sql: DoSql): boolean {
  const row = sql
    .exec<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1",
    )
    .toArray()[0];
  const createSql = row?.sql ?? "";
  if (!createSql) throw new Error("migración 79: no existe la tabla users");
  if (/\bplus\b/i.test(createSql) && usersCheckAcceptsPlus(sql)) return true;

  let next = createSql.replace(
    /CHECK\s*\(\s*role\s+IN\s*\(\s*'admin'\s*,\s*'manager'\s*,\s*'cashier'\s*\)\s*\)/i,
    "CHECK (role IN ('admin', 'manager', 'plus', 'cashier'))",
  );
  if (next === createSql) {
    next = createSql.replace(/CHECK\s*\(\s*role\s+IN\s*\(([^)]*)\)\s*\)/i, (_m, inner: string) => {
      if (/\bplus\b/i.test(inner)) return `CHECK (role IN (${inner}))`;
      const parts = inner
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const cashierIdx = parts.findIndex((p) => /'cashier'/i.test(p));
      if (cashierIdx >= 0) parts.splice(cashierIdx, 0, "'plus'");
      else parts.push("'plus'");
      return `CHECK (role IN (${parts.join(", ")}))`;
    });
  }
  if (next === createSql || !/\bplus\b/i.test(next)) {
    throw new Error("migración 79: no se pudo ampliar el CHECK de role");
  }

  sql.exec("PRAGMA writable_schema = ON");
  try {
    sql.exec("UPDATE sqlite_master SET sql = ? WHERE type = 'table' AND name = 'users'", next);
    // SQLite 3.38+: recarga el esquema en esta misma conexión.
    try {
      sql.exec("PRAGMA writable_schema = RESET");
    } catch {
      sql.exec("PRAGMA writable_schema = OFF");
    }
  } catch (error) {
    try {
      sql.exec("PRAGMA writable_schema = OFF");
    } catch {
      /* ignore */
    }
    throw error;
  }

  return usersCheckAcceptsPlus(sql) || usersSqlHasPlus(sql);
}

/**
 * Migración 79 en el DO: NUNCA recrear `users` (FK a sales, cash_sessions, etc.).
 * Solo parchea el CHECK; limpia restos de intentos con DROP que hayan dejado users_role_plus.
 */
function applyMigration79(sql: DoSql): void {
  // Restos de intentos previos con DROP/recreate (si el TX no llegó a commit, no deberían existir).
  try {
    sql.exec("DROP TABLE IF EXISTS users_role_plus");
  } catch {
    /* ignore */
  }

  if (usersCheckAcceptsPlus(sql) || usersSqlHasPlus(sql)) {
    sql.exec("INSERT OR IGNORE INTO _walqo_migrations (version) VALUES (?)", 79);
    return;
  }

  try {
    if (!patchUsersPlusCheck(sql)) {
      throw new Error(
        "migración 79: el CHECK de users no admitió 'plus' tras el parche (sin DROP)",
      );
    }
  } catch (error) {
    const message = (error as Error).message || String(error);
    // No bloquear login/activar licencia: el CHECK viejo sigue; Cajero Plus puede fallar al guardar.
    console.error("[walqo-web] mig 79 patch failed, marking applied to unblock DO:", message);
    sql.exec("INSERT OR IGNORE INTO _walqo_migrations (version) VALUES (?)", 79);
    return;
  }
  sql.exec("INSERT OR IGNORE INTO _walqo_migrations (version) VALUES (?)", 79);
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
        if (migration.version === 79) {
          // Sin DROP: recrear users con defer_foreign_keys deja FKs inválidas al COMMIT y el DO se resetea.
          applyMigration79(sql);
          continue;
        }
        this.ctx.storage.transactionSync(() => {
          sql.exec(prepareMigrationSql(migration.version, migration.sql));
          sql.exec("INSERT INTO _walqo_migrations (version) VALUES (?)", migration.version);
        });
      } catch (error) {
        const message = (error as Error).message || String(error);
        // Recuperación: si el CHECK ya admite plus, marcar 79 y seguir (evita loop de 500).
        if (migration.version === 79 && (usersCheckAcceptsPlus(sql) || usersSqlHasPlus(sql))) {
          sql.exec("INSERT OR IGNORE INTO _walqo_migrations (version) VALUES (?)", 79);
          continue;
        }
        throw new Error(`Migración ${migration.version}: ${message}`);
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
      const mod = hasOwn(DB_MODULES, module) ? DB_MODULES[module] : undefined;
      const target = mod && hasOwn(mod, fn) ? mod[fn] : undefined;
      if (typeof target !== "function") throw new Error(`No existe ${module}.${fn}.`);
      const call = () => (target as (...a: unknown[]) => unknown)(...args);
      if (module === "settings" && fn === "getSetting" && isSecretSetting(args[0])) {
        const value = await call();
        return value == null ? value : "";
      }
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
      assertBrowserSql(kind, sql);
      await this.guard(auth, sqlNeedsAdmin(kind, sql));
      return kind === "select"
        ? runBrowserSelect(this.ctx.storage, sql, params)
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
      const handler = hasOwn(NATIVE_COMMANDS, cmd) ? NATIVE_COMMANDS[cmd] : undefined;
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
