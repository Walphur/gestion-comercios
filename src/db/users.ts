import type { AuthUser } from "../lib/tauri";
import { getDb } from "./index";

export type UserRole = AuthUser["role"];

export interface StaffUser {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  pin: string;
  active: number;
  created_at: string;
  phone: string | null;
  is_cadete: number;
  hide_stock: number;
}

export interface StaffUserInput {
  username: string;
  display_name: string;
  role: UserRole;
  pin: string;
  phone?: string;
  is_cadete?: boolean;
  hide_stock?: boolean;
}

export interface DeliveryCadete {
  id: number;
  display_name: string;
  phone: string | null;
}

export async function getUserById(id: number): Promise<AuthUser | null> {
  const db = await getDb();
  const rows = await db.select<
    { id: number; username: string; display_name: string; role: UserRole; hide_stock: number }[]
  >(
    `SELECT id, username, display_name, role, COALESCE(hide_stock, 0) AS hide_stock
     FROM users WHERE id = $1 AND active = 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    display_name: r.display_name,
    role: r.role,
    hide_stock: r.hide_stock !== 0,
  };
}

export async function listStaffUsers(): Promise<StaffUser[]> {
  const db = await getDb();
  return db.select<StaffUser[]>(
    `SELECT id, username, display_name, role, pin, active, created_at,
            phone, COALESCE(is_cadete, 0) AS is_cadete,
            COALESCE(hide_stock, 0) AS hide_stock
     FROM users ORDER BY active DESC, is_cadete ASC, id`,
  );
}

/** Cadetes activos para asignar deliveries (con o sin teléfono). */
export async function listDeliveryCadetes(): Promise<DeliveryCadete[]> {
  const db = await getDb();
  return db.select<DeliveryCadete[]>(
    `SELECT id, display_name, phone FROM users
     WHERE active = 1 AND COALESCE(is_cadete, 0) = 1
     ORDER BY display_name COLLATE NOCASE`,
  );
}

export async function createStaffUser(input: StaffUserInput): Promise<number> {
  const db = await getDb();
  const exists = await db.select<{ id: number }[]>(
    "SELECT id FROM users WHERE username = $1",
    [input.username.trim().toLowerCase()],
  );
  if (exists.length) throw new Error("Ese nombre de usuario ya existe.");

  const isCadete = input.is_cadete ? 1 : 0;
  const hideStock = input.hide_stock && !isCadete ? 1 : 0;
  const phone = input.phone?.trim() || null;
  if (isCadete && !phone) {
    throw new Error("El cadete necesita un WhatsApp / celular para avisar los pedidos.");
  }

  const res = await db.execute(
    `INSERT INTO users (username, display_name, role, pin, phone, is_cadete, hide_stock, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now','localtime'))`,
    [
      input.username.trim().toLowerCase(),
      input.display_name.trim(),
      input.role,
      input.pin,
      phone,
      isCadete,
      hideStock,
    ],
  );
  return res.lastInsertId as number;
}

export async function updateStaffUser(
  id: number,
  patch: Partial<StaffUserInput> & { active?: boolean },
): Promise<void> {
  if (id === 1 && patch.active === false) {
    throw new Error("No se puede desactivar el administrador principal.");
  }

  const db = await getDb();
  const rows = await db.select<StaffUser[]>(
    `SELECT id, username, display_name, role, pin, active, created_at,
            phone, COALESCE(is_cadete, 0) AS is_cadete,
            COALESCE(hide_stock, 0) AS hide_stock
     FROM users WHERE id = $1`,
    [id],
  );
  const current = rows[0];
  if (!current) throw new Error("Usuario no encontrado.");

  const username = patch.username?.trim().toLowerCase() ?? current.username;
  const display_name = patch.display_name?.trim() ?? current.display_name;
  const role = patch.role ?? current.role;
  const pin = patch.pin ?? current.pin;
  const active = patch.active === undefined ? current.active : patch.active ? 1 : 0;
  const phone =
    patch.phone !== undefined ? patch.phone.trim() || null : current.phone;
  const is_cadete =
    patch.is_cadete !== undefined ? (patch.is_cadete ? 1 : 0) : current.is_cadete;
  const hide_stock = is_cadete
    ? 0
    : patch.hide_stock !== undefined
      ? patch.hide_stock
        ? 1
        : 0
      : current.hide_stock;

  if (is_cadete && !phone) {
    throw new Error("El cadete necesita un WhatsApp / celular para avisar los pedidos.");
  }

  if (username !== current.username) {
    const clash = await db.select<{ id: number }[]>(
      "SELECT id FROM users WHERE username = $1 AND id != $2",
      [username, id],
    );
    if (clash.length) throw new Error("Ese nombre de usuario ya existe.");
  }

  await db.execute(
    `UPDATE users SET username = $2, display_name = $3, role = $4, pin = $5, active = $6,
       phone = $7, is_cadete = $8, hide_stock = $9, updated_at = datetime('now','localtime')
     WHERE id = $1`,
    [id, username, display_name, role, pin, active, phone, is_cadete, hide_stock],
  );

  // Mantener settings.admin_pin alineado con el PIN del usuario Administrador.
  if ((role === "admin" || id === 1) && !is_cadete && patch.pin !== undefined) {
    const { setSetting } = await import("./settings");
    await setSetting("admin_pin", pin);
  }
}

/** ¿El PIN abre Configuración? Acepta el PIN de cualquier admin activo (o el legacy en settings). */
export async function verifyAdminUnlockPin(pin: string): Promise<boolean> {
  const trimmed = pin.trim();
  if (!trimmed) return false;
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM users
     WHERE active = 1 AND role = 'admin' AND COALESCE(is_cadete, 0) = 0 AND pin = $1`,
    [trimmed],
  );
  if ((rows[0]?.n ?? 0) > 0) return true;
  const { getSetting } = await import("./settings");
  const legacy = (await getSetting("admin_pin"))?.trim() ?? "";
  return legacy.length > 0 && legacy === trimmed;
}

/** Actualiza el PIN de todos los admins activos y el setting legado. */
export async function setAdminAccessPin(pin: string): Promise<void> {
  const trimmed = pin.trim();
  if (trimmed.length < 4) throw new Error("El PIN debe tener al menos 4 dígitos.");
  const db = await getDb();
  await db.execute(
    `UPDATE users SET pin = $1, updated_at = datetime('now','localtime')
     WHERE active = 1 AND role = 'admin' AND COALESCE(is_cadete, 0) = 0`,
    [trimmed],
  );
  const { setSetting } = await import("./settings");
  await setSetting("admin_pin", trimmed);
}
