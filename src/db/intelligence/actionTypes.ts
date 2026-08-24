import type { BusinessAlertEntityType } from "./alertTypes";

export type BusinessActionUrgency = "now" | "today" | "this_week";

export type BusinessActionKind =
  | "resolve_sync"
  | "replenish_stock"
  | "review_coverage"
  | "review_expiring"
  | "promote_slow_moving"
  | "analyze_sales"
  | "analyze_units"
  | "review_margin"
  | "contact_customers"
  | "collect_debt"
  | "review_credit"
  | "follow_quote"
  | "review_cash"
  | "routine_check";

export type BusinessActionCategory =
  | "sync"
  | "stock"
  | "sales"
  | "margin"
  | "customers"
  | "quotes"
  | "cash"
  | "general";

export interface BusinessAction {
  id: string;
  kind: BusinessActionKind;
  category: BusinessActionCategory;
  urgency: BusinessActionUrgency;
  /** Imperativo — qué hacer. */
  title: string;
  reason: string;
  link: string;
  link_label: string;
  entity_type?: BusinessAlertEntityType;
  entity_id?: number;
  source_alert_ids: string[];
  /** Mayor = más prioritario. */
  priority: number;
}

export interface ActionEvaluationContext {
  showProfits?: boolean;
  featuresStock?: boolean;
  featuresCustomers?: boolean;
}

export interface ActionEvaluationResult {
  actions: BusinessAction[];
  total_candidates: number;
  now_count: number;
  today_count: number;
}
