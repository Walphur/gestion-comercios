import { evaluateAlerts } from "./alerts";
import { mockSnapshot } from "./alerts.selftest";
import { buildActions } from "./actions";

/** Ejecutable desde E2E: valida motor de acciones sin SQLite. */
export function selfTestActionRules(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const snap = mockSnapshot();
  const alerts = evaluateAlerts(snap, {
    showProfits: true,
    featuresStock: true,
    featuresCustomers: true,
  });
  const result = buildActions(snap, alerts, {
    showProfits: true,
    featuresStock: true,
    featuresCustomers: true,
  });

  if (result.actions.length === 0) {
    errors.push("sin acciones");
  }
  if (!result.actions.some((a) => a.kind === "replenish_stock")) {
    errors.push("falta replenish_stock");
  }
  if (!result.actions.some((a) => a.kind === "analyze_sales")) {
    errors.push("falta analyze_sales");
  }
  if (!result.actions.some((a) => a.kind === "contact_customers")) {
    errors.push("falta contact_customers");
  }
  if (result.now_count < 1) {
    errors.push("now_count esperado >= 1");
  }
  for (const a of result.actions) {
    if (!a.title || !a.link || !a.link_label) {
      errors.push(`acción incompleta: ${a.id}`);
    }
  }

  const emptySnap = mockSnapshot({
    salesComparison: {
      ...snap.salesComparison,
      revenue_change_pct: 5,
      units_change_pct: 3,
      previous_total: 1000,
      previous_units: 80,
    },
    stock: { low_stock: [], estimated_low_coverage: [], slow_moving: [], top_movement: [] },
    customers: {
      activity: { active: 3, at_risk: 0, inactive: 0, never_purchased: 0, total: 3 },
      recurrence: snap.customers.recurrence,
      with_debt: [],
      near_limit: [],
    },
    inventory: { ...snap.inventory, low_stock_count: 0 },
  });
  const emptyAlerts = evaluateAlerts(emptySnap, {
    showProfits: true,
    featuresStock: true,
    featuresCustomers: true,
  });
  const routine = buildActions(emptySnap, emptyAlerts, {
    showProfits: true,
    featuresStock: true,
    featuresCustomers: true,
  });
  if (!routine.actions.some((a) => a.kind === "routine_check")) {
    errors.push("falta routine_check sin alertas");
  }

  return { ok: errors.length === 0, errors };
}
