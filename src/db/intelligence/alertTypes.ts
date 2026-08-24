export type BusinessAlertSeverity = "critical" | "warning" | "info";

export type BusinessAlertType =
  | "stock_critical"
  | "stock_low_coverage"
  | "stock_no_movement"
  | "sales_drop"
  | "units_drop"
  | "margin_low"
  | "margin_deteriorated"
  | "customer_at_risk"
  | "customer_credit_limit"
  | "customer_debt"
  | "quote_expiring"
  | "quote_stale"
  | "cash_difference"
  | "products_expiring"
  | "sync_pending"
  | "sync_conflict";

export type BusinessAlertEntityType =
  | "product"
  | "customer"
  | "quote"
  | "cash"
  | "sales"
  | "sync"
  | "inventory";

export interface BusinessAlert {
  id: string;
  type: BusinessAlertType;
  severity: BusinessAlertSeverity;
  title: string;
  message: string;
  entity_type: BusinessAlertEntityType;
  entity_id?: number;
  link: string;
  /** Mayor = más urgente dentro del mismo severity. */
  priority: number;
}

export interface AlertEvaluationContext {
  showProfits?: boolean;
  featuresStock?: boolean;
  featuresCustomers?: boolean;
}

export interface AlertEvaluationResult {
  alerts: BusinessAlert[];
  critical_count: number;
  warning_count: number;
  info_count: number;
}
