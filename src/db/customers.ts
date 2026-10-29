import type { Customer, CustomerInput, CustomerLedgerEntry, CustomerPayment } from "../types";
import { formatMoney } from "../lib/format";
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
       AND (c.name LIKE $1 OR c.phone LIKE $1 OR c.document LIKE $1
            OR c.address LIKE $1 OR c.insurance LIKE $1 OR v.plate LIKE $1)
       ORDER BY c.name LIMIT 200`,
      [q],
    );
  }
  return db.select<Customer[]>(
    "SELECT * FROM customers WHERE active = 1 ORDER BY id DESC LIMIT 500",
  );
}

export async function getCustomer(id: number): Promise<Customer | null> {
  const db = await getDb();
  const rows = await db.select<Customer[]>("SELECT * FROM customers WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/** Busca cliente activo por teléfono (mismo número aunque el formato difiera). */
export async function findCustomerByDocument(document: string): Promise<Customer | null> {
  const digits = document.replace(/\D/g, "");
  if (digits.length < 7) return null;
  const db = await getDb();
  const rows = await db.select<Customer[]>(
    `SELECT * FROM customers
     WHERE active = 1 AND document IS NOT NULL AND TRIM(document) != ''`,
  );
  return (
    rows.find((row) => (row.document ?? "").replace(/\D/g, "") === digits) ?? null
  );
}

export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const formatted = formatPhoneArgentina(phone);
  const digits = (formatted ?? phone).replace(/\D/g, "");
  if (digits.length < 8) return null;
  const tail = digits.slice(-10);
  const db = await getDb();
  const rows = await db.select<Customer[]>(
    `SELECT * FROM customers
     WHERE active = 1 AND phone IS NOT NULL AND TRIM(phone) != ''
     ORDER BY id DESC LIMIT 400`,
  );
  return (
    rows.find((c) => {
      const d = (c.phone ?? "").replace(/\D/g, "");
      return d === digits || d.endsWith(tail) || digits.endsWith(d.slice(-10));
    }) ?? null
  );
}

export async function createCustomer(input: CustomerInput): Promise<number> {
  const data = normalizeCustomerInput(input);
  const initialDebt = Number(data.initial_debt) || 0;
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO customers (name, phone, document, email, address, birth_date, insurance, gender, affiliate_number, credit_limit, notes, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)`,
    [
      data.name.trim(),
      data.phone?.trim() || null,
      data.document?.trim() || null,
      data.email?.trim() || null,
      data.address?.trim() || null,
      data.birth_date?.trim() || null,
      data.insurance?.trim() || null,
      data.gender?.trim() || null,
      data.affiliate_number?.trim() || null,
      data.credit_limit,
      data.notes?.trim() || null,
    ],
  );
  const id = res.lastInsertId as number;
  if (initialDebt > 0) {
    await setCustomerOpeningBalance(id, initialDebt);
  }
  void notifyWorkshopSync("customer", id);
  return id;
}

export async function updateCustomer(id: number, input: CustomerInput): Promise<void> {
  const data = normalizeCustomerInput(input);
  const db = await getDb();
  await db.execute(
    `UPDATE customers SET name=$1, phone=$2, document=$3, email=$4,
     address=$5, birth_date=$6, insurance=$7, gender=$8, affiliate_number=$9,
     credit_limit=$10, notes=$11 WHERE id=$12`,
    [
      data.name.trim(),
      data.phone?.trim() || null,
      data.document?.trim() || null,
      data.email?.trim() || null,
      data.address?.trim() || null,
      data.birth_date?.trim() || null,
      data.insurance?.trim() || null,
      data.gender?.trim() || null,
      data.affiliate_number?.trim() || null,
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
  const note = notes?.trim() || null;
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const users =
      userId != null
        ? await db.select<{ display_name: string }[]>("SELECT display_name FROM users WHERE id = $1", [userId])
        : [];
    const pay = await db.execute(
      `INSERT INTO customer_payments (customer_id, amount, payment_method, notes, user_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [customerId, amount, paymentMethod, note, userId],
    );
    const paymentId = pay.lastInsertId as number;
    await insertBalanceMovement(customerId, -amount, "payment", "customer_payment", paymentId, {
      paymentMethod,
      userName: users[0]?.display_name?.trim() || null,
      notes: note,
    });
  });
}

export async function listCustomerPayments(
  customerId: number,
  limit = 30,
): Promise<CustomerPayment[]> {
  const db = await getDb();
  return db.select<CustomerPayment[]>(
    `SELECT p.*, u.display_name AS user_name
     FROM customer_payments p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.customer_id = $1 ORDER BY p.id DESC LIMIT $2`,
    [customerId, limit],
  );
}

/** Todos los movimientos de la cuenta corriente, sin tope, del más viejo al más nuevo (incluye los de otras cajas). */
export async function listCustomerLedger(customerId: number): Promise<CustomerLedgerEntry[]> {
  const db = await getDb();
  return db.select<CustomerLedgerEntry[]>(
    `SELECT m.id, m.delta, m.reason, m.reference_type, m.reference_id, m.created_at,
            m.payment_method, m.user_name, m.notes,
            CASE WHEN m.device_id = COALESCE(
              NULLIF(TRIM((SELECT value FROM settings WHERE key = 'lan_sync_device_id')), ''), 'local'
            ) THEN 1 ELSE 0 END AS is_local,
            CASE m.reference_type
              WHEN 'product' THEN (SELECT p.name FROM products p WHERE p.id = m.reference_id)
              WHEN 'variant' THEN (
                SELECT p.name FROM product_variants v JOIN products p ON p.id = v.product_id
                WHERE v.id = m.reference_id
              )
            END AS reference_label
     FROM customer_balance_movements m
     WHERE m.customer_id = $1
     ORDER BY m.created_at ASC, m.id ASC`,
    [customerId],
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
  detail?: { paymentMethod?: string | null; userName?: string | null; notes?: string | null },
): Promise<void> {
  const db = await getDb();
  const deviceId = await getLanDeviceId();
  const syncId = crypto.randomUUID().replace(/-/g, "");
  await db.execute(
    `INSERT INTO customer_balance_movements
       (sync_id, customer_id, device_id, delta, reason, reference_type, reference_id,
        payment_method, user_name, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      syncId,
      customerId,
      deviceId,
      delta,
      reason,
      referenceType,
      referenceId,
      detail?.paymentMethod ?? null,
      detail?.userName ?? null,
      detail?.notes ?? null,
    ],
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

/** Movimiento genérico de saldo (deuda inicial, ajuste por precio, etc.). */
export async function addCustomerBalanceDelta(
  customerId: number,
  delta: number,
  reason: string,
  referenceType: string | null = null,
  referenceId: number | null = null,
  notes: string | null = null,
): Promise<void> {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.001) return;
  await insertBalanceMovement(customerId, delta, reason, referenceType, referenceId, { notes });
}

export async function subtractCustomerBalance(
  customerId: number,
  amount: number,
  saleId: number | null = null,
  notes: string | null = null,
): Promise<void> {
  await insertBalanceMovement(
    customerId,
    -amount,
    "adjust_down",
    saleId != null ? "sale" : null,
    saleId,
    { notes },
  );
}

/** Deuda inicial al crear un cliente (app nueva con fiados previos). */
export async function setCustomerOpeningBalance(
  customerId: number,
  amount: number,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await withImmediateTransaction(async () => {
    await insertBalanceMovement(customerId, amount, "opening_balance", null, null);
  });
}

export async function assertCreditAvailable(
  customerId: number,
  saleTotal: number,
): Promise<void> {
  const c = await getCustomer(customerId);
  if (!c) throw new Error("Cliente no encontrado.");
  if (c.credit_limit > 0 && c.balance + saleTotal > c.credit_limit) {
    throw new Error(
      `No se puede fiar: supera el límite de crédito de ${c.name.trim()} (${formatMoney(c.credit_limit)}). Ya debe ${formatMoney(c.balance)}. Cobrá una parte o subí el límite en Clientes.`,
    );
  }
}
