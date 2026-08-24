import { buildLanFreshnessMeta } from "./freshness";
import {
  getSalesComparisonExtended,
  getSalesPeriodSummary,
  getSalesTodaySummary,
} from "./salesMetrics";
import { getEstimatedProfitPeriod, getEstimatedProfitToday } from "./profitMetrics";
import {
  getEstimatedLowCoverage,
  getInventoryBasics,
  getLowStockProducts,
  getSlowMovingProducts,
  getTopProductMovement,
} from "./stockMetrics";
import { getWorstCatalogMargins, getWorstSoldMargins } from "./marginMetrics";
import {
  getCustomerActivitySummary,
  getCustomerRecurrenceSummary,
  getCustomersNearCreditLimit,
  getCustomersWithDebt,
} from "./customerMetrics";
import { getQuotesPendingList, getQuotesSummary } from "./quoteMetrics";
import {
  getCashDifferenceSummary,
  getOpenCashSessionIdOrNull,
  getRecentCashDifferences,
} from "./cashMetrics";
import {
  DEFAULT_COVERAGE_THRESHOLD_DAYS,
  DEFAULT_LIST_LIMIT,
} from "./constants";
import type { IntelligenceSnapshot, IntelligenceSnapshotOptions } from "./types";

export async function getIntelligenceSnapshot(
  options: IntelligenceSnapshotOptions = {},
): Promise<IntelligenceSnapshot> {
  const listLimit = options.listLimit ?? DEFAULT_LIST_LIMIT;
  const coverageThresholdDays = options.coverageThresholdDays ?? DEFAULT_COVERAGE_THRESHOLD_DAYS;
  const includeQuotes = options.includeQuotes ?? false;
  const includeCash = options.includeCash ?? true;

  const [
    freshness,
    salesToday,
    salesPeriod,
    salesComparison,
    profitToday,
    profitPeriod,
    inventory,
    low_stock,
    estimated_low_coverage,
    slow_moving,
    top_movement,
    worst_catalog,
    worst_sold,
    activity,
    recurrence,
    with_debt,
    near_limit,
  ] = await Promise.all([
    buildLanFreshnessMeta(),
    getSalesTodaySummary(),
    getSalesPeriodSummary(),
    getSalesComparisonExtended(),
    getEstimatedProfitToday(),
    getEstimatedProfitPeriod(),
    getInventoryBasics(),
    getLowStockProducts(listLimit),
    getEstimatedLowCoverage(undefined, coverageThresholdDays, listLimit),
    getSlowMovingProducts(undefined, listLimit),
    getTopProductMovement(undefined, listLimit),
    getWorstCatalogMargins(listLimit),
    getWorstSoldMargins(undefined, 5, listLimit),
    getCustomerActivitySummary(),
    getCustomerRecurrenceSummary(),
    getCustomersWithDebt(listLimit),
    getCustomersNearCreditLimit(0.8, listLimit),
  ]);

  const snapshot: IntelligenceSnapshot = {
    computedAt: new Date().toISOString(),
    freshness,
    scopeNotes: {
      cashIsLocalOnly: true,
      quotesMayLag: includeQuotes,
      profitUsesCurrentCost: true,
      coverageIsEstimated: true,
      coverageNotForPurchaseQty: true,
    },
    salesToday,
    salesPeriod,
    salesComparison,
    profitToday,
    profitPeriod,
    inventory,
    stock: {
      low_stock,
      estimated_low_coverage,
      slow_moving,
      top_movement,
    },
    margin: {
      worst_catalog,
      worst_sold,
    },
    customers: {
      activity,
      recurrence,
      with_debt,
      near_limit,
    },
  };

  if (includeQuotes) {
    const [summary, pending] = await Promise.all([
      getQuotesSummary(),
      getQuotesPendingList(listLimit),
    ]);
    snapshot.quotes = { summary, pending };
  }

  if (includeCash) {
    const [open_session_id, recent_differences, summary] = await Promise.all([
      getOpenCashSessionIdOrNull(),
      getRecentCashDifferences(listLimit),
      getCashDifferenceSummary(),
    ]);
    snapshot.cash = { open_session_id, recent_differences, summary };
  }

  return snapshot;
}

export type {
  IntelligenceSnapshot,
  IntelligenceSnapshotOptions,
} from "./types";
