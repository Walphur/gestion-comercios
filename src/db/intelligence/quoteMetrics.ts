import { getDb } from "../index";
import type { QuotePendingRow, QuotesSummary } from "./types";

export async function getQuotesSummary(): Promise<QuotesSummary> {
  const db = await getDb();
  const rows = await db.select<
    {
      pending: number;
      expiring_soon: number;
      stale_sent: number;
      pending_amount: number;
    }[]
  >(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN ('draft', 'sent') THEN 1 ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE
         WHEN status = 'sent' AND valid_until IS NOT NULL
           AND date(valid_until) BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+7 days')
         THEN 1 ELSE 0 END), 0) AS expiring_soon,
       COALESCE(SUM(CASE
         WHEN status = 'sent' AND date(updated_at) <= date('now', 'localtime', '-14 days')
         THEN 1 ELSE 0 END), 0) AS stale_sent,
       COALESCE(SUM(CASE WHEN status IN ('draft', 'sent') THEN total ELSE 0 END), 0) AS pending_amount
     FROM quotes`,
  );
  const r = rows[0];
  return {
    pending: r?.pending ?? 0,
    expiring_soon: r?.expiring_soon ?? 0,
    stale_sent: r?.stale_sent ?? 0,
    pending_amount: r?.pending_amount ?? 0,
  };
}

export async function getQuotesPendingList(limit: number): Promise<QuotePendingRow[]> {
  const db = await getDb();
  return db.select<QuotePendingRow[]>(
    `SELECT
       q.id AS quote_id,
       q.quote_number,
       q.status,
       q.total,
       q.valid_until,
       q.updated_at,
       q.customer_id,
       c.name AS customer_name
     FROM quotes q
     LEFT JOIN customers c ON c.id = q.customer_id
     WHERE q.status IN ('draft', 'sent')
     ORDER BY
       CASE WHEN q.valid_until IS NOT NULL AND date(q.valid_until) < date('now', 'localtime') THEN 0 ELSE 1 END,
       q.updated_at ASC
     LIMIT $1`,
    [limit],
  );
}
