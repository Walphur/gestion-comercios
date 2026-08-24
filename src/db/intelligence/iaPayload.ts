import type { AlertEvaluationResult } from "./alertTypes";
import type { ActionEvaluationResult } from "./actionTypes";
import type { IntelligenceSnapshot } from "./types";

const MAX_NAMES = 5;

export interface IaPayloadOptions {
  showProfits?: boolean;
  featuresStock?: boolean;
  featuresCustomers?: boolean;
  currency?: string;
}

/** Payload compacto para IA — solo agregados y highlights, sin SQL ni listas completas. */
export interface IaPayload {
  computed_at: string;
  currency: string;
  scope_notes: IntelligenceSnapshot["scopeNotes"];
  freshness: IntelligenceSnapshot["freshness"];
  sales: {
    today: IntelligenceSnapshot["salesToday"];
    period_30d: IntelligenceSnapshot["salesPeriod"];
    comparison_30d_vs_prev: IntelligenceSnapshot["salesComparison"];
  };
  profit_estimated?: {
    today: IntelligenceSnapshot["profitToday"];
    period_30d: IntelligenceSnapshot["profitPeriod"];
  };
  inventory: IntelligenceSnapshot["inventory"];
  stock_highlights?: {
    low_stock: Array<{ name: string; stock: number; min_stock: number }>;
    low_coverage: Array<{ name: string; estimated_days_cover: number | null; units_sold_7d: number }>;
    slow_moving: Array<{ name: string; stock: number }>;
    top_movement: Array<{ name: string; units_sold: number }>;
  };
  customers?: {
    activity: IntelligenceSnapshot["customers"]["activity"];
    recurrence: IntelligenceSnapshot["customers"]["recurrence"];
    with_debt: Array<{ name: string; balance: number }>;
    near_credit_limit: Array<{ name: string; usage_pct: number | undefined }>;
  };
  quotes?: {
    summary: NonNullable<IntelligenceSnapshot["quotes"]>["summary"];
    pending_count: number;
  };
  cash_local?: {
    summary: NonNullable<IntelligenceSnapshot["cash"]>["summary"];
    recent_differences_count: number;
  };
  alerts_summary: {
    critical_count: number;
    warning_count: number;
    info_count: number;
    top: Array<{ severity: string; title: string; message: string }>;
  };
  actions_today: Array<{
    urgency: string;
    title: string;
    reason: string;
    category: string;
  }>;
  meta: {
    payload_version: 1;
    show_profits: boolean;
  };
}

function topNames<T extends { name: string }>(rows: T[], limit = MAX_NAMES): T[] {
  return rows.slice(0, limit);
}

/**
 * Arma payload sanitizado desde bundle local. La IA no debe recalcular — solo interpretar.
 */
export function buildIaPayload(
  snap: IntelligenceSnapshot,
  alerts: AlertEvaluationResult,
  actions: ActionEvaluationResult,
  options: IaPayloadOptions = {},
): IaPayload {
  const showProfits = options.showProfits !== false;
  const featuresStock = options.featuresStock !== false;
  const featuresCustomers = options.featuresCustomers !== false;

  const payload: IaPayload = {
    computed_at: snap.computedAt,
    currency: options.currency ?? "ARS",
    scope_notes: snap.scopeNotes,
    freshness: snap.freshness,
    sales: {
      today: snap.salesToday,
      period_30d: snap.salesPeriod,
      comparison_30d_vs_prev: snap.salesComparison,
    },
    inventory: snap.inventory,
    alerts_summary: {
      critical_count: alerts.critical_count,
      warning_count: alerts.warning_count,
      info_count: alerts.info_count,
      top: alerts.alerts.slice(0, 8).map((a) => ({
        severity: a.severity,
        title: a.title,
        message: a.message,
      })),
    },
    actions_today: actions.actions.map((a) => ({
      urgency: a.urgency,
      title: a.title,
      reason: a.reason,
      category: a.category,
    })),
    meta: {
      payload_version: 1 as const,
      show_profits: showProfits,
    },
  };

  if (showProfits) {
    payload.profit_estimated = {
      today: snap.profitToday,
      period_30d: snap.profitPeriod,
    };
  } else {
    delete (payload as Partial<IaPayload>).profit_estimated;
  }

  if (featuresStock) {
    payload.stock_highlights = {
      low_stock: topNames(snap.stock.low_stock).map((p) => ({
        name: p.name,
        stock: p.stock,
        min_stock: p.min_stock,
      })),
      low_coverage: topNames(snap.stock.estimated_low_coverage).map((p) => ({
        name: p.name,
        estimated_days_cover: p.estimated_days_cover ?? null,
        units_sold_7d: p.units_sold_7d,
      })),
      slow_moving: topNames(snap.stock.slow_moving).map((p) => ({
        name: p.name,
        stock: p.stock,
      })),
      top_movement: topNames(snap.stock.top_movement).map((p) => ({
        name: p.name,
        units_sold: p.units_sold,
      })),
    };
  }

  if (featuresCustomers) {
    payload.customers = {
      activity: snap.customers.activity,
      recurrence: snap.customers.recurrence,
      with_debt: topNames(snap.customers.with_debt).map((c) => ({
        name: c.name,
        balance: c.balance,
      })),
      near_credit_limit: topNames(snap.customers.near_limit).map((c) => ({
        name: c.name,
        usage_pct: c.usage_pct,
      })),
    };
  }

  if (snap.quotes) {
    payload.quotes = {
      summary: snap.quotes.summary,
      pending_count: snap.quotes.pending.length,
    };
  }

  if (snap.cash) {
    payload.cash_local = {
      summary: snap.cash.summary,
      recent_differences_count: snap.cash.recent_differences.length,
    };
  }

  return payload;
}
