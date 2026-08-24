export interface IaPayloadLike {
  profit_estimated?: { period_30d?: { is_estimated?: boolean } };
  scope_notes?: { coverageIsEstimated?: boolean; profitUsesCurrentCost?: boolean };
  actions_today: unknown[];
  stock_highlights?: {
    low_stock?: { name: string }[];
    low_coverage?: { name: string }[];
    slow_moving?: { name: string }[];
    top_movement?: { name: string }[];
  };
  customers?: {
    with_debt?: { name: string }[];
    near_credit_limit?: { name: string }[];
  };
  alerts_summary?: { top?: { title: string; message: string }[] };
}
