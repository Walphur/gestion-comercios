import type { Product } from "../types";
import type { Sale } from "../types";
import { getDb } from "./index";
import { listProducts } from "./products";
import { getSalesByDay, type SalesByDayRow } from "./reports";
import { PORTAL_STOCK_ALERT_WHERE_SQL } from "../lib/stock";

export interface TodayProfit {
  revenue: number;
  cost: number;
  profit: number;
}

export async function getTodayProfit(): Promise<TodayProfit> {
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
     WHERE s.voided = 0 AND date(s.created_at) = date('now','localtime')`,
  );
  const revenue = rows[0]?.revenue ?? 0;
  const cost = rows[0]?.cost ?? 0;
  return { revenue, cost, profit: revenue - cost };
}

export async function listLowStockProducts(limit = 5): Promise<Product[]> {
  const items = await listProducts({ onlyLowStock: true });
  return items.slice(0, limit);
}

/** Alertas de stock para el panel web del dueño (sin ruido de catálogo min=0). */
export async function listPortalStockAlerts(limit = 30): Promise<Product[]> {
  const db = await getDb();
  return db.select<Product[]>(
    `SELECT p.id, p.name, p.stock, p.min_stock, p.barcode, p.sku
     FROM products p
     WHERE p.active = 1 AND ${PORTAL_STOCK_ALERT_WHERE_SQL}
     ORDER BY
       CASE WHEN p.stock < 0 THEN 0 ELSE 1 END,
       (p.stock - p.min_stock) ASC,
       p.name ASC
     LIMIT $1`,
    [limit],
  );
}

export async function countPortalStockAlerts(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM products p
     WHERE p.active = 1 AND ${PORTAL_STOCK_ALERT_WHERE_SQL}`,
  );
  return rows[0]?.n ?? 0;
}

export interface TopSellerRow {
  name: string;
  qty: number;
}

export async function getTopSellers(days: number, limit = 5): Promise<TopSellerRow[]> {
  const db = await getDb();
  if (days <= 1) {
    return db.select<TopSellerRow[]>(
      `SELECT si.name AS name, COALESCE(SUM(si.qty), 0) AS qty
       FROM sale_items si
       INNER JOIN sales s ON s.id = si.sale_id
       WHERE s.voided = 0
         AND date(s.created_at) = date('now', 'localtime')
       GROUP BY si.name
       ORDER BY qty DESC
       LIMIT $1`,
      [limit],
    );
  }
  return db.select<TopSellerRow[]>(
    `SELECT si.name AS name, COALESCE(SUM(si.qty), 0) AS qty
     FROM sale_items si
     INNER JOIN sales s ON s.id = si.sale_id
     WHERE s.voided = 0
       AND s.created_at >= datetime('now', 'localtime', '-' || $1 || ' days')
     GROUP BY si.name
     ORDER BY qty DESC
     LIMIT $2`,
    [days, limit],
  );
}

export interface PortalRegisterRow {
  device_code: string;
  device_name: string | null;
  count: number;
  total: number;
}

/** Ventas de hoy agrupadas por caja/PC (para panel web del dueño). */
export async function getTodaySalesByRegister(): Promise<PortalRegisterRow[]> {
  const db = await getDb();
  return db.select<PortalRegisterRow[]>(
    `SELECT COALESCE(device_code, '—') AS device_code,
            MAX(device_name) AS device_name,
            COUNT(*) AS count,
            COALESCE(SUM(total), 0) AS total
     FROM sales
     WHERE voided = 0
       AND date(created_at) = date('now', 'localtime')
       AND device_code IS NOT NULL AND TRIM(device_code) != ''
     GROUP BY device_code
     ORDER BY total DESC`,
  );
}

export interface DaySalesSummary {
  total: number;
  count: number;
}

export async function getYesterdaySummary(): Promise<DaySalesSummary> {
  const db = await getDb();
  const rows = await db.select<{ total: number; count: number }[]>(
    `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
     FROM sales
     WHERE voided = 0
       AND date(created_at) = date('now', 'localtime', '-1 day')`,
  );
  return { total: rows[0]?.total ?? 0, count: rows[0]?.count ?? 0 };
}

export interface PortalEmployeeRow {
  name: string;
  count: number;
  total: number;
}

/** Ventas de hoy por empleado (solo lectura en el panel web). */
export async function getTodaySalesByEmployee(): Promise<PortalEmployeeRow[]> {
  const db = await getDb();
  return db.select<PortalEmployeeRow[]>(
    `SELECT COALESCE(u.display_name, 'Sin asignar') AS name,
            COUNT(*) AS count,
            COALESCE(SUM(s.total), 0) AS total
     FROM sales s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.voided = 0
       AND date(s.created_at) = date('now', 'localtime')
     GROUP BY s.user_id, u.display_name
     ORDER BY total DESC
     LIMIT 12`,
  );
}

/** Últimos 7 días calendario (incluye días en 0), orden cronológico. */
export async function getPortalSalesLast7Days(): Promise<SalesByDayRow[]> {
  const raw = await getSalesByDay(7, "consolidado");
  const byDay = new Map(raw.map((r) => [r.day, r]));
  const out: SalesByDayRow[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    const hit = byDay.get(key);
    out.push({ day: key, count: hit?.count ?? 0, total: hit?.total ?? 0 });
  }
  return out;
}

export async function getRecentSales(limit = 8): Promise<Sale[]> {
  const db = await getDb();
  return db.select<Sale[]>(
    `SELECT s.*, c.name AS customer_name, u.display_name AS seller_name
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.voided = 0
     ORDER BY s.id DESC
     LIMIT $1`,
    [limit],
  );
}

export async function getWeekSalesChart(): Promise<SalesByDayRow[]> {
  return getSalesByDay(7);
}
