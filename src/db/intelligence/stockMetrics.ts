import type { Product } from "../../types";
import { getDb } from "../index";
import { getProductStats } from "../products";
import { listLowStockProducts } from "../dashboard";
import { countExpiringProducts } from "../expiry";
import { INTELLIGENCE_WINDOWS } from "./constants";
import type {
  EstimatedCoverageRow,
  ProductMovementRow,
  ProductRef,
} from "./types";

function toProductRef(p: Product): ProductRef {
  return {
    product_id: p.id,
    name: p.name,
    stock: p.stock,
    min_stock: p.min_stock,
    cost: p.cost,
    price: p.price,
  };
}

export async function getLowStockProducts(limit: number): Promise<ProductRef[]> {
  const items = await listLowStockProducts(limit);
  return items.map(toProductRef);
}

export async function getInventoryBasics(): Promise<{
  total_products: number;
  stock_value: number;
  low_stock_count: number;
  expiring_count: number;
}> {
  const [stats, expiring_count] = await Promise.all([
    getProductStats(),
    countExpiringProducts(14).catch(() => 0),
  ]);
  return {
    total_products: stats.total,
    stock_value: stats.stockValue,
    low_stock_count: stats.lowStock,
    expiring_count,
  };
}

export async function getEstimatedLowCoverage(
  coverageDays = INTELLIGENCE_WINDOWS.coverage,
  thresholdDays: number,
  limit: number,
): Promise<EstimatedCoverageRow[]> {
  const db = await getDb();
  const rows = await db.select<
    {
      product_id: number;
      name: string;
      stock: number;
      min_stock: number;
      cost: number;
      price: number;
      units_sold: number;
    }[]
  >(
    `SELECT
       p.id AS product_id,
       p.name,
       p.stock,
       p.min_stock,
       p.cost,
       p.price,
       COALESCE(SUM(si.qty), 0) AS units_sold
     FROM products p
     LEFT JOIN sale_items si ON si.product_id = p.id
       AND si.sale_id IN (
         SELECT id FROM sales
         WHERE voided = 0
           AND date(created_at) >= date('now', 'localtime', $1)
       )
     WHERE p.active = 1 AND p.stock > 0
     GROUP BY p.id
     HAVING units_sold > 0
     ORDER BY
       CASE
         WHEN units_sold > 0 THEN p.stock / (units_sold / CAST($2 AS REAL))
         ELSE 999999
       END ASC
     LIMIT $3`,
    [`-${coverageDays} days`, coverageDays, limit * 3],
  );

  const out: EstimatedCoverageRow[] = [];
  for (const r of rows) {
    const avg_daily_sales = r.units_sold / coverageDays;
    const estimated_days_cover =
      avg_daily_sales > 0 ? r.stock / avg_daily_sales : null;
    if (estimated_days_cover == null || estimated_days_cover >= thresholdDays) continue;
    out.push({
      product_id: r.product_id,
      name: r.name,
      stock: r.stock,
      min_stock: r.min_stock,
      cost: r.cost,
      price: r.price,
      units_sold_7d: r.units_sold,
      avg_daily_sales,
      estimated_days_cover,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function getSlowMovingProducts(
  days = INTELLIGENCE_WINDOWS.slowMoving,
  limit: number,
): Promise<ProductRef[]> {
  const db = await getDb();
  const rows = await db.select<
    { id: number; name: string; stock: number; min_stock: number; cost: number; price: number }[]
  >(
    `SELECT p.id, p.name, p.stock, p.min_stock, p.cost, p.price
     FROM products p
     WHERE p.active = 1
       AND NOT EXISTS (
         SELECT 1
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.voided = 0
           AND si.product_id = p.id
           AND date(s.created_at) >= date('now', 'localtime', $1)
       )
     ORDER BY p.stock * p.cost DESC
     LIMIT $2`,
    [`-${days} days`, limit],
  );
  return rows.map((r) => ({
    product_id: r.id,
    name: r.name,
    stock: r.stock,
    min_stock: r.min_stock,
    cost: r.cost,
    price: r.price,
  }));
}

export async function getTopProductMovement(
  days = INTELLIGENCE_WINDOWS.commercial,
  limit: number,
): Promise<ProductMovementRow[]> {
  const db = await getDb();
  const rows = await db.select<
    {
      product_id: number;
      name: string;
      stock: number;
      min_stock: number;
      cost: number;
      price: number;
      units_sold: number;
    }[]
  >(
    `SELECT
       p.id AS product_id,
       p.name,
       p.stock,
       p.min_stock,
       p.cost,
       p.price,
       COALESCE(SUM(si.qty), 0) AS units_sold
     FROM products p
     INNER JOIN sale_items si ON si.product_id = p.id
     INNER JOIN sales s ON s.id = si.sale_id
     WHERE p.active = 1
       AND s.voided = 0
       AND date(s.created_at) >= date('now', 'localtime', $1)
     GROUP BY p.id
     HAVING units_sold > 0
     ORDER BY units_sold DESC
     LIMIT $2`,
    [`-${days} days`, limit],
  );
  return rows.map((r) => ({
    product_id: r.product_id,
    name: r.name,
    stock: r.stock,
    min_stock: r.min_stock,
    cost: r.cost,
    price: r.price,
    units_sold: r.units_sold,
    period_days: 30 as const,
  }));
}
