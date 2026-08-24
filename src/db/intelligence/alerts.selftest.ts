import { evaluateAlerts } from "./alerts";
import type { IntelligenceSnapshot } from "./types";

/** Snapshot mínimo para tests de reglas de alerta. */
export function mockSnapshot(overrides: Partial<IntelligenceSnapshot> = {}): IntelligenceSnapshot {
  const base: IntelligenceSnapshot = {
    computedAt: new Date().toISOString(),
    freshness: {
      enabled: false,
      role: "off",
      status: "disconnected",
      pendingEvents: 0,
      lastSyncAt: null,
      conflictCount: 0,
    },
    scopeNotes: {
      cashIsLocalOnly: true,
      quotesMayLag: false,
      profitUsesCurrentCost: true,
      coverageIsEstimated: true,
      coverageNotForPurchaseQty: true,
    },
    salesToday: { count: 0, total: 0, units_sold: 0, avg_ticket: 0 },
    salesPeriod: { count: 0, total: 0, units_sold: 0, avg_ticket: 0 },
    salesComparison: {
      current_total: 800,
      current_count: 10,
      current_units: 50,
      current_avg_ticket: 80,
      previous_total: 1000,
      previous_count: 12,
      previous_units: 80,
      previous_avg_ticket: 83.33,
      revenue_change_pct: -20,
      units_change_pct: -37.5,
      ticket_change_pct: -4,
    },
    profitToday: {
      revenue: 0,
      cost: 0,
      profit: 0,
      margin_pct: 0,
      is_estimated: true,
      estimation_note: "test",
    },
    profitPeriod: {
      revenue: 800,
      cost: 600,
      profit: 200,
      margin_pct: 25,
      is_estimated: true,
      estimation_note: "test",
    },
    inventory: {
      total_products: 10,
      stock_value: 1000,
      low_stock_count: 1,
      expiring_count: 0,
    },
    stock: {
      low_stock: [
        {
          product_id: 1,
          name: "Producto Test",
          stock: 0,
          min_stock: 5,
          cost: 100,
          price: 200,
        },
      ],
      estimated_low_coverage: [],
      slow_moving: [],
      top_movement: [],
    },
    margin: { worst_catalog: [], worst_sold: [] },
    customers: {
      activity: { active: 1, at_risk: 2, inactive: 0, never_purchased: 0, total: 3 },
      recurrence: { new_customers: 1, returning_customers: 1, repeat_in_period: 0, period_days: 30 },
      with_debt: [],
      near_limit: [],
    },
  };
  return { ...base, ...overrides, stock: { ...base.stock, ...overrides.stock } };
}

/** Ejecutable desde E2E: valida reglas sin SQLite. */
export function selfTestAlertRules(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const snap = mockSnapshot();
  const result = evaluateAlerts(snap, { showProfits: true, featuresStock: true, featuresCustomers: true });

  if (!result.alerts.some((a) => a.type === "sales_drop")) {
    errors.push("falta sales_drop");
  }
  if (!result.alerts.some((a) => a.type === "units_drop")) {
    errors.push("falta units_drop");
  }
  if (!result.alerts.some((a) => a.type === "stock_critical")) {
    errors.push("falta stock_critical");
  }
  if (!result.alerts.some((a) => a.type === "customer_at_risk")) {
    errors.push("falta customer_at_risk");
  }
  if (result.critical_count < 1) {
    errors.push("critical_count esperado >= 1");
  }

  return { ok: errors.length === 0, errors };
}
