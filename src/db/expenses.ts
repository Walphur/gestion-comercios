import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";
import { roundMoney } from "./supplierAccounts";
import { expenseCategoryLabel } from "../config/expenseCategories";

export type ExpenseMethod = "efectivo_caja" | "transferencia" | "tarjeta" | "mercadopago" | "otro";

export const EXPENSE_METHODS: ExpenseMethod[] = [
  "efectivo_caja",
  "transferencia",
  "tarjeta",
  "mercadopago",
  "otro",
];

export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  efectivo_caja: "Efectivo de la caja",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  mercadopago: "Mercado Pago",
  otro: "Otro medio",
};

export interface Expense {
  id: number;
  category: string;
  description: string;
  amount: number;
  method: ExpenseMethod;
  paid_at: string;
  cash_movement_id: number | null;
  recurring_id: number | null;
  user_id: number | null;
  user_name: string | null;
  voided: number;
  created_at: string;
}

export interface RecurringExpense {
  id: number;
  category: string;
  description: string;
  amount: number;
  day_of_month: number;
  active: number;
  created_at: string;
}

export interface ExpenseCategoryTotal {
  category: string;
  count: number;
  total: number;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  byCategory: ExpenseCategoryTotal[];
}

export interface PendingRecurring extends RecurringExpense {
  /** El día del mes ya llegó (o pasó) y todavía no se cargó. */
  due: boolean;
}

export function expenseCashConcept(category: string, description: string): string {
  const label = expenseCategoryLabel(category);
  const desc = description.trim();
  return desc ? `Gasto: ${label} — ${desc}` : `Gasto: ${label}`;
}

/** Primer y último día (YYYY-MM-DD) del mes de `ymd`. */
export function monthBounds(ymd: string): { from: string; to: string } {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export async function createExpense(input: {
  category: string;
  description: string;
  amount: number;
  method: ExpenseMethod;
  paidAt: string;
  recurringId?: number | null;
  userId: number | null;
}): Promise<number> {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new Error("El monto del gasto debe ser mayor a cero.");
  if (!input.category) throw new Error("Elegí de qué es el gasto.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidAt)) throw new Error("Elegí la fecha del gasto.");
  const description = input.description.trim();

  return withImmediateTransaction(async () => {
    const db = await getDb();
    let cashMovementId: number | null = null;
    if (input.method === "efectivo_caja") {
      const open = await db.select<{ id: number }[]>(
        "SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1",
      );
      if (!open[0]) {
        throw new Error("No hay caja abierta. Abrila desde Caja o elegí otro medio de pago.");
      }
      const res = await db.execute(
        `INSERT INTO cash_movements (cash_session_id, user_id, type, amount, concept)
         VALUES ($1, $2, 'expense', $3, $4)`,
        [open[0].id, input.userId, amount, expenseCashConcept(input.category, description)],
      );
      cashMovementId = res.lastInsertId as number;
    }
    const res = await db.execute(
      `INSERT INTO expenses (category, description, amount, method, paid_at, cash_movement_id, recurring_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.category,
        description,
        amount,
        input.method,
        input.paidAt,
        cashMovementId,
        input.recurringId ?? null,
        input.userId,
      ],
    );
    return res.lastInsertId as number;
  });
}

export type VoidExpenseResult = "no_cash" | "cash_returned" | "cash_closed";

/**
 * Anula el gasto. Si salió de una caja que sigue abierta, se borra ese egreso y el efectivo vuelve
 * al arqueo. Si esa caja ya se cerró, no se toca: el arqueo de ese día ya se hizo con esa plata afuera.
 */
export async function voidExpense(id: number): Promise<VoidExpenseResult> {
  return withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ voided: number; cash_movement_id: number | null }[]>(
      "SELECT voided, cash_movement_id FROM expenses WHERE id = $1",
      [id],
    );
    const exp = rows[0];
    if (!exp) throw new Error("Ese gasto ya no existe.");
    if (exp.voided) throw new Error("Ese gasto ya estaba anulado.");

    let result: VoidExpenseResult = "no_cash";
    if (exp.cash_movement_id != null) {
      const mv = await db.select<{ status: string }[]>(
        `SELECT cs.status FROM cash_movements m
         JOIN cash_sessions cs ON cs.id = m.cash_session_id
         WHERE m.id = $1`,
        [exp.cash_movement_id],
      );
      if (mv[0]?.status === "open") {
        await db.execute("DELETE FROM cash_movements WHERE id = $1", [exp.cash_movement_id]);
        result = "cash_returned";
      } else if (mv[0]) {
        result = "cash_closed";
      }
    }
    await db.execute("UPDATE expenses SET voided = 1 WHERE id = $1", [id]);
    return result;
  });
}

export async function listExpenses(filter: {
  from: string;
  to: string;
  category?: string | null;
  includeVoided?: boolean;
}): Promise<Expense[]> {
  const db = await getDb();
  const params: (string | number)[] = [filter.from, filter.to];
  let where = "e.paid_at BETWEEN $1 AND $2";
  if (!filter.includeVoided) where += " AND e.voided = 0";
  if (filter.category) {
    params.push(filter.category);
    where += ` AND e.category = $${params.length}`;
  }
  return db.select<Expense[]>(
    `SELECT e.*, u.display_name AS user_name
     FROM expenses e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE ${where}
     ORDER BY e.paid_at DESC, e.id DESC`,
    params,
  );
}

export async function getExpenseSummary(from: string, to: string): Promise<ExpenseSummary> {
  const db = await getDb();
  const byCategory = await db.select<ExpenseCategoryTotal[]>(
    `SELECT category, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
     FROM expenses
     WHERE voided = 0 AND paid_at BETWEEN $1 AND $2
     GROUP BY category
     ORDER BY total DESC`,
    [from, to],
  );
  const total = roundMoney(byCategory.reduce((a, c) => a + c.total, 0));
  const count = byCategory.reduce((a, c) => a + c.count, 0);
  return { total, count, byCategory };
}

export async function listRecurringExpenses(): Promise<RecurringExpense[]> {
  const db = await getDb();
  return db.select<RecurringExpense[]>(
    "SELECT * FROM recurring_expenses ORDER BY active DESC, day_of_month, id",
  );
}

function checkRecurring(input: { category: string; amount: number; dayOfMonth: number }) {
  if (!input.category) throw new Error("Elegí de qué es el gasto fijo.");
  if (!(input.amount >= 0)) throw new Error("El monto no puede ser negativo.");
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 28) {
    throw new Error("El día del mes va del 1 al 28.");
  }
}

export async function saveRecurringExpense(input: {
  id?: number | null;
  category: string;
  description: string;
  amount: number;
  dayOfMonth: number;
}): Promise<void> {
  checkRecurring(input);
  const db = await getDb();
  const values = [input.category, input.description.trim(), roundMoney(input.amount), input.dayOfMonth];
  if (input.id) {
    await db.execute(
      `UPDATE recurring_expenses SET category = $1, description = $2, amount = $3, day_of_month = $4
       WHERE id = $5`,
      [...values, input.id],
    );
  } else {
    await db.execute(
      `INSERT INTO recurring_expenses (category, description, amount, day_of_month)
       VALUES ($1, $2, $3, $4)`,
      values,
    );
  }
}

export async function setRecurringExpenseActive(id: number, active: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE recurring_expenses SET active = $1 WHERE id = $2", [active ? 1 : 0, id]);
}

/** Fijos activos que todavía no tienen un gasto (sin anular) cargado en el mes de `todayYmd`. */
export async function listPendingRecurring(todayYmd: string): Promise<PendingRecurring[]> {
  const db = await getDb();
  const { from, to } = monthBounds(todayYmd);
  const rows = await db.select<RecurringExpense[]>(
    `SELECT r.* FROM recurring_expenses r
     WHERE r.active = 1
       AND NOT EXISTS (
         SELECT 1 FROM expenses e
         WHERE e.recurring_id = r.id AND e.voided = 0 AND e.paid_at BETWEEN $1 AND $2
       )
     ORDER BY r.day_of_month, r.id`,
    [from, to],
  );
  const day = Number(todayYmd.slice(8, 10));
  return rows.map((r) => ({ ...r, due: r.day_of_month <= day }));
}
