import { getDb } from "./index";

export interface SalesByDayRow {
  day: string;
  count: number;
  total: number;
}

export interface SalesByPaymentRow {
  payment_method: string;
  count: number;
  total: number;
}

export interface TopProductRow {
  name: string;
  qty: number;
  total: number;
}

function sinceModifier(days: number): string {
  return `-${days} days`;
}

export async function getSalesByDay(days = 14): Promise<SalesByDayRow[]> {
  const db = await getDb();
  return db.select<SalesByDayRow[]>(
    `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
     FROM sales
     WHERE voided = 0 AND date(created_at) >= date('now', 'localtime', $1)
     GROUP BY date(created_at)
     ORDER BY day DESC`,
    [sinceModifier(days)],
  );
}

export async function getSalesByPayment(days = 30): Promise<SalesByPaymentRow[]> {
  const db = await getDb();
  return db.select<SalesByPaymentRow[]>(
    `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
     FROM sales
     WHERE voided = 0 AND date(created_at) >= date('now', 'localtime', $1)
     GROUP BY payment_method
     ORDER BY total DESC`,
    [sinceModifier(days)],
  );
}

export async function getTopProducts(days = 30, limit = 10): Promise<TopProductRow[]> {
  const db = await getDb();
  return db.select<TopProductRow[]>(
    `SELECT si.name AS name, SUM(si.qty) AS qty, SUM(si.line_total) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', $1)
     GROUP BY si.name
     ORDER BY total DESC
     LIMIT $2`,
    [sinceModifier(days), limit],
  );
}

export interface PeriodTotals {
  count: number;
  total: number;
  avg_ticket: number;
}

export interface SalesByEmployeeRow {
  user_id: number;
  display_name: string;
  count: number;
  total: number;
}

export async function getSalesByEmployee(days = 30): Promise<SalesByEmployeeRow[]> {
  const db = await getDb();
  return db.select<SalesByEmployeeRow[]>(
    `SELECT s.user_id, COALESCE(u.display_name, 'Sin asignar') AS display_name,
            COUNT(*) AS count, COALESCE(SUM(s.total), 0) AS total
     FROM sales s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', $1)
     GROUP BY s.user_id, u.display_name
     ORDER BY total DESC`,
    [sinceModifier(days)],
  );
}

export interface PeriodProfit {
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number;
}

export async function getPeriodProfit(days = 30): Promise<PeriodProfit> {
  const db = await getDb();
  const rows = await db.select<{ revenue: number; cost: number }[]>(
    `SELECT
       COALESCE(SUM(si.line_total), 0) AS revenue,
       COALESCE(SUM(
         si.qty * COALESCE(
           (SELECT cost FROM products WHERE id = si.product_id),
           0
         )
       ), 0) AS cost
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', $1)`,
    [sinceModifier(days)],
  );
  const revenue = rows[0]?.revenue ?? 0;
  const cost = rows[0]?.cost ?? 0;
  const profit = revenue - cost;
  const margin_pct = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, cost, profit, margin_pct };
}

export async function getPeriodTotals(days = 30): Promise<PeriodTotals> {
  const db = await getDb();
  const rows = await db.select<{ count: number; total: number }[]>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total
     FROM sales
     WHERE voided = 0 AND date(created_at) >= date('now', 'localtime', $1)`,
    [sinceModifier(days)],
  );
  const count = rows[0]?.count ?? 0;
  const total = rows[0]?.total ?? 0;
  return { count, total, avg_ticket: count > 0 ? total / count : 0 };
}
