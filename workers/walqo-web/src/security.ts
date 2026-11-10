/**
 * Seguridad de WalQo Web: la sesión de la cuenta abre el comercio, pero lo delicado
 * (PIN, copias, empleados, claves guardadas) depende del empleado que entró con su PIN.
 */
import { currentStorage } from "./context";
import { readMeta, writeMeta } from "./meta";

export interface StaffSession {
  userId: number;
  role: "admin" | "manager" | "cashier";
}

const STAFF_HOURS = 16;
const PIN_MAX_FAILS = 8;
const PIN_WINDOW_SEC = 15 * 60;
const PIN_LOCK_SEC = 10 * 60;

const nowSec = () => Math.floor(Date.now() / 1000);

export function ensureSecurityTables(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS _walqo_staff (
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, role TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
}

// --- Datos que nunca salen al navegador ---------------------------------------------

/** Campos con PIN o contraseña, en cualquier fila que devuelva el servidor. */
const SECRET_FIELDS = new Set(["pin", "admin_pin", "password", "password_hash"]);
/** Claves de settings con tokens, certificados o la licencia. */
const SECRET_SETTING_RE = /^admin_pin$|^account_license_key$|_token$|_secret$|_enc$|_password$/i;

function isSecretSetting(key: unknown): boolean {
  return typeof key === "string" && SECRET_SETTING_RE.test(key);
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object" || value instanceof Date || ArrayBuffer.isView(value)) return value;
  if (value instanceof Map) {
    return new Map([...value].map(([k, v]) => [k, isSecretSetting(k) ? "" : redactSecrets(v)]));
  }
  if (value instanceof Set || value instanceof ArrayBuffer) return value;
  const row = value as Record<string, unknown>;
  const settingRow = "key" in row && "value" in row && isSecretSetting(row.key);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_FIELDS.has(k) || isSecretSetting(k) || (settingRow && k === "value")) {
      out[k] = typeof v === "string" ? "" : v == null ? v : "";
    } else {
      out[k] = redactSecrets(v);
    }
  }
  return out;
}

// --- Empleado que entró con PIN ------------------------------------------------------

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return b64url(new Uint8Array(buf));
}

export async function issueStaffToken(userId: number, role: string): Promise<string> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const sql = currentStorage().sql;
  sql.exec("DELETE FROM _walqo_staff WHERE expires_at < ?", nowSec());
  sql.exec(
    "INSERT INTO _walqo_staff (token_hash, user_id, role, expires_at) VALUES (?1, ?2, ?3, ?4)",
    await sha256(token),
    userId,
    role,
    nowSec() + STAFF_HOURS * 3600,
  );
  return token;
}

export async function resolveStaff(token: string): Promise<StaffSession | null> {
  if (!token) return null;
  const sql = currentStorage().sql;
  const row = sql
    .exec<{ user_id: number; role: string }>(
      "SELECT user_id, role FROM _walqo_staff WHERE token_hash = ? AND expires_at > ?",
      await sha256(token),
      nowSec(),
    )
    .toArray()[0];
  if (!row) return null;
  const user = sql
    .exec<{ role: string }>(
      "SELECT role FROM users WHERE id = ? AND active = 1 AND COALESCE(is_cadete, 0) = 0",
      row.user_id,
    )
    .toArray()[0];
  if (!user) return null;
  // Elevado con PIN de admin: vale hasta que el empleado sale.
  const role = row.role === "admin" ? "admin" : user.role;
  return { userId: Number(row.user_id), role: role as StaffSession["role"] };
}

export async function elevateStaff(token: string): Promise<void> {
  if (!token) return;
  currentStorage().sql.exec("UPDATE _walqo_staff SET role = 'admin' WHERE token_hash = ?", await sha256(token));
}

export async function unelevateStaff(token: string): Promise<void> {
  if (!token) return;
  currentStorage().sql.exec(
    "UPDATE _walqo_staff SET role = COALESCE((SELECT role FROM users WHERE users.id = _walqo_staff.user_id), 'cashier') WHERE token_hash = ?",
    await sha256(token),
  );
}

export async function dropStaff(token: string): Promise<void> {
  if (!token) return;
  currentStorage().sql.exec("DELETE FROM _walqo_staff WHERE token_hash = ?", await sha256(token));
}

export function dropAllStaff(): void {
  currentStorage().sql.exec("DELETE FROM _walqo_staff");
}

// --- Intentos de PIN -----------------------------------------------------------------

interface PinFails {
  count: number;
  since: number;
  lockedUntil: number;
}

function readFails(): PinFails {
  try {
    const parsed = JSON.parse(readMeta("pin_fails") ?? "") as PinFails;
    return { count: parsed.count || 0, since: parsed.since || 0, lockedUntil: parsed.lockedUntil || 0 };
  } catch {
    return { count: 0, since: 0, lockedUntil: 0 };
  }
}

export function assertPinNotLocked(): void {
  const fails = readFails();
  if (fails.lockedUntil > nowSec()) {
    const minutes = Math.ceil((fails.lockedUntil - nowSec()) / 60);
    throw new Error(`Demasiados intentos con PIN incorrecto. Probá de nuevo en ${minutes} min.`);
  }
}

export function recordPinAttempt(ok: boolean): void {
  if (ok) {
    writeMeta("pin_fails", JSON.stringify({ count: 0, since: 0, lockedUntil: 0 }));
    return;
  }
  const now = nowSec();
  const fails = readFails();
  const fresh = now - fails.since > PIN_WINDOW_SEC;
  const count = fresh ? 1 : fails.count + 1;
  const since = fresh ? now : fails.since;
  const lockedUntil = count >= PIN_MAX_FAILS ? now + PIN_LOCK_SEC : 0;
  writeMeta("pin_fails", JSON.stringify({ count: lockedUntil ? 0 : count, since, lockedUntil }));
}

// --- Qué pide ser administrador ------------------------------------------------------

const ADMIN_NATIVE = new Set([
  "web_backup_create",
  "web_backup_restore",
  "repair_database_cmd",
  "deactivate_all_products_cmd",
  "purge_inactive_import_products_cmd",
  "web_sessions_revoke_all",
  "mp_oauth_start",
  "disconnect_mp_oauth",
]);

const ADMIN_RPC = new Set(["users.createStaffUser", "users.updateStaffUser", "users.setAdminAccessPin"]);

export function nativeNeedsAdmin(cmd: string): boolean {
  return ADMIN_NATIVE.has(cmd);
}

/** account_license_key se guarda al entrar con la cuenta, antes del PIN: se oculta pero no pide admin. */
const ADMIN_SETTING_RE = /^admin_pin$|_token$|_secret$|_enc$|_password$/i;

export function rpcNeedsAdmin(module: string, fn: string, args: unknown[]): boolean {
  if (ADMIN_RPC.has(`${module}.${fn}`)) return true;
  if (module === "settings" && fn === "setSetting") {
    return typeof args[0] === "string" && ADMIN_SETTING_RE.test(args[0]);
  }
  return false;
}

/** SQL directo del navegador que cambia empleados o claves guardadas. */
const PROTECTED_WRITE_RE = /\busers\b|admin_pin|_token\b|_secret\b|_enc\b/i;

export function sqlNeedsAdmin(kind: "select" | "execute", sql: string): boolean {
  return kind === "execute" && PROTECTED_WRITE_RE.test(sql);
}

export const ADMIN_REQUIRED_MESSAGE = "Esto lo puede hacer solo un administrador. Entrá con un usuario administrador.";
