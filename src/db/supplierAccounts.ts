import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

type Db = Awaited<ReturnType<typeof getDb>>;

export type SupplierPaymentMethod = "efectivo_caja" | "transferencia" | "otro";

export const SUPPLIER_PAYMENT_LABELS: Record<SupplierPaymentMethod, string> = {
  efectivo_caja: "Efectivo de la caja",
  transferencia: "Transferencia",
  otro: "Otro medio",
};

export interface SupplierWithBalance {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  balance: number;
  last_movement_at: string | null;
  product_count: number;
}

export interface SupplierMovement {
  id: number;
  supplier_id: number;
  kind: "purchase" | "payment";
  amount: number;
  payment_method: SupplierPaymentMethod | null;
  note: string | null;
  reference_type: string | null;
  reference_id: number | null;
  cash_movement_id: number | null;
  user_name: string | null;
  created_at: string;
}

/** Saldo a pagar redondeado a centavos (evita -0,00 por flotantes). */
export function roundMoney(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

export async function listSuppliersWithBalance(): Promise<SupplierWithBalance[]> {
  const db = await getDb();
  const rows = await db.select<SupplierWithBalance[]>(
    `SELECT s.id, s.name, s.phone, s.notes,
            COALESCE((SELECT SUM(m.amount) FROM supplier_movements m WHERE m.supplier_id = s.id), 0) AS balance,
            (SELECT MAX(m.created_at) FROM supplier_movements m WHERE m.supplier_id = s.id) AS last_movement_at,
            (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.active = 1) AS product_count
     FROM suppliers s
     ORDER BY s.name COLLATE NOCASE`,
  );
  return rows.map((r) => ({ ...r, balance: roundMoney(r.balance) }));
}

export async function listSupplierMovements(supplierId: number): Promise<SupplierMovement[]> {
  const db = await getDb();
  return db.select<SupplierMovement[]>(
    `SELECT m.*, u.display_name AS user_name
     FROM supplier_movements m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.supplier_id = $1
     ORDER BY m.created_at DESC, m.id DESC`,
    [supplierId],
  );
}

export async function updateSupplier(
  id: number,
  data: { name: string; phone?: string; notes?: string },
): Promise<void> {
  const name = data.name.trim();
  if (!name) throw new Error("Poné el nombre del proveedor.");
  const db = await getDb();
  const dup = await db.select<{ id: number }[]>(
    "SELECT id FROM suppliers WHERE name = $1 COLLATE NOCASE AND id <> $2",
    [name, id],
  );
  if (dup[0]) throw new Error("Ya hay otro proveedor con ese nombre.");
  await db.execute(
    `UPDATE suppliers SET name = $1, phone = $2, notes = $3,
       updated_at = datetime('now','localtime') WHERE id = $4`,
    [name, data.phone?.trim() || null, data.notes?.trim() || null, id],
  );
}

async function supplierName(db: Db, supplierId: number): Promise<string> {
  const rows = await db.select<{ name: string }[]>("SELECT name FROM suppliers WHERE id = $1", [
    supplierId,
  ]);
  if (!rows[0]) throw new Error("El proveedor ya no existe.");
  return rows[0].name;
}

/** Debe correr dentro de una transacción abierta. */
export async function insertSupplierPurchaseTx(
  db: Db,
  input: {
    supplierId: number;
    amount: number;
    note?: string | null;
    userId: number | null;
    referenceType?: string;
    referenceId?: number;
  },
): Promise<void> {
  if (!(input.amount > 0)) throw new Error("El monto de la compra debe ser mayor a cero.");
  await db.execute(
    `INSERT INTO supplier_movements (supplier_id, kind, amount, note, reference_type, reference_id, user_id)
     VALUES ($1, 'purchase', $2, $3, $4, $5, $6)`,
    [
      input.supplierId,
      roundMoney(input.amount),
      input.note?.trim() || null,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.userId,
    ],
  );
}

/**
 * Debe correr dentro de una transacción abierta.
 * Con efectivo de la caja, anota el egreso en el turno abierto para que el arqueo cierre.
 */
export async function insertSupplierPaymentTx(
  db: Db,
  input: {
    supplierId: number;
    amount: number;
    method: SupplierPaymentMethod;
    note?: string | null;
    userId: number | null;
    referenceType?: string;
    referenceId?: number;
  },
): Promise<void> {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new Error("El monto del pago debe ser mayor a cero.");

  let cashMovementId: number | null = null;
  if (input.method === "efectivo_caja") {
    const open = await db.select<{ id: number }[]>(
      "SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1",
    );
    if (!open[0]) {
      throw new Error("No hay caja abierta. Abrila desde Caja o elegí otro medio de pago.");
    }
    const name = await supplierName(db, input.supplierId);
    const res = await db.execute(
      `INSERT INTO cash_movements (cash_session_id, user_id, type, amount, concept)
       VALUES ($1, $2, 'expense', $3, $4)`,
      [open[0].id, input.userId, amount, `Pago a proveedor: ${name}`],
    );
    cashMovementId = res.lastInsertId as number;
  }

  await db.execute(
    `INSERT INTO supplier_movements
       (supplier_id, kind, amount, payment_method, note, reference_type, reference_id, cash_movement_id, user_id)
     VALUES ($1, 'payment', $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.supplierId,
      -amount,
      input.method,
      input.note?.trim() || null,
      input.referenceType ?? null,
      input.referenceId ?? null,
      cashMovementId,
      input.userId,
    ],
  );
}

export async function recordSupplierPurchase(input: {
  supplierId: number;
  amount: number;
  note?: string;
  userId: number | null;
}): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await insertSupplierPurchaseTx(db, input);
  });
}

export async function recordSupplierPayment(input: {
  supplierId: number;
  amount: number;
  method: SupplierPaymentMethod;
  note?: string;
  userId: number | null;
}): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await insertSupplierPaymentTx(db, input);
  });
}

export async function hasOpenCashSession(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1",
  );
  return Boolean(rows[0]);
}
