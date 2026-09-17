/**
 * Unit tests Fase 4B — proyección Owner Portal de alertas BI.
 * Run: npx tsx scripts/run-portal-fase4b-tests.ts
 */
import assert from "node:assert/strict";
import { evaluateAlerts } from "../src/db/intelligence/alerts.ts";
import { ALERT_THRESHOLDS } from "../src/db/intelligence/constants.ts";
import { mockSnapshot } from "../src/db/intelligence/alerts.selftest.ts";
import {
  PORTAL_MAX_ALERTS,
  projectOwnerPortalAlerts,
} from "../src/lib/ownerPortalAlerts.ts";
import { shrinkPeriodMapsForBudget } from "../src/lib/ownerPortalSnapshotMaps.ts";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("PASS", name);
  } catch (e) {
    failed += 1;
    console.error("FAIL", name, e instanceof Error ? e.message : e);
  }
}

const baseSnap = mockSnapshot({
  stock: {
    low_stock: [
      { product_id: 1, name: "Sin Stock", stock: 0, min_stock: 5, cost: 10, price: 20 },
      { product_id: 2, name: "Bajo Min", stock: 2, min_stock: 5, cost: 10, price: 20 },
    ],
    estimated_low_coverage: [
      {
        product_id: 3,
        name: "Cobertura Baja",
        stock: 4,
        min_stock: 2,
        units_sold_7d: 14,
        avg_daily_sales: 2,
        estimated_days_cover: 2,
      },
    ],
    slow_moving: [],
    top_movement: [],
  },
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
});

const evaluated = evaluateAlerts(baseSnap, {
  showProfits: false,
  featuresStock: true,
  featuresCustomers: false,
});

check("1. stock critical → alert pública", () => {
  const { alerts } = projectOwnerPortalAlerts(evaluated, baseSnap);
  const a = alerts.find((x) => x.id === "stock-critical-1");
  assert.ok(a);
  assert.equal(a.type, "stock_critical");
  assert.equal(a.severity, "critical");
  assert.equal(a.metric, "stock");
  assert.equal(a.value, 0);
  assert.equal(a.threshold, 5);
});

check("2. stock warning → alert pública", () => {
  const { alerts } = projectOwnerPortalAlerts(evaluated, baseSnap);
  const a = alerts.find((x) => x.id === "stock-critical-2");
  assert.ok(a);
  assert.equal(a.type, "stock_critical");
  assert.equal(a.severity, "warning");
  assert.equal(a.value, 2);
  assert.equal(a.threshold, 5);
});

check("3. coverage → alert pública", () => {
  const { alerts } = projectOwnerPortalAlerts(evaluated, baseSnap);
  const a = alerts.find((x) => x.id === "coverage-3");
  assert.ok(a);
  assert.equal(a.type, "stock_low_coverage");
  assert.equal(a.metric, "estimated_days_cover");
  assert.equal(a.value, 2);
  assert.equal(a.threshold, ALERT_THRESHOLDS.coverageCriticalDays);
  assert.equal(a.severity, "critical");
});

check("4. sales drop → alert pública", () => {
  const { alerts } = projectOwnerPortalAlerts(evaluated, baseSnap);
  const a = alerts.find((x) => x.id === "sales-drop");
  assert.ok(a);
  assert.equal(a.type, "sales_drop");
  assert.equal(a.severity, "critical");
  assert.equal(a.metric, "revenue_change_pct");
  assert.equal(a.value, -20);
  assert.equal(a.threshold, ALERT_THRESHOLDS.salesDropPct);
});

check("5. severity preservada", () => {
  const { alerts } = projectOwnerPortalAlerts(evaluated, baseSnap);
  for (const pub of alerts) {
    const src = evaluated.alerts.find((x) => x.id === pub.id);
    assert.ok(src);
    assert.equal(pub.severity, src.severity);
  }
});

check("6. ID estable preservado", () => {
  const { alerts } = projectOwnerPortalAlerts(evaluated, baseSnap);
  assert.ok(alerts.some((a) => a.id === "sales-drop"));
  assert.ok(alerts.some((a) => a.id === "stock-critical-1"));
  assert.ok(alerts.some((a) => a.id === "coverage-3"));
});

check("7. datos sensibles excluidos", () => {
  const { alerts } = projectOwnerPortalAlerts(evaluated, baseSnap);
  for (const a of alerts) {
    const keys = Object.keys(a).sort();
    assert.deepEqual(keys, [
      "id",
      "message",
      "metric",
      "severity",
      "threshold",
      "title",
      "type",
      "value",
    ]);
    assert.equal("link" in a, false);
    assert.equal("entity_id" in a, false);
    assert.equal("entity_type" in a, false);
    assert.equal("priority" in a, false);
    assert.ok(!JSON.stringify(a).includes("/productos/"));
    assert.ok(!JSON.stringify(a).includes("machine_id"));
    assert.ok(!JSON.stringify(a).includes("license"));
  }
});

check("8. alertas >20 → truncado", () => {
  const manyLow = Array.from({ length: 30 }, (_, i) => ({
    product_id: 100 + i,
    name: `P${i}`,
    stock: 0,
    min_stock: 3,
  }));
  const snap = mockSnapshot({
    stock: {
      low_stock: manyLow,
      estimated_low_coverage: [],
      slow_moving: [],
      top_movement: [],
    },
    salesComparison: {
      ...baseSnap.salesComparison,
      previous_total: 0,
      revenue_change_pct: 0,
    },
  });
  const ev = evaluateAlerts(snap, {
    showProfits: false,
    featuresStock: true,
    featuresCustomers: false,
  });
  // evaluateAlerts caps per-item at maxPerItemAlerts (8); force more via projection input
  const padded = {
    ...ev,
    alerts: [
      ...ev.alerts,
      ...Array.from({ length: 25 }, (_, i) => ({
        id: `stock-critical-${200 + i}`,
        type: "stock_critical" as const,
        severity: "critical" as const,
        title: "Sin stock",
        message: `Extra ${i}`,
        entity_type: "product" as const,
        entity_id: 200 + i,
        link: `/productos/${200 + i}`,
        priority: 900,
      })),
    ],
  };
  const { alerts } = projectOwnerPortalAlerts(padded, snap, PORTAL_MAX_ALERTS);
  assert.equal(alerts.length, PORTAL_MAX_ALERTS);
  assert.ok(alerts.length <= 20);
});

check("9. snapshot F3 sigue intacto (shrink preserva campos)", () => {
  const snap = {
    sales_today_total: 1,
    sales_today_count: 1,
    sales_yesterday_total: 0,
    sales_yesterday_count: 0,
    sales_by_register: [],
    sales_by_employee: [],
    sales_last_7_days: [],
    sales_last_30_days: [],
    sales_month_to_date: [],
    period_compare_7d: { current_total: 1, current_count: 1, previous_total: 0, previous_count: 0 },
    period_compare_30d: { current_total: 1, current_count: 1, previous_total: 0, previous_count: 0 },
    stock_summary: { products_total: 1, critical_count: 0, low_count: 0 },
    low_stock: [],
    sales_by_payment: { today: [{ method: "efectivo", count: 1, total: 10 }], "7d": [], "30d": [], mtd: [] },
    top_products: { today: [{ name: "A", qty: 1, total: 10 }], "7d": [], "30d": [], mtd: [] },
    sales_by_register_by_period: { today: [], "7d": [], "30d": [], mtd: [] },
    sales_by_employee_by_period: { today: [], "7d": [], "30d": [], mtd: [] },
    recent_sales: [],
    alerts: projectOwnerPortalAlerts(evaluated, baseSnap).alerts,
    alerts_summary: projectOwnerPortalAlerts(evaluated, baseSnap).alerts_summary,
    pushed_at: "2026-01-01T00:00:00.000Z",
    device_name: "PC",
  };
  const out = shrinkPeriodMapsForBudget(snap, 160_000);
  for (const k of [
    "sales_today_total",
    "sales_today_count",
    "sales_yesterday_total",
    "sales_yesterday_count",
    "sales_by_register",
    "sales_by_employee",
    "sales_last_7_days",
    "sales_last_30_days",
    "sales_month_to_date",
    "period_compare_7d",
    "period_compare_30d",
    "stock_summary",
    "low_stock",
    "sales_by_payment",
    "top_products",
    "sales_by_register_by_period",
    "sales_by_employee_by_period",
    "recent_sales",
    "alerts",
    "alerts_summary",
    "pushed_at",
    "device_name",
  ]) {
    assert.ok(k in out, `falta ${k}`);
  }
  assert.ok(Array.isArray(out.alerts));
  assert.ok(out.sales_by_payment.today.length >= 1);
});

check("10. payload vacío → alerts=[]", () => {
  const empty = projectOwnerPortalAlerts(
    { alerts: [], critical_count: 0, warning_count: 0, info_count: 0 },
    null,
  );
  assert.deepEqual(empty.alerts, []);
  assert.deepEqual(empty.alerts_summary, {
    critical_count: 0,
    warning_count: 0,
    info_count: 0,
  });
  const nil = projectOwnerPortalAlerts(null, null);
  assert.deepEqual(nil.alerts, []);
});

check("11. alerta desconocida → no se expone", () => {
  const { alerts } = projectOwnerPortalAlerts(evaluated, baseSnap);
  assert.ok(!alerts.some((a) => a.type === ("units_drop" as string)));
  assert.ok(!alerts.some((a) => a.type === ("margin_low" as string)));
  assert.ok(!alerts.some((a) => a.type === ("sync_conflict" as string)));
  assert.ok(!alerts.some((a) => a.id === "units-drop"));
  // evaluateAlerts sí genera units_drop; proyección lo filtra
  assert.ok(evaluated.alerts.some((a) => a.type === "units_drop"));
});

check("12. no se recalculan thresholds", () => {
  const { alerts } = projectOwnerPortalAlerts(evaluated, baseSnap);
  const drop = alerts.find((a) => a.type === "sales_drop");
  assert.ok(drop);
  assert.equal(drop.threshold, ALERT_THRESHOLDS.salesDropPct);
  assert.equal(ALERT_THRESHOLDS.salesDropPct, -15);
  const cov = alerts.find((a) => a.type === "stock_low_coverage");
  assert.ok(cov);
  assert.equal(cov.threshold, ALERT_THRESHOLDS.coverageCriticalDays);
  assert.equal(ALERT_THRESHOLDS.coverageCriticalDays, 3);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll Fase 4B portal alert projection tests passed.");
