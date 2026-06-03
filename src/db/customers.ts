import type { Customer, CustomerInput, CustomerPayment } from "../types";
import { getDb } from "./index";

export async function listCustomers(search = ""): Promise<Customer[]> {
  const db = await getDb();
  if (search.trim()) {
    const q = `%${search.trim()}%`;
    return db.select<Customer[]>(
      `SELECT * FROM customers WHERE active = 1
       AND (name LIKE $1 OR phone LIKE $1 OR document LIKE $1)
       ORDER BY name LIMIT 200`,
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
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO customers (name, phone, document, email, credit_limit, notes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.name.trim(),
      input.phone?.trim() || null,
      input.document?.trim() || null,
      input.email?.trim() || null,
      input.credit_limit,
      input.notes?.trim() || null,
    ],
  );
  return res.lastInsertId as number;
}

export async function updateCustomer(id: number, input: CustomerInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE customers SET name=$1, phone=$2, document=$3, email=$4,
     credit_limit=$5, notes=$6 WHERE id=$7`,
    [
      input.name.trim(),
      input.phone?.trim() || null,
      input.document?.trim() || null,
      input.email?.trim() || null,
      input.credit_limit,
      input.notes?.trim() || null,
      id,
    ],
  );
}

export async function deactivateCustomer(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE customers SET active = 0 WHERE id = $1", [id]);
}

/** Registra un cobro que reduce la deuda del cliente. */
export async function registerCustomerPayment(
  customerId: number,
  amount: number,
  paymentMethod: string,
  userId: number | null,
  notes?: string,
): Promise<void> {
  const db = await getDb();
  if (amount <= 0) throw new Error("El monto debe ser mayor a cero.");
  await db.execute(
    `INSERT INTO customer_payments (customer_id, amount, payment_method, notes, user_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [customerId, amount, paymentMethod, notes ?? null, userId],
  );
  await db.execute(
    `UPDATE customers SET balance = CASE WHEN balance <= $1 THEN 0 ELSE balance - $1 END
     WHERE id = $2`,
    [amount, customerId],
  );
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

/** Suma deuda al vender a fiado. */
export async function addCustomerBalance(customerId: number, amount: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE customers SET balance = balance + $1 WHERE id = $2", [
    amount,
    customerId,
  ]);
}

export async function subtractCustomerBalance(customerId: number, amount: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE customers SET balance = CASE WHEN balance <= $1 THEN 0 ELSE balance - $1 END
     WHERE id = $2`,
    [amount, customerId],
  );
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
