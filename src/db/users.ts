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
}

export interface StaffUserInput {
  username: string;
  display_name: string;
  role: UserRole;
  pin: string;
}

export async function getUserById(id: number): Promise<AuthUser | null> {
  const db = await getDb();
  const rows = await db.select<AuthUser[]>(
    "SELECT id, username, display_name, role FROM users WHERE id = $1 AND active = 1",
    [id],
  );
  return rows[0] ?? null;
}

export async function listStaffUsers(): Promise<StaffUser[]> {
  const db = await getDb();
  return db.select<StaffUser[]>(
    "SELECT id, username, display_name, role, pin, active, created_at FROM users ORDER BY active DESC, id",
  );
}

export async function createStaffUser(input: StaffUserInput): Promise<number> {
  const db = await getDb();
  const exists = await db.select<{ id: number }[]>(
    "SELECT id FROM users WHERE username = $1",
    [input.username.trim().toLowerCase()],
  );
  if (exists.length) throw new Error("Ese nombre de usuario ya existe.");

  const res = await db.execute(
    `INSERT INTO users (username, display_name, role, pin)
     VALUES ($1, $2, $3, $4)`,
    [
      input.username.trim().toLowerCase(),
      input.display_name.trim(),
      input.role,
      input.pin,
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
  const rows = await db.select<StaffUser[]>("SELECT * FROM users WHERE id = $1", [id]);
  const current = rows[0];
  if (!current) throw new Error("Usuario no encontrado.");

  const username = patch.username?.trim().toLowerCase() ?? current.username;
  const display_name = patch.display_name?.trim() ?? current.display_name;
  const role = patch.role ?? current.role;
  const pin = patch.pin ?? current.pin;
  const active = patch.active === undefined ? current.active : patch.active ? 1 : 0;

  if (username !== current.username) {
    const clash = await db.select<{ id: number }[]>(
      "SELECT id FROM users WHERE username = $1 AND id != $2",
      [username, id],
    );
    if (clash.length) throw new Error("Ese nombre de usuario ya existe.");
  }

  await db.execute(
    `UPDATE users SET username = $2, display_name = $3, role = $4, pin = $5, active = $6
     WHERE id = $1`,
    [id, username, display_name, role, pin, active],
  );
}
