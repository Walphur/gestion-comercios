import { getDb } from "../index";
import { getTodaySummary } from "../sales";
import { getPeriodComparison, getPeriodTotals } from "../reports";
import { avgTicket, pctChange } from "./calc";
import { INTELLIGENCE_WINDOWS } from "./constants";
import type { SalesComparison, SalesPeriodSummary } from "./types";

function sinceModifier(days: number): string {
  return `-${days} days`;
}

async function getUnitsSoldToday(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ units: number }[]>(
    `SELECT COALESCE(SUM(si.qty), 0) AS units
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.voided = 0 AND date(s.created_at) = date('now', 'localtime')`,
  );
  return rows[0]?.units ?? 0;
}

async function getUnitsSoldSince(days: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ units: number }[]>(
    `SELECT COALESCE(SUM(si.qty), 0) AS units
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', $1)`,
    [sinceModifier(days)],
  );
  return rows[0]?.units ?? 0;
}

async function getUnitsSoldPreviousPeriod(days: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ units: number }[]>(
    `SELECT COALESCE(SUM(si.qty), 0) AS units
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.voided = 0
       AND date(s.created_at) >= date('now', 'localtime', $1)
       AND date(s.created_at) < date('now', 'localtime', $2)`,
    [sinceModifier(days * 2), sinceModifier(days)],
  );
  return rows[0]?.units ?? 0;
}

export async function getSalesTodaySummary(): Promise<SalesPeriodSummary> {
  const [today, units] = await Promise.all([getTodaySummary(), getUnitsSoldToday()]);
  return {
    count: today.todayCount,
    total: today.todayTotal,
    units_sold: units,
    avg_ticket: avgTicket(today.todayTotal, today.todayCount),
  };
}

export async function getSalesPeriodSummary(
  days = INTELLIGENCE_WINDOWS.commercial,
): Promise<SalesPeriodSummary> {
  const [totals, units] = await Promise.all([
    getPeriodTotals(days),
    getUnitsSoldSince(days),
  ]);
  return {
    count: totals.count,
    total: totals.total,
    units_sold: units,
    avg_ticket: totals.avg_ticket,
  };
}

export async function getSalesComparisonExtended(): Promise<SalesComparison> {
  const days = INTELLIGENCE_WINDOWS.commercial;
  const [base, current_units, previous_units] = await Promise.all([
    getPeriodComparison(days),
    getUnitsSoldSince(days),
    getUnitsSoldPreviousPeriod(days),
  ]);
  const current_avg_ticket = avgTicket(base.current_total, base.current_count);
  const previous_avg_ticket = avgTicket(base.previous_total, base.previous_count);
  return {
    current_total: base.current_total,
    current_count: base.current_count,
    current_units,
    current_avg_ticket,
    previous_total: base.previous_total,
    previous_count: base.previous_count,
    previous_units,
    previous_avg_ticket,
    revenue_change_pct: base.change_pct,
    units_change_pct: pctChange(current_units, previous_units),
    ticket_change_pct: pctChange(current_avg_ticket, previous_avg_ticket),
  };
}
