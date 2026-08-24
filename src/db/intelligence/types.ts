export type CustomerSegment = "active" | "at_risk" | "inactive" | "never_purchased";

export interface LanFreshnessMeta {
  enabled: boolean;
  role: string;
  status: string;
  pendingEvents: number;
  lastSyncAt: string | null;
  conflictCount: number;
}

export interface SalesPeriodSummary {
  count: number;
  total: number;
  units_sold: number;
  avg_ticket: number;
}

export interface SalesComparison {
  current_total: number;
  current_count: number;
  current_units: number;
  current_avg_ticket: number;
  previous_total: number;
  previous_count: number;
  previous_units: number;
  previous_avg_ticket: number;
  revenue_change_pct: number;
  units_change_pct: number;
  ticket_change_pct: number;
}

export interface EstimatedProfitSummary {
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number;
  is_estimated: true;
  estimation_note: string;
}

export interface ProductRef {
  product_id: number;
  name: string;
  stock: number;
  min_stock: number;
  cost?: number;
  price?: number;
}

export interface EstimatedCoverageRow extends ProductRef {
  units_sold_7d: number;
  avg_daily_sales: number;
  estimated_days_cover: number | null;
}

export interface ProductMovementRow extends ProductRef {
  units_sold: number;
  period_days: 30;
}

export interface CatalogMarginRow {
  product_id: number;
  name: string;
  cost: number;
  price: number;
  margin_pct: number;
}

export interface SoldMarginRow {
  product_id: number;
  name: string;
  units_sold: number;
  revenue: number;
  cost: number;
  margin_pct: number;
}

export interface CustomerActivitySummary {
  active: number;
  at_risk: number;
  inactive: number;
  never_purchased: number;
  total: number;
}

export interface CustomerRecurrenceSummary {
  new_customers: number;
  returning_customers: number;
  repeat_in_period: number;
  period_days: 30;
}

export interface CustomerDebtRow {
  customer_id: number;
  name: string;
  balance: number;
  credit_limit: number;
  usage_pct?: number;
}

export interface QuotesSummary {
  pending: number;
  expiring_soon: number;
  stale_sent: number;
  pending_amount: number;
}

export interface QuotePendingRow {
  quote_id: number;
  quote_number: string;
  status: string;
  total: number;
  valid_until: string | null;
  updated_at: string;
  customer_id: number | null;
  customer_name: string | null;
}

export interface CashDifferenceSummary {
  closed_sessions: number;
  with_difference: number;
  net_difference: number;
}

export interface CashSessionRow {
  cash_session_id: number;
  closed_at: string;
  declared_cash: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
}

export interface IntelligenceScopeNotes {
  cashIsLocalOnly: true;
  quotesMayLag: boolean;
  profitUsesCurrentCost: true;
  coverageIsEstimated: true;
  coverageNotForPurchaseQty: true;
}

export interface IntelligenceSnapshot {
  computedAt: string;
  freshness: LanFreshnessMeta;
  scopeNotes: IntelligenceScopeNotes;
  salesToday: SalesPeriodSummary;
  salesPeriod: SalesPeriodSummary;
  salesComparison: SalesComparison;
  profitToday: EstimatedProfitSummary;
  profitPeriod: EstimatedProfitSummary;
  inventory: {
    total_products: number;
    stock_value: number;
    low_stock_count: number;
    expiring_count: number;
  };
  stock: {
    low_stock: ProductRef[];
    estimated_low_coverage: EstimatedCoverageRow[];
    slow_moving: ProductRef[];
    top_movement: ProductMovementRow[];
  };
  margin: {
    worst_catalog: CatalogMarginRow[];
    worst_sold: SoldMarginRow[];
  };
  customers: {
    activity: CustomerActivitySummary;
    recurrence: CustomerRecurrenceSummary;
    with_debt: CustomerDebtRow[];
    near_limit: CustomerDebtRow[];
  };
  quotes?: {
    summary: QuotesSummary;
    pending: QuotePendingRow[];
  };
  cash?: {
    open_session_id: number | null;
    recent_differences: CashSessionRow[];
    summary: CashDifferenceSummary;
  };
}

export interface IntelligenceSnapshotOptions {
  listLimit?: number;
  includeQuotes?: boolean;
  includeCash?: boolean;
  coverageThresholdDays?: number;
}
