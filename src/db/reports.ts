import { getDb } from "./index";

export type ReportPeriod = "week" | "month" | "quarter" | "year";

export const PERIOD_DAYS: Record<ReportPeriod, number> = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
};

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  week: "Última semana",
  month: "Último mes",
  quarter: "Último trimestre",
  year: "Último año",
};

function sinceModifier(days: number): string {
  return `-${days} days`;
}

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

export interface ProductSalesByDayRow {
  day: string;
  name: string;
  qty: number;
  total: number;
}

export interface SalesByCategoryRow {
  category_name: string;
  qty: number;
  total: number;
}

export interface SalesByHourRow {
  hour: string;
  count: number;
  total: number;
}

export interface PeriodComparison {
  current_total: number;
  current_count: number;
  previous_total: number;
  previous_count: number;
  change_pct: number;
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

export async function getTopProducts(days = 30, limit = 15): Promise<TopProductRow[]> {
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

/** Ventas por producto y por día (detalle parcial diario). */
export async function getProductSalesByDay(
  days = 30,
  limit = 200,
): Promise<ProductSalesByDayRow[]> {
  const db = await getDb();
  return db.select<ProductSalesByDayRow[]>(
    `SELECT date(s.created_at) AS day, si.name AS name,
            SUM(si.qty) AS qty, SUM(si.line_total) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', $1)
     GROUP BY day, si.name
     ORDER BY day DESC, total DESC
     LIMIT $2`,
    [sinceModifier(days), limit],
  );
}

export async function getSalesByCategory(days = 30): Promise<SalesByCategoryRow[]> {
  const db = await getDb();
  return db.select<SalesByCategoryRow[]>(
    `SELECT COALESCE(c.name, 'Sin categoría') AS category_name,
            SUM(si.qty) AS qty, SUM(si.line_total) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.id = si.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', $1)
     GROUP BY category_name
     ORDER BY total DESC`,
    [sinceModifier(days)],
  );
}

export async function getSalesByHour(days = 30): Promise<SalesByHourRow[]> {
  const db = await getDb();
  return db.select<SalesByHourRow[]>(
    `SELECT printf('%02d:00', CAST(strftime('%H', created_at) AS INTEGER)) AS hour,
            COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
     FROM sales
     WHERE voided = 0 AND date(created_at) >= date('now', 'localtime', $1)
     GROUP BY strftime('%H', created_at)
     ORDER BY hour`,
    [sinceModifier(days)],
  );
}

export async function getPeriodComparison(days: number): Promise<PeriodComparison> {
  const db = await getDb();
  const rows = await db.select<
    { current_total: number; current_count: number; previous_total: number; previous_count: number }[]
  >(
    `SELECT
       (SELECT COALESCE(SUM(total),0) FROM sales
        WHERE voided = 0 AND date(created_at) >= date('now','localtime', $1)) AS current_total,
       (SELECT COUNT(*) FROM sales
        WHERE voided = 0 AND date(created_at) >= date('now','localtime', $1)) AS current_count,
       (SELECT COALESCE(SUM(total),0) FROM sales
        WHERE voided = 0
          AND date(created_at) >= date('now','localtime', $2)
          AND date(created_at) < date('now','localtime', $1)) AS previous_total,
       (SELECT COUNT(*) FROM sales
        WHERE voided = 0
          AND date(created_at) >= date('now','localtime', $2)
          AND date(created_at) < date('now','localtime', $1)) AS previous_count`,
    [sinceModifier(days), sinceModifier(days * 2)],
  );
  const r = rows[0];
  const current_total = r?.current_total ?? 0;
  const previous_total = r?.previous_total ?? 0;
  const change_pct =
    previous_total > 0
      ? ((current_total - previous_total) / previous_total) * 100
      : current_total > 0
        ? 100
        : 0;
  return {
    current_total,
    current_count: r?.current_count ?? 0,
    previous_total,
    previous_count: r?.previous_count ?? 0,
    change_pct,
  };
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

export function periodToDays(period: ReportPeriod): number {
  return PERIOD_DAYS[period];
}
