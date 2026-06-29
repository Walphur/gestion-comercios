import type { Product } from "../types";
import type { Sale } from "../types";
import { getDb } from "./index";
import { listProducts } from "./products";
import { getSalesByDay, type SalesByDayRow } from "./reports";

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
