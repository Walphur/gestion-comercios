import { getTodayProfit } from "../dashboard";
import { getPeriodProfit } from "../reports";
import { marginPct } from "./calc";
import { INTELLIGENCE_WINDOWS, PROFIT_ESTIMATION_NOTE } from "./constants";
import type { EstimatedProfitSummary } from "./types";

function toEstimated(
  revenue: number,
  cost: number,
  profit: number,
  margin_pct?: number,
): EstimatedProfitSummary {
  return {
    revenue,
    cost,
    profit,
    margin_pct: margin_pct ?? marginPct(revenue, profit),
    is_estimated: true,
    estimation_note: PROFIT_ESTIMATION_NOTE,
  };
}

export async function getEstimatedProfitToday(): Promise<EstimatedProfitSummary> {
  const p = await getTodayProfit();
  return toEstimated(p.revenue, p.cost, p.profit);
}

export async function getEstimatedProfitPeriod(
  days = INTELLIGENCE_WINDOWS.commercial,
): Promise<EstimatedProfitSummary> {
  const p = await getPeriodProfit(days);
  return toEstimated(p.revenue, p.cost, p.profit, p.margin_pct);
}
