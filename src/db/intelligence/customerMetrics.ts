import { getDb } from "../index";
import { INTELLIGENCE_WINDOWS } from "./constants";
import type {
  CustomerActivitySummary,
  CustomerDebtRow,
  CustomerRecurrenceSummary,
  CustomerSegment,
} from "./types";

export async function getCustomerActivitySummary(): Promise<CustomerActivitySummary> {
  const db = await getDb();
  const rows = await db.select<{ segment: CustomerSegment; n: number }[]>(
    `WITH last_purchase AS (
       SELECT
         c.id,
         MAX(s.created_at) AS last_sale_at
       FROM customers c
       LEFT JOIN sales s ON s.customer_id = c.id AND s.voided = 0
       WHERE c.active = 1
       GROUP BY c.id
     )
     SELECT
       CASE
         WHEN last_sale_at IS NULL THEN 'never_purchased'
         WHEN date(last_sale_at) >= date('now', 'localtime', '-30 days') THEN 'active'
         WHEN date(last_sale_at) >= date('now', 'localtime', '-90 days') THEN 'at_risk'
         ELSE 'inactive'
       END AS segment,
       COUNT(*) AS n
     FROM last_purchase
     GROUP BY segment`,
  );

  const summary: CustomerActivitySummary = {
    active: 0,
    at_risk: 0,
    inactive: 0,
    never_purchased: 0,
    total: 0,
  };
  for (const r of rows) {
    summary[r.segment] = r.n;
    summary.total += r.n;
  }
  return summary;
}

export async function getCustomerRecurrenceSummary(
  days = INTELLIGENCE_WINDOWS.commercial,
): Promise<CustomerRecurrenceSummary> {
  const db = await getDb();
  const rows = await db.select<
    { new_customers: number; returning_customers: number; repeat_in_period: number }[]
  >(
    `WITH sales_in_period AS (
       SELECT customer_id, COUNT(*) AS cnt
       FROM sales
       WHERE voided = 0
         AND customer_id IS NOT NULL
         AND date(created_at) >= date('now', 'localtime', $1)
       GROUP BY customer_id
     ),
     prior_sales AS (
       SELECT DISTINCT s.customer_id
       FROM sales s
       WHERE s.voided = 0
         AND s.customer_id IS NOT NULL
         AND date(s.created_at) < date('now', 'localtime', $1)
     )
     SELECT
       COALESCE(SUM(CASE WHEN sip.cnt = 1 AND ps.customer_id IS NULL THEN 1 ELSE 0 END), 0) AS new_customers,
       COALESCE(SUM(CASE WHEN sip.cnt >= 1 AND ps.customer_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS returning_customers,
       COALESCE(SUM(CASE WHEN sip.cnt >= 2 THEN 1 ELSE 0 END), 0) AS repeat_in_period
     FROM sales_in_period sip
     LEFT JOIN prior_sales ps ON ps.customer_id = sip.customer_id`,
    [`-${days} days`],
  );
  const r = rows[0];
  return {
    new_customers: r?.new_customers ?? 0,
    returning_customers: r?.returning_customers ?? 0,
    repeat_in_period: r?.repeat_in_period ?? 0,
    period_days: days as 30,
  };
}

export async function getCustomersWithDebt(limit: number): Promise<CustomerDebtRow[]> {
  const db = await getDb();
  return db.select<CustomerDebtRow[]>(
    `SELECT id AS customer_id, name, balance, credit_limit
     FROM customers
     WHERE active = 1 AND balance > 0
     ORDER BY balance DESC
     LIMIT $1`,
    [limit],
  );
}

export async function getCustomersNearCreditLimit(
  usageThreshold = 0.8,
  limit: number,
): Promise<CustomerDebtRow[]> {
  const db = await getDb();
  return db.select<CustomerDebtRow[]>(
    `SELECT
       id AS customer_id,
       name,
       balance,
       credit_limit,
       (balance / credit_limit) * 100 AS usage_pct
     FROM customers
     WHERE active = 1
       AND credit_limit > 0
       AND balance >= credit_limit * $1
     ORDER BY usage_pct DESC
     LIMIT $2`,
    [usageThreshold, limit],
  );
}
