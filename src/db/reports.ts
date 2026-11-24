import { PAYMENT_NOT_VOIDED_SQL } from "./customerPaymentSql";
import { getDb } from "./index";
import { shiftYmd } from "../lib/format";

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

/**
 * Ventana del reporte: días hacia atrás (como siempre) o un rango Desde/Hasta (YYYY-MM-DD, inclusive).
 * `userId` limita a las ventas de un cajero.
 */
export type ReportWindow =
  | number
  | { days?: number; from?: string; to?: string; userId?: number | null };

function windowParts(window: ReportWindow): {
  days: number;
  from: string | null;
  to: string | null;
  userId: number | null;
} {
  if (typeof window === "number") return { days: window, from: null, to: null, userId: null };
  const ranged = Boolean(window.from && window.to);
  return {
    days: window.days ?? 30,
    from: ranged ? window.from! : null,
    to: ranged ? window.to! : null,
    userId: window.userId ?? null,
  };
}

/** Condición de fecha (y cajero) sobre `created_at`; agrega sus valores a `params`. */
function windowClause(window: ReportWindow, a: string, params: (string | number)[]): string {
  const w = windowParts(window);
  let clause: string;
  if (w.from && w.to) {
    params.push(w.from, w.to);
    clause = `date(${a}created_at) BETWEEN $${params.length - 1} AND $${params.length}`;
  } else {
    params.push(sinceModifier(w.days));
    clause = `date(${a}created_at) >= date('now', 'localtime', $${params.length})`;
  }
  if (w.userId != null) {
    params.push(w.userId);
    clause += ` AND ${a}user_id = $${params.length}`;
  }
  return clause;
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
  window: ReportWindow,
  scope: ReportScope,
  alias?: string,
): Promise<{ clause: string; params: (string | number)[] }> {
  const a = alias ? `${alias}.` : "";
  const params: (string | number)[] = [];
  let clause = `${a}voided = 0 AND ${windowClause(window, a, params)}`;
  if (scope === "local") {
    const code = await getLocalDeviceCode();
    if (code) {
      params.push(code);
      clause += ` AND ${a}device_code = $${params.length}`;
    }
  }
  return { clause, params };
}

/** Mes en curso (desde día 1) — misma semántica que el portal MTD. */
async function salesMonthToDateFilter(
  scope: ReportScope,
  alias?: string,
): Promise<{ clause: string; params: (string | number)[] }> {
  const a = alias ? `${alias}.` : "";
  const params: (string | number)[] = [];
  let clause = `${a}voided = 0 AND date(${a}created_at) >= date('now', 'localtime', 'start of month')`;
  if (scope === "local") {
    const code = await getLocalDeviceCode();
    if (code) {
      params.push(code);
      clause += ` AND ${a}device_code = $${params.length}`;
    }
  }
  return { clause, params };
}

/** Solo el día calendario local (hoy). */
async function salesTodayFilter(
  scope: ReportScope,
  alias?: string,
): Promise<{ clause: string; params: (string | number)[] }> {
  const a = alias ? `${alias}.` : "";
  const params: (string | number)[] = [];
  let clause = `${a}voided = 0 AND date(${a}created_at) = date('now', 'localtime')`;
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
  days: ReportWindow = 30,
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
  days: ReportWindow = 14,
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

/**
 * Dinero que entró por día: ventas cobradas (no fiado) + cobros de fiado.
 * Misma semántica que MoneyInflow.totalIn, partida por fecha.
 */
export async function getCollectedByDay(
  days: ReportWindow = 30,
  scope: ReportScope = "consolidado",
): Promise<SalesByDayRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope);
  const sales = await db.select<SalesByDayRow[]>(
    `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total),0) AS total
     FROM sales
     WHERE ${clause}
       AND lower(payment_method) NOT IN ('fiado', 'cuenta_corriente')
     GROUP BY date(created_at)`,
    params,
  );
  const debtParams: (string | number)[] = [];
  const debtClause = windowClause(days, "", debtParams);
  const debts = await db.select<SalesByDayRow[]>(
    `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
     FROM customer_payments
     WHERE ${debtClause} AND ${PAYMENT_NOT_VOIDED_SQL}
     GROUP BY date(created_at)`,
    debtParams,
  );
  const byDay = new Map<string, SalesByDayRow>();
  for (const row of [...sales, ...debts]) {
    const prev = byDay.get(row.day);
    if (!prev) {
      byDay.set(row.day, { day: row.day, count: row.count, total: row.total });
    } else {
      prev.count += row.count;
      prev.total += row.total;
    }
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

export async function getSalesByPayment(
  days: ReportWindow = 30,
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

/** Cobros de fiado por medio en el período (y del cajero, si se elige). No llevan caja. */
export async function getCustomerPaymentsByMethod(window: ReportWindow): Promise<SalesByPaymentRow[]> {
  const db = await getDb();
  const params: (string | number)[] = [];
  const clause = windowClause(window, "", params);
  return db.select<SalesByPaymentRow[]>(
    `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
     FROM customer_payments
     WHERE ${clause} AND ${PAYMENT_NOT_VOIDED_SQL}
     GROUP BY payment_method
     ORDER BY total DESC`,
    params,
  );
}

export async function getSalesByPaymentMonthToDate(
  scope: ReportScope = "consolidado",
): Promise<SalesByPaymentRow[]> {
  const db = await getDb();
  const { clause, params } = await salesMonthToDateFilter(scope);
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
  days: ReportWindow = 30,
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

/** Top del día calendario (misma ventana que getTodaySalesByPayment). */
export async function getTopProductsToday(
  limit = 8,
  scope: ReportScope = "consolidado",
): Promise<TopProductRow[]> {
  const db = await getDb();
  const { clause, params } = await salesTodayFilter(scope, "s");
  const limitParam = params.length + 1;
  return db.select<TopProductRow[]>(
    `SELECT si.name AS name, SUM(si.qty) AS qty, SUM(si.line_total) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE ${clause}
     GROUP BY si.name
     ORDER BY total DESC
     LIMIT $${limitParam}`,
    [...params, limit],
  );
}

export async function getTopProductsMonthToDate(
  limit = 8,
  scope: ReportScope = "consolidado",
): Promise<TopProductRow[]> {
  const db = await getDb();
  const { clause, params } = await salesMonthToDateFilter(scope, "s");
  const limitParam = params.length + 1;
  return db.select<TopProductRow[]>(
    `SELECT si.name AS name, SUM(si.qty) AS qty, SUM(si.line_total) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE ${clause}
     GROUP BY si.name
     ORDER BY total DESC
     LIMIT $${limitParam}`,
    [...params, limit],
  );
}

export async function getSalesByRegisterMonthToDate(
  scope: ReportScope = "consolidado",
): Promise<ReportRegisterRow[]> {
  const db = await getDb();
  const { clause, params } = await salesMonthToDateFilter(scope);
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

/** Ventas por producto y por día (detalle parcial diario). */
export async function getProductSalesByDay(
  days: ReportWindow = 30,
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
  days: ReportWindow = 30,
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
  days: ReportWindow = 30,
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
  window: ReportWindow,
  scope: ReportScope = "consolidado",
): Promise<PeriodComparison> {
  const db = await getDb();
  const w = windowParts(window);
  const localCode = scope === "local" ? await getLocalDeviceCode() : null;
  const baseParams: (string | number)[] = [];
  let currentSql: string;
  let previousSql: string;
  if (w.from && w.to) {
    // Rango elegido: se compara con la misma cantidad de días justo antes.
    const span = Math.round(
      (new Date(`${w.to}T12:00:00`).getTime() - new Date(`${w.from}T12:00:00`).getTime()) / 86_400_000,
    ) + 1;
    baseParams.push(w.from, w.to, shiftYmd(w.from, -span), shiftYmd(w.from, -1));
    currentSql = "date(created_at) BETWEEN $1 AND $2";
    previousSql = "date(created_at) BETWEEN $3 AND $4";
  } else {
    baseParams.push(sinceModifier(w.days), sinceModifier(w.days * 2));
    currentSql = "date(created_at) >= date('now','localtime', $1)";
    previousSql =
      "date(created_at) >= date('now','localtime', $2) AND date(created_at) < date('now','localtime', $1)";
  }
  let extraSql = "";
  if (localCode) {
    baseParams.push(localCode);
    extraSql += ` AND device_code = $${baseParams.length}`;
  }
  if (w.userId != null) {
    baseParams.push(w.userId);
    extraSql += ` AND user_id = $${baseParams.length}`;
  }

  const rows = await db.select<
    { current_total: number; current_count: number; previous_total: number; previous_count: number }[]
  >(
    `SELECT
       (SELECT COALESCE(SUM(total),0) FROM sales
        WHERE voided = 0 AND ${currentSql}${extraSql}) AS current_total,
       (SELECT COUNT(*) FROM sales
        WHERE voided = 0 AND ${currentSql}${extraSql}) AS current_count,
       (SELECT COALESCE(SUM(total),0) FROM sales
        WHERE voided = 0 AND ${previousSql}${extraSql}) AS previous_total,
       (SELECT COUNT(*) FROM sales
        WHERE voided = 0 AND ${previousSql}${extraSql}) AS previous_count`,
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
  days: ReportWindow = 30,
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

export interface SalesByTableRow {
  table_number: number;
  table_label: string;
  zone: string | null;
  count: number;
  total: number;
  avg_guests: number | null;
}

/** Ventas que cerraron una mesa (mismo total que Ventas). */
export async function getSalesByTable(
  days: ReportWindow = 30,
  scope: ReportScope = "consolidado",
): Promise<SalesByTableRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  return db.select<SalesByTableRow[]>(
    `SELECT t.number AS table_number,
            COALESCE(NULLIF(TRIM(t.name), ''), 'Mesa ' || t.number) AS table_label,
            t.zone AS zone,
            COUNT(*) AS count,
            COALESCE(SUM(s.total), 0) AS total,
            AVG(CASE WHEN o.guests IS NOT NULL AND o.guests > 0 THEN o.guests END) AS avg_guests
     FROM sales s
     INNER JOIN table_orders o ON o.sale_id = s.id AND o.status = 'closed'
     INNER JOIN dining_tables t ON t.id = o.table_id
     WHERE ${clause}
     GROUP BY t.number, t.name, t.zone
     ORDER BY total DESC`,
    params,
  );
}

export interface SalesByWaiterRow {
  waiter_key: string;
  waiter_name: string;
  count: number;
  total: number;
}

export interface SalesByOrderTypeRow {
  order_type: string;
  count: number;
  total: number;
}

/** Ventas por canal: mostrador / llevar / delivery (gastronomía). */
export async function getSalesByOrderType(
  days: ReportWindow = 30,
  scope: ReportScope = "consolidado",
): Promise<SalesByOrderTypeRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope);
  return db.select<SalesByOrderTypeRow[]>(
    `SELECT COALESCE(NULLIF(TRIM(order_type), ''), 'counter') AS order_type,
            COUNT(*) AS count,
            COALESCE(SUM(total), 0) AS total
     FROM sales
     WHERE ${clause}
     GROUP BY order_type
     ORDER BY total DESC`,
    params,
  );
}

/** Ventas de mesa agrupadas por mozo asignado (no por quien cobró en caja). */
export async function getSalesByWaiter(
  days: ReportWindow = 30,
  scope: ReportScope = "consolidado",
): Promise<SalesByWaiterRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  return db.select<SalesByWaiterRow[]>(
    `SELECT COALESCE(CAST(o.waiter_user_id AS TEXT), COALESCE(o.waiter_label, '')) AS waiter_key,
            COALESCE(wu.display_name, NULLIF(TRIM(o.waiter_label), ''), 'Sin mozo') AS waiter_name,
            COUNT(*) AS count,
            COALESCE(SUM(s.total), 0) AS total
     FROM sales s
     INNER JOIN table_orders o ON o.sale_id = s.id AND o.status = 'closed'
     LEFT JOIN users wu ON wu.id = o.waiter_user_id
     WHERE ${clause}
     GROUP BY waiter_key, waiter_name
     ORDER BY total DESC`,
    params,
  );
}

export interface SalesByVariantAttrRow {
  attr_value: string;
  qty: number;
  total: number;
  lines: number;
}

export interface SalesBySizeColorRow {
  size: string;
  color: string;
  label: string;
  qty: number;
  total: number;
  lines: number;
}

/** Path JSON seguro para json_extract (solo letras/números/_ del atributo). */
function jsonAttrPath(attrKey: string): string | null {
  const key = attrKey.trim().replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9_]/g, "");
  return key ? `$.${key}` : null;
}

/**
 * Ventas de ítems con variante, agrupadas por un atributo JSON (ej. Talle, Color).
 * Solo líneas con variant_id; si el atributo falta o está vacío → «Sin dato».
 */
export async function getSalesByVariantAttr(
  attrKey: string,
  days: ReportWindow = 30,
  scope: ReportScope = "consolidado",
): Promise<SalesByVariantAttrRow[]> {
  const path = jsonAttrPath(attrKey);
  if (!path) return [];
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  return db.select<SalesByVariantAttrRow[]>(
    `SELECT COALESCE(NULLIF(TRIM(json_extract(v.attributes, '${path}')), ''), 'Sin dato') AS attr_value,
            COALESCE(SUM(si.qty), 0) AS qty,
            COALESCE(SUM(si.line_total), 0) AS total,
            COUNT(*) AS lines
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN product_variants v ON v.id = si.variant_id
     WHERE ${clause}
       AND si.variant_id IS NOT NULL
     GROUP BY attr_value
     ORDER BY total DESC`,
    params,
  );
}

/** Combinación talle × color desde attributes JSON de la variante vendida. */
export async function getSalesBySizeColor(
  days: ReportWindow = 30,
  scope: ReportScope = "consolidado",
  sizeKey = "Talle",
  colorKey = "Color",
): Promise<SalesBySizeColorRow[]> {
  const sizePath = jsonAttrPath(sizeKey);
  const colorPath = jsonAttrPath(colorKey);
  if (!sizePath || !colorPath) return [];
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  return db.select<SalesBySizeColorRow[]>(
    `SELECT
       COALESCE(NULLIF(TRIM(json_extract(v.attributes, '${sizePath}')), ''), 'Sin talle') AS size,
       COALESCE(NULLIF(TRIM(json_extract(v.attributes, '${colorPath}')), ''), 'Sin color') AS color,
       COALESCE(NULLIF(TRIM(json_extract(v.attributes, '${sizePath}')), ''), 'Sin talle')
         || ' · '
         || COALESCE(NULLIF(TRIM(json_extract(v.attributes, '${colorPath}')), ''), 'Sin color') AS label,
       COALESCE(SUM(si.qty), 0) AS qty,
       COALESCE(SUM(si.line_total), 0) AS total,
       COUNT(*) AS lines
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN product_variants v ON v.id = si.variant_id
     WHERE ${clause}
       AND si.variant_id IS NOT NULL
     GROUP BY size, color
     ORDER BY total DESC`,
    params,
  );
}

export async function getSalesByEmployeeMonthToDate(
  scope: ReportScope = "consolidado",
): Promise<SalesByEmployeeRow[]> {
  const db = await getDb();
  const { clause, params } = await salesMonthToDateFilter(scope, "s");
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
  days: ReportWindow = 30,
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
  days: ReportWindow = 30,
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

/** Filtro de período con voided=1 (anulaciones). */
async function voidedPeriodFilter(
  window: ReportWindow,
  scope: ReportScope,
  alias?: string,
): Promise<{ clause: string; params: (string | number)[] }> {
  const a = alias ? `${alias}.` : "";
  const params: (string | number)[] = [];
  let clause = `${a}voided = 1 AND ${windowClause(window, a, params)}`;
  if (scope === "local") {
    const code = await getLocalDeviceCode();
    if (code) {
      params.push(code);
      clause += ` AND ${a}device_code = $${params.length}`;
    }
  }
  return { clause, params };
}

export interface VoidedSalesSummary {
  count: number;
  total: number;
}

/** Ventas anuladas en el período (no restar del neto vigente: ya están fuera). */
export async function getVoidedSalesSummary(
  days: ReportWindow = 30,
  scope: ReportScope = "consolidado",
): Promise<VoidedSalesSummary> {
  const db = await getDb();
  const { clause, params } = await voidedPeriodFilter(days, scope);
  const rows = await db.select<{ count: number; total: number }[]>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
     FROM sales
     WHERE ${clause}`,
    params,
  );
  return { count: rows[0]?.count ?? 0, total: rows[0]?.total ?? 0 };
}

/** Unidades vendidas (líneas vigentes con variante o producto). */
export async function getUnitsSold(
  days: ReportWindow = 30,
  scope: ReportScope = "consolidado",
): Promise<number> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  const rows = await db.select<{ qty: number }[]>(
    `SELECT COALESCE(SUM(si.qty), 0) AS qty
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE ${clause}`,
    params,
  );
  return rows[0]?.qty ?? 0;
}

export interface TopProductMarginRow {
  name: string;
  qty: number;
  total: number;
  cost: number;
  margin: number;
}

/** Ranking por rentabilidad estimada (precio línea − qty × costo actual del producto). */
export async function getTopProductsByMargin(
  days: ReportWindow = 30,
  limit = 12,
  scope: ReportScope = "consolidado",
): Promise<TopProductMarginRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  params.push(limit);
  return db.select<TopProductMarginRow[]>(
    `SELECT COALESCE(si.name, p.name, 'Sin nombre') AS name,
            COALESCE(SUM(si.qty), 0) AS qty,
            COALESCE(SUM(si.line_total), 0) AS total,
            COALESCE(SUM(si.qty * COALESCE(p.cost, 0)), 0) AS cost,
            COALESCE(SUM(si.line_total), 0) - COALESCE(SUM(si.qty * COALESCE(p.cost, 0)), 0) AS margin
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.id = si.product_id
     WHERE ${clause}
     GROUP BY name
     ORDER BY margin DESC
     LIMIT $${params.length}`,
    params,
  );
}

export interface ProductsWithoutSalesRow {
  id: number;
  name: string;
  stock: number;
}

/** Productos activos (con stock trackeable) sin ventas en el período. */
export async function getProductsWithoutSales(
  days: ReportWindow = 30,
  limit = 30,
  scope: ReportScope = "consolidado",
): Promise<ProductsWithoutSalesRow[]> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  params.push(limit);
  return db.select<ProductsWithoutSalesRow[]>(
    `SELECT p.id, p.name, COALESCE(p.stock, 0) AS stock
     FROM products p
     WHERE p.active = 1
       AND COALESCE(p.track_stock, 1) = 1
       AND lower(COALESCE(p.unit, '')) NOT IN ('servicio', 'práctica', 'practica', 'sesión', 'sesion')
       AND p.id NOT IN (
         SELECT DISTINCT si.product_id
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE ${clause} AND si.product_id IS NOT NULL
       )
     ORDER BY p.name
     LIMIT $${params.length}`,
    params,
  );
}

export interface CustomerSalesStats {
  new_customers: number;
  returning_customers: number;
  top: { customer_id: number; name: string; total: number; count: number }[];
}

/** Clientes con venta en el período: nuevos (primera venta en el rango) vs recurrentes. */
export async function getCustomersSalesStats(
  days: ReportWindow = 30,
  scope: ReportScope = "consolidado",
  topLimit = 8,
): Promise<CustomerSalesStats> {
  const db = await getDb();
  const { clause, params } = await salesPeriodFilter(days, scope, "s");
  const buyers = await db.select<{ customer_id: number; name: string; total: number; count: number; first_ever: string }[]>(
    `SELECT s.customer_id,
            COALESCE(c.name, 'Sin nombre') AS name,
            COALESCE(SUM(s.total), 0) AS total,
            COUNT(*) AS count,
            (SELECT MIN(s2.created_at) FROM sales s2
              WHERE s2.customer_id = s.customer_id AND s2.voided = 0) AS first_ever
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE ${clause} AND s.customer_id IS NOT NULL
     GROUP BY s.customer_id, c.name
     ORDER BY total DESC`,
    params,
  );
  const w = typeof days === "number"
    ? { from: null as string | null, to: null as string | null }
    : { from: days.from ?? null, to: days.to ?? null };
  let newCount = 0;
  let returning = 0;
  for (const b of buyers) {
    const firstDay = (b.first_ever || "").slice(0, 10);
    const inPeriod =
      w.from && w.to
        ? firstDay >= w.from && firstDay <= w.to
        : true;
    // Con ventana por días: primera venta en el mismo rango de fechas del filtro.
    if (typeof days === "number") {
      const from = shiftYmd(todayYmdLocal(), -(days - 1));
      if (firstDay >= from) newCount += 1;
      else returning += 1;
    } else if (inPeriod) {
      newCount += 1;
    } else {
      returning += 1;
    }
  }
  return {
    new_customers: newCount,
    returning_customers: returning,
    top: buyers.slice(0, topLimit).map((b) => ({
      customer_id: b.customer_id,
      name: b.name,
      total: b.total,
      count: b.count,
    })),
  };
}

function todayYmdLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface ClosedCashDiffSummary {
  sessions: number;
  with_diff: number;
  total_diff: number;
  total_expected: number;
  total_declared: number;
}

/** Cierres de caja en el rango (por closed_at). No mezcla Tesorería. */
export async function getClosedCashDiffSummary(
  from: string,
  to: string,
): Promise<ClosedCashDiffSummary> {
  const db = await getDb();
  const rows = await db.select<
    {
      sessions: number;
      with_diff: number;
      total_diff: number;
      total_expected: number;
      total_declared: number;
    }[]
  >(
    `SELECT COUNT(*) AS sessions,
            COALESCE(SUM(CASE WHEN cash_difference IS NOT NULL AND ABS(cash_difference) > 0.005 THEN 1 ELSE 0 END), 0) AS with_diff,
            COALESCE(SUM(COALESCE(cash_difference, 0)), 0) AS total_diff,
            COALESCE(SUM(COALESCE(expected_cash, 0)), 0) AS total_expected,
            COALESCE(SUM(COALESCE(declared_cash, 0)), 0) AS total_declared
     FROM cash_sessions
     WHERE status = 'closed'
       AND closed_at IS NOT NULL
       AND date(closed_at) BETWEEN $1 AND $2`,
    [from, to],
  );
  return {
    sessions: rows[0]?.sessions ?? 0,
    with_diff: rows[0]?.with_diff ?? 0,
    total_diff: rows[0]?.total_diff ?? 0,
    total_expected: rows[0]?.total_expected ?? 0,
    total_declared: rows[0]?.total_declared ?? 0,
  };
}

export function periodToDays(period: ReportPeriod): number {
  return PERIOD_DAYS[period];
}

export interface CustomerDebtRow {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  last_movement_at: string | null;
}

/** Clientes con saldo a favor del comercio (fiado sin cobrar), de mayor a menor. */
export async function getCustomersWithDebt(): Promise<CustomerDebtRow[]> {
  const db = await getDb();
  return db.select<CustomerDebtRow[]>(
    `SELECT c.id, c.name, c.phone, c.balance,
            (SELECT MAX(m.created_at) FROM customer_balance_movements m WHERE m.customer_id = c.id) AS last_movement_at
     FROM customers c
     WHERE c.active = 1 AND c.balance > 0.005
     ORDER BY c.balance DESC`,
  );
}

export interface StockValuationRow {
  category_name: string;
  products: number;
  units: number;
  cost_value: number;
  price_value: number;
}

/** Mercadería en el local hoy: unidades × costo y × precio, por categoría (solo lo que lleva stock). */
export async function getStockValuation(): Promise<StockValuationRow[]> {
  const db = await getDb();
  return db.select<StockValuationRow[]>(
    `SELECT COALESCE(c.name, 'Sin categoría') AS category_name,
            COUNT(*) AS products,
            COALESCE(SUM(p.stock), 0) AS units,
            COALESCE(SUM(p.stock * p.cost), 0) AS cost_value,
            COALESCE(SUM(p.stock * p.price), 0) AS price_value
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.active = 1 AND COALESCE(p.track_stock, 1) = 1 AND p.stock > 0
     GROUP BY category_name
     ORDER BY price_value DESC`,
  );
}
