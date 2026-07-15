import type { Customer, CustomerInput, CustomerPayment } from "../types";
import { formatPhoneArgentina } from "../lib/phoneFormat";
import { notifyWorkshopSync } from "../lib/workshopSync";
import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

function normalizeCustomerInput(input: CustomerInput): CustomerInput {
  return {
    ...input,
    phone: formatPhoneArgentina(input.phone) ?? undefined,
  };
}

export async function listCustomers(search = ""): Promise<Customer[]> {
  const db = await getDb();
  if (search.trim()) {
    const q = `%${search.trim()}%`;
    return db.select<Customer[]>(
      `SELECT DISTINCT c.* FROM customers c
       LEFT JOIN vehicles v ON v.customer_id = c.id AND v.active = 1
       WHERE c.active = 1
       AND (c.name LIKE $1 OR c.phone LIKE $1 OR c.document LIKE $1 OR v.plate LIKE $1)
       ORDER BY c.name LIMIT 200`,
      [q],
    );
  }
  return db.select<Customer[]>(
    "SELECT * FROM customers WHERE active = 1 ORDER BY name LIMIT 500",
  );
}

export async function getCustomer(id: number): Promise<Customer | null> {
  const db = await getDb();
  const rows = await db.select<Customer[]>("SELECT * FROM customers WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createCustomer(input: CustomerInput): Promise<number> {
  const data = normalizeCustomerInput(input);
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO customers (name, phone, document, email, credit_limit, notes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      data.name.trim(),
      data.phone?.trim() || null,
      data.document?.trim() || null,
      data.email?.trim() || null,
      data.credit_limit,
      data.notes?.trim() || null,
    ],
  );
  const id = res.lastInsertId as number;
  void notifyWorkshopSync("customer", id);
  return id;
}

export async function updateCustomer(id: number, input: CustomerInput): Promise<void> {
  const data = normalizeCustomerInput(input);
  const db = await getDb();
  await db.execute(
    `UPDATE customers SET name=$1, phone=$2, document=$3, email=$4,
     credit_limit=$5, notes=$6 WHERE id=$7`,
    [
      data.name.trim(),
      data.phone?.trim() || null,
      data.document?.trim() || null,
      data.email?.trim() || null,
      data.credit_limit,
      data.notes?.trim() || null,
      id,
    ],
  );
  void notifyWorkshopSync("customer", id);
}

export async function deactivateCustomer(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE customers SET active = 0 WHERE id = $1", [id]);
}

/** Registra un cobro: payment + balance movement en una sola TX. */
export async function registerCustomerPayment(
  customerId: number,
  amount: number,
  paymentMethod: string,
  userId: number | null,
  notes?: string,
): Promise<void> {
  if (amount <= 0) throw new Error("El monto debe ser mayor a cero.");
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const pay = await db.execute(
      `INSERT INTO customer_payments (customer_id, amount, payment_method, notes, user_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [customerId, amount, paymentMethod, notes ?? null, userId],
    );
    const paymentId = pay.lastInsertId as number;
    await insertBalanceMovement(
      customerId,
      -amount,
      "payment",
      "customer_payment",
      paymentId,
    );
  });
}

export async function listCustomerPayments(
  customerId: number,
  limit = 30,
): Promise<CustomerPayment[]> {
  const db = await getDb();
  return db.select<CustomerPayment[]>(
    `SELECT * FROM customer_payments WHERE customer_id = $1 ORDER BY id DESC LIMIT $2`,
    [customerId, limit],
  );
}

async function getLanDeviceId(): Promise<string> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'lan_sync_device_id' LIMIT 1",
  );
  return rows[0]?.value?.trim() || "local";
}

/**
 * Append-only balance. Debe invocarse dentro de withImmediateTransaction
 * cuando forma parte de una operación mayor (venta/cobro).
 */
async function insertBalanceMovement(
  customerId: number,
  delta: number,
  reason: string,
  referenceType: string | null,
  referenceId: number | null,
): Promise<void> {
  const db = await getDb();
  const deviceId = await getLanDeviceId();
  const syncId = crypto.randomUUID().replace(/-/g, "");
  await db.execute(
    `INSERT INTO customer_balance_movements
       (sync_id, customer_id, device_id, delta, reason, reference_type, reference_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [syncId, customerId, deviceId, delta, reason, referenceType, referenceId],
  );
  await db.execute(
    `UPDATE customers SET balance = (
       SELECT COALESCE(SUM(delta), 0) FROM customer_balance_movements WHERE customer_id = $1
     ) WHERE id = $1`,
    [customerId],
  );
}

/** Suma deuda al vender a fiado (participa de la TX del caller). */
export async function addCustomerBalance(
  customerId: number,
  amount: number,
  saleId?: number | null,
): Promise<void> {
  await insertBalanceMovement(customerId, amount, "fiado", "sale", saleId ?? null);
}

export async function subtractCustomerBalance(customerId: number, amount: number): Promise<void> {
  await insertBalanceMovement(customerId, -amount, "adjust_down", null, null);
}

export async function assertCreditAvailable(
  customerId: number,
  saleTotal: number,
): Promise<void> {
  const c = await getCustomer(customerId);
  if (!c) throw new Error("Cliente no encontrado.");
  if (c.credit_limit > 0 && c.balance + saleTotal > c.credit_limit) {
    throw new Error(
      `Supera el límite de crédito (${c.credit_limit}). Deuda actual: ${c.balance}.`,
    );
  }
}
