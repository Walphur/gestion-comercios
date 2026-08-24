import { getDb } from "../index";
import { INTELLIGENCE_WINDOWS } from "./constants";
import type { CatalogMarginRow, SoldMarginRow } from "./types";

export async function getWorstCatalogMargins(limit: number): Promise<CatalogMarginRow[]> {
  const db = await getDb();
  return db.select<CatalogMarginRow[]>(
    `SELECT
       id AS product_id,
       name,
       cost,
       price,
       CASE WHEN price > 0 THEN ((price - cost) / price) * 100 ELSE 0 END AS margin_pct
     FROM products
     WHERE active = 1 AND price > 0 AND cost > 0
     ORDER BY margin_pct ASC
     LIMIT $1`,
    [limit],
  );
}

export async function getWorstSoldMargins(
  days = INTELLIGENCE_WINDOWS.commercial,
  minUnits = 5,
  limit: number,
): Promise<SoldMarginRow[]> {
  const db = await getDb();
  return db.select<SoldMarginRow[]>(
    `SELECT
       si.product_id,
       si.name,
       SUM(si.qty) AS units_sold,
       SUM(si.line_total) AS revenue,
       SUM(si.qty * COALESCE(p.cost, 0)) AS cost,
       CASE WHEN SUM(si.line_total) > 0
         THEN ((SUM(si.line_total) - SUM(si.qty * COALESCE(p.cost, 0))) / SUM(si.line_total)) * 100
         ELSE 0
       END AS margin_pct
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN products p ON p.id = si.product_id
     WHERE s.voided = 0
       AND date(s.created_at) >= date('now', 'localtime', $1)
       AND si.product_id IS NOT NULL
     GROUP BY si.product_id, si.name
     HAVING units_sold >= $2
     ORDER BY margin_pct ASC
     LIMIT $3`,
    [`-${days} days`, minUnits, limit],
  );
}
