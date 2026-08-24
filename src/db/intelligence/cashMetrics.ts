import { getDb } from "../index";
import { getOpenCashSessionId } from "../cash";
import { INTELLIGENCE_WINDOWS } from "./constants";
import type { CashDifferenceSummary, CashSessionRow } from "./types";

export async function getOpenCashSessionIdOrNull(): Promise<number | null> {
  try {
    return await getOpenCashSessionId();
  } catch {
    return null;
  }
}

export async function getRecentCashDifferences(limit: number): Promise<CashSessionRow[]> {
  const db = await getDb();
  return db.select<CashSessionRow[]>(
    `SELECT
       id AS cash_session_id,
       closed_at,
       declared_cash,
       expected_cash,
       cash_difference
     FROM cash_sessions
     WHERE status = 'closed'
       AND closed_at >= datetime('now', 'localtime', $1)
     ORDER BY closed_at DESC
     LIMIT $2`,
    [`-${INTELLIGENCE_WINDOWS.cashRecent} days`, limit],
  );
}

export async function getCashDifferenceSummary(): Promise<CashDifferenceSummary> {
  const db = await getDb();
  const rows = await db.select<
    { closed_sessions: number; with_difference: number; net_difference: number }[]
  >(
    `SELECT
       COUNT(*) AS closed_sessions,
       COALESCE(SUM(CASE WHEN ABS(COALESCE(cash_difference, 0)) > 0.01 THEN 1 ELSE 0 END), 0) AS with_difference,
       COALESCE(SUM(cash_difference), 0) AS net_difference
     FROM cash_sessions
     WHERE status = 'closed'
       AND closed_at >= datetime('now', 'localtime', $1)`,
    [`-${INTELLIGENCE_WINDOWS.cashRecent} days`],
  );
  const r = rows[0];
  return {
    closed_sessions: r?.closed_sessions ?? 0,
    with_difference: r?.with_difference ?? 0,
    net_difference: r?.net_difference ?? 0,
  };
}
