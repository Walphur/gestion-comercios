import { getDb } from "./index";

export type CashMovementType = "income" | "expense";

export interface CashMovement {
  id: number;
  cash_session_id: number;
  user_id: number | null;
  type: CashMovementType;
  amount: number;
  concept: string;
  created_at: string;
  user_name?: string | null;
}

export async function listCashMovements(sessionId: number): Promise<CashMovement[]> {
  const db = await getDb();
  return db.select<CashMovement[]>(
    `SELECT m.*, u.display_name AS user_name
     FROM cash_movements m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.cash_session_id = $1
     ORDER BY m.id DESC`,
    [sessionId],
  );
}

export async function addCashMovement(
  sessionId: number,
  userId: number | null,
  type: CashMovementType,
  amount: number,
  concept: string,
): Promise<number> {
  if (amount <= 0) throw new Error("El monto debe ser mayor a cero.");
  const trimmed = concept.trim();
  if (!trimmed) throw new Error("Ingresá un concepto.");

  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO cash_movements (cash_session_id, user_id, type, amount, concept)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, userId, type, amount, trimmed],
  );
  return res.lastInsertId as number;
}

export async function getCashMovementTotals(sessionId: number): Promise<{
  income: number;
  expense: number;
}> {
  const db = await getDb();
  const rows = await db.select<{ income: number; expense: number }[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM cash_movements WHERE cash_session_id = $1`,
    [sessionId],
  );
  return { income: rows[0]?.income ?? 0, expense: rows[0]?.expense ?? 0 };
}
