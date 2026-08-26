import { getDb } from "./index";

export type ReportPeriod = "week" | "month" | "quarter" | "year";

/** Consolidado = todas las cajas sincronizadas; local = solo esta PC. */
export type ReportScope = "consolidado" | "local";

export const REPORT_SCOPE_LABELS: Record<ReportScope, string> = {
  consolidado: "Consolidado (todas las cajas)",
  local: "Esta caja",
};

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

async function getLocalDeviceCode(): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = 'lan_sync_device_code' LIMIT 1",
  );
  const code = (rows[0]?.value || "").trim().toUpperCase();
  return code || null;
}

/** WHERE base para ventas en un período, opcionalmente filtrado por caja. */
async function salesPeriodFilter(
  days: number,
  scope: ReportScope,
  alias?: string,
): Promise<{ clause: string; params: (string | number)[] }> {
  const a = alias ? `${alias}.` : "";
  const params: (string | number)[] = [sinceModifier(days)];
  let clause = `${a}voided = 0 AND date(${a}created_at) >= date('now', 'localtime', $1)`;
  if (scope === "local") {
    const code = await getLocalDeviceCode();
    if (code) {
      params.push(code);
      clause += ` AND ${a}device_code = $${params.length}`;
    }
  }
  return { clause, params };
}

export interface ReportRegisterRow {
  device_code: string;
  device_name: string | null;
  count: number;
  total: number;
}

export async function getSalesByRegister(
  days = 30,
  scope: ReportScope = "consolidado",
): Promise<ReportRegisterRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope);
  return db.select<ReportRegisterRow[]>(
    `SELECT COALESCE(device_code, '—') AS device_code,
            MAX(device_name) AS device_name,
            COUNT(*) AS count,
            COALESCE(SUM(total), 0) AS total
     FROM sales
     WHERE ${clause}
       AND device_code IS NOT NULL AND TRIM(device_code) != ''
     GROUP BY device_code
     ORDER BY total DESC`,
    params,
  );
}

export async function hasMultipleRegisters(days = 90): Promise<boolean> {
  const rows = await getSalesByRegister(days, "consolidado");
  return rows.length > 1;
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

export async function getTodaySalesByPayment(): Promise<SalesByPaymentRow[]> {
  const db = await getDb();
  return db.select<SalesByPaymentRow[]>(
    `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
     FROM sales
     WHERE voided = 0 AND date(created_at) = date('now', 'localtime')
     GROUP BY payment_method
     ORDER BY total DESC`,
  );
}

export async function getSalesByDay(
  days = 14,
  scope: ReportScope = "consolidado",
): Promise<SalesByDayRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope);
  return db.select<SalesByDayRow[]>(
    `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
     FROM sales
     WHERE ${clause}
     GROUP BY date(created_at)
     ORDER BY day DESC`,
    params,
  );
}

export async function getSalesByPayment(
  days = 30,
  scope: ReportScope = "consolidado",
): Promise<SalesByPaymentRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope);
  return db.select<SalesByPaymentRow[]>(
    `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
     FROM sales
     WHERE ${clause}
     GROUP BY payment_method
     ORDER BY total DESC`,
    params,
  );
}

export async function getTopProducts(
  days = 30,
  limit = 15,
  scope: ReportScope = "consolidado",
): Promise<TopProductRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  return db.select<TopProductRow[]>(
    `SELECT si.name AS name, SUM(si.qty) AS qty, SUM(si.line_total) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE ${clause}
     GROUP BY si.name
     ORDER BY total DESC
     LIMIT $${params.length + 1}`,
    [...params, limit],
  );
}

/** Ventas por producto y por día (detalle parcial diario). */
export async function getProductSalesByDay(
  days = 30,
  limit = 200,
  scope: ReportScope = "consolidado",
): Promise<ProductSalesByDayRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  return db.select<ProductSalesByDayRow[]>(
    `SELECT date(s.created_at) AS day, si.name AS name,
            SUM(si.qty) AS qty, SUM(si.line_total) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE ${clause}
     GROUP BY day, si.name
     ORDER BY day DESC, total DESC
     LIMIT $${params.length + 1}`,
    [...params, limit],
  );
}

export async function getSalesByCategory(
  days = 30,
  scope: ReportScope = "consolidado",
): Promise<SalesByCategoryRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  return db.select<SalesByCategoryRow[]>(
    `SELECT COALESCE(c.name, 'Sin categoría') AS category_name,
            SUM(si.qty) AS qty, SUM(si.line_total) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.id = si.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${clause}
     GROUP BY category_name
     ORDER BY total DESC`,
    params,
  );
}

export async function getSalesByHour(
  days = 30,
  scope: ReportScope = "consolidado",
): Promise<SalesByHourRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope);
  return db.select<SalesByHourRow[]>(
    `SELECT printf('%02d:00', CAST(strftime('%H', created_at) AS INTEGER)) AS hour,
            COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
     FROM sales
     WHERE ${clause}
     GROUP BY strftime('%H', created_at)
     ORDER BY hour`,
    params,
  );
}

export async function getPeriodComparison(
  days: number,
  scope: ReportScope = "consolidado",
): Promise<PeriodComparison> {
  const db = await getDb();
  const localCode = scope === "local" ? await getLocalDeviceCode() : null;
  const deviceSql = localCode ? " AND device_code = $3" : "";
  const baseParams: (string | number)[] = [sinceModifier(days), sinceModifier(days * 2)];
  if (localCode) baseParams.push(localCode);

  const rows = await db.select<
    { current_total: number; current_count: number; previous_total: number; previous_count: number }[]
  >(
    `SELECT
       (SELECT COALESCE(SUM(total),0) FROM sales
        WHERE voided = 0 AND date(created_at) >= date('now','localtime', $1)${deviceSql}) AS current_total,
       (SELECT COUNT(*) FROM sales
        WHERE voided = 0 AND date(created_at) >= date('now','localtime', $1)${deviceSql}) AS current_count,
       (SELECT COALESCE(SUM(total),0) FROM sales
        WHERE voided = 0
          AND date(created_at) >= date('now','localtime', $2)
          AND date(created_at) < date('now','localtime', $1)${deviceSql}) AS previous_total,
       (SELECT COUNT(*) FROM sales
        WHERE voided = 0
          AND date(created_at) >= date('now','localtime', $2)
          AND date(created_at) < date('now','localtime', $1)${deviceSql}) AS previous_count`,
    baseParams,
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

export async function getSalesByEmployee(
  days = 30,
  scope: ReportScope = "consolidado",
): Promise<SalesByEmployeeRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  return db.select<SalesByEmployeeRow[]>(
    `SELECT s.user_id, COALESCE(u.display_name, 'Sin asignar') AS display_name,
            COUNT(*) AS count, COALESCE(SUM(s.total), 0) AS total
     FROM sales s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE ${clause}
     GROUP BY s.user_id, u.display_name
     ORDER BY total DESC`,
    params,
  );
}

export interface PeriodProfit {
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number;
}

export async function getPeriodProfit(
  days = 30,
  scope: ReportScope = "consolidado",
): Promise<PeriodProfit> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
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
     WHERE ${clause}`,
    params,
  );
  const revenue = rows[0]?.revenue ?? 0;
  const cost = rows[0]?.cost ?? 0;
  const profit = revenue - cost;
  const margin_pct = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, cost, profit, margin_pct };
}

export async function getPeriodTotals(
  days = 30,
  scope: ReportScope = "consolidado",
): Promise<PeriodTotals> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope);
  const rows = await db.select<{ count: number; total: number }[]>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total
     FROM sales
     WHERE ${clause}`,
    params,
  );
  const count = rows[0]?.count ?? 0;
  const total = rows[0]?.total ?? 0;
  return { count, total, avg_ticket: count > 0 ? total / count : 0 };
}

export function periodToDays(period: ReportPeriod): number {
  return PERIOD_DAYS[period];
}
