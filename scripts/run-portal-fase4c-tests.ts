/**
 * Unit tests Fase 4C — Worker sanitize alerts / alerts_summary.
 * Run: npx tsx scripts/run-portal-fase4c-tests.ts
 */
import assert from "node:assert/strict";
import {
  sanitizePayload,
  sanitizePortalAlerts,
  sanitizePortalAlertsSummary,
  summarizePortalAlerts,
  PORTAL_MAX_ALERTS,
  PORTAL_MAX_PUSH_BYTES,
} from "../workers/license-api/src/portal.ts";

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

const sampleAlerts = [
  {
    id: "stock-critical-1",
    type: "stock_critical",
    severity: "critical",
    title: "Sin stock",
    message: "Producto A: 0 u. (mín. 5).",
    metric: "stock",
    value: 0,
    threshold: 5,
  },
  {
    id: "coverage-3",
    type: "stock_low_coverage",
    severity: "critical",
    title: "Cobertura estimada muy baja",
    message: "Producto B: ~2.0 días de cobertura (14 u/7d).",
    metric: "estimated_days_cover",
    value: 2,
    threshold: 3,
  },
  {
    id: "sales-drop",
    type: "sales_drop",
    severity: "critical",
    title: "Caída de ventas",
    message: "Facturación 30d -20.0% vs período anterior (800 vs 1000).",
    metric: "revenue_change_pct",
    value: -20,
    threshold: -15,
  },
];

const f2Base = {
  business_name: "Test F2",
  sales_today_total: 100,
  sales_today_count: 2,
  sales_yesterday_total: 50,
  sales_yesterday_count: 1,
  products_total: 10,
  low_stock_count: 0,
  sales_by_register: [{ device_code: "A", device_name: "Caja", count: 1, total: 100 }],
  sales_by_employee: [{ name: "Ana", count: 1, total: 100 }],
  sales_last_7_days: [{ day: "2026-03-01", count: 1, total: 10 }],
  sales_last_30_days: [{ day: "2026-03-01", count: 1, total: 10 }],
  sales_month_to_date: [{ day: "2026-03-01", count: 1, total: 10 }],
  period_compare_7d: {
    current_total: 10,
    current_count: 1,
    previous_total: 5,
    previous_count: 1,
  },
  period_compare_30d: {
    current_total: 0,
    current_count: 0,
    previous_total: 0,
    previous_count: 0,
  },
  top_products_today: [{ name: "X", qty: 2 }],
  recent_sales: [{ at: "2026-03-01T12:00:00Z", total: 10, device: "PC" }],
  low_stock: [{ name: "Z", stock: -1, min_stock: 0 }],
  stock_summary: { products_total: 10, critical_count: 1, low_count: 0 },
  pushed_at: "2026-03-16T12:00:00.000Z",
  device_name: "PC",
};

const f3Base = {
  ...f2Base,
  business_name: "Los tanos",
  sales_by_payment: {
    today: [],
    "7d": [],
    "30d": [
      { method: "efectivo", count: 6, total: 350891 },
      { method: "débito", count: 1, total: 8000 },
    ],
    mtd: [],
  },
  top_products: {
    today: [],
    "7d": [],
    "30d": [{ name: "Prod", qty: 2, total: 132213 }],
    mtd: [],
  },
  sales_by_register_by_period: {
    today: [],
    "7d": [],
    "30d": [
      {
        device_code: "PCAADF",
        device_name: "Servidor",
        name: "Servidor",
        count: 3,
        total: 201213,
      },
    ],
    mtd: [],
  },
  sales_by_employee_by_period: {
    today: [],
    "7d": [],
    "30d": [{ name: "Juan", count: 2, total: 131213 }],
    mtd: [],
  },
};

check("1. alerts válido", () => {
  const s = sanitizePayload({ ...f3Base, alerts: sampleAlerts })!;
  assert.ok(s.alerts);
  assert.equal(s.alerts!.length, 3);
  assert.equal(s.alerts![0].id, "stock-critical-1");
  assert.equal(s.alerts![1].type, "stock_low_coverage");
  assert.equal(s.alerts![2].metric, "revenue_change_pct");
});

check("2. alerts vacío", () => {
  const s = sanitizePayload({ ...f3Base, alerts: [] })!;
  assert.ok(Array.isArray(s.alerts));
  assert.equal(s.alerts!.length, 0);
  assert.deepEqual(s.alerts_summary, {
    critical_count: 0,
    warning_count: 0,
    info_count: 0,
  });
});

check("3. alerts ausente", () => {
  const s = sanitizePayload(f3Base)!;
  assert.equal(s.alerts, undefined);
  assert.equal(s.alerts_summary, undefined);
});

check("4. severity inválida → ítem descartado", () => {
  const s = sanitizePayload({
    ...f3Base,
    alerts: [{ ...sampleAlerts[0], severity: "ultra" }, sampleAlerts[2]],
  })!;
  assert.equal(s.alerts!.length, 1);
  assert.equal(s.alerts![0].id, "sales-drop");
});

check("5. alert sin id → descartada", () => {
  const bad = { ...sampleAlerts[0], id: "" };
  const s = sanitizePayload({ ...f3Base, alerts: [bad, sampleAlerts[2]] })!;
  assert.equal(s.alerts!.length, 1);
  assert.equal(s.alerts![0].id, "sales-drop");
});

check("6. alert sin type → descartada", () => {
  const bad = { ...sampleAlerts[0], type: "" };
  assert.equal(sanitizePortalAlerts([bad])!.length, 0);
});

check("7. alert sin title → descartada", () => {
  const bad = { ...sampleAlerts[0], title: "" };
  assert.equal(sanitizePortalAlerts([bad])!.length, 0);
});

check("8. value no numérico → descartada", () => {
  const bad = { ...sampleAlerts[0], value: "0" as unknown as number };
  assert.equal(sanitizePortalAlerts([bad])!.length, 0);
});

check("9. threshold no numérico → descartada", () => {
  const bad = { ...sampleAlerts[0], threshold: null as unknown as number };
  assert.equal(sanitizePortalAlerts([bad])!.length, 0);
});

check("10. alerts >20 → truncado", () => {
  const many = Array.from({ length: 35 }, (_, i) => ({
    ...sampleAlerts[0],
    id: `stock-critical-${i}`,
  }));
  const s = sanitizePayload({ ...f3Base, alerts: many })!;
  assert.equal(s.alerts!.length, PORTAL_MAX_ALERTS);
  assert.equal(s.alerts_summary!.critical_count, PORTAL_MAX_ALERTS);
});

check("11. alerts_summary válido (derivado de lista)", () => {
  const s = sanitizePayload({
    ...f3Base,
    alerts: sampleAlerts,
    alerts_summary: { critical_count: 3, warning_count: 0, info_count: 0 },
  })!;
  assert.deepEqual(s.alerts_summary, {
    critical_count: 3,
    warning_count: 0,
    info_count: 0,
  });
  assert.deepEqual(s.alerts_summary, summarizePortalAlerts(s.alerts!));
});

check("12. alerts_summary inválido (cliente) no rompe sanitize", () => {
  assert.equal(sanitizePortalAlertsSummary({ critical_count: -1, warning_count: 0, info_count: 0 }), null);
  assert.equal(sanitizePortalAlertsSummary({ critical_count: 1.5, warning_count: 0, info_count: 0 }), null);
  assert.equal(sanitizePortalAlertsSummary("x"), null);
  // Persistido siempre se deriva de alerts sanitizadas
  const s = sanitizePayload({
    ...f3Base,
    alerts: sampleAlerts,
    alerts_summary: { critical_count: 999, warning_count: -5, info_count: "x" },
  })!;
  assert.deepEqual(s.alerts_summary, {
    critical_count: 3,
    warning_count: 0,
    info_count: 0,
  });
});

check("13. campos extra sensibles descartados", () => {
  const dirty = {
    ...sampleAlerts[0],
    machine_id: "MACHINE-SECRET",
    license_id: "LIC-SECRET",
    token: "tok_abc",
    link: "/productos/1",
    entity_id: 99,
    stack: "Error: boom",
  };
  const s = sanitizePayload({ ...f3Base, alerts: [dirty] })!;
  const a = s.alerts![0];
  const json = JSON.stringify(a);
  assert.equal(Object.keys(a).sort().join(","), "id,message,metric,severity,threshold,title,type,value");
  assert.ok(!json.includes("MACHINE"));
  assert.ok(!json.includes("LIC-SECRET"));
  assert.ok(!json.includes("tok_"));
  assert.ok(!json.includes("/productos"));
  assert.ok(!json.includes("entity_id"));
  assert.ok(!("machine_id" in a));
  assert.ok(!("license_id" in a));
});

check("14. payload >160KB rechazado en capa push (constante)", () => {
  assert.equal(PORTAL_MAX_PUSH_BYTES, 160_000);
  const pad = "x".repeat(PORTAL_MAX_PUSH_BYTES + 1);
  assert.ok(pad.length > PORTAL_MAX_PUSH_BYTES);
  // sanitize sigue aceptando snapshot bajo el límite con alerts
  const under = sanitizePayload({ ...f3Base, alerts: sampleAlerts })!;
  const size = new TextEncoder().encode(JSON.stringify(under)).length;
  assert.ok(size <= PORTAL_MAX_PUSH_BYTES);
});

check("15. snapshot F2 sin alerts", () => {
  const s = sanitizePayload(f2Base)!;
  assert.ok(s);
  assert.equal(s.alerts, undefined);
  assert.equal(s.sales_today_total, 100);
  assert.equal(s.sales_by_payment, undefined);
});

check("16. snapshot F3 sin alerts", () => {
  const s = sanitizePayload(f3Base)!;
  assert.equal(s.alerts, undefined);
  assert.equal(s.sales_by_payment!["30d"]![0].method, "efectivo");
  assert.equal(s.top_products!["30d"]![0].total, 132213);
});

check("17. snapshot F3 + alerts", () => {
  const s = sanitizePayload({
    ...f3Base,
    alerts: sampleAlerts,
    alerts_summary: { critical_count: 3, warning_count: 0, info_count: 0 },
  })!;
  assert.equal(s.alerts!.length, 3);
  assert.equal(s.sales_by_payment!["30d"]!.length, 2);
  assert.equal(s.sales_by_register_by_period!["30d"]![0].name, "Servidor");
  assert.equal(s.sales_by_employee_by_period!["30d"]![0].name, "Juan");
});

check("18. no modificación de campos F3", () => {
  const s = sanitizePayload({ ...f3Base, alerts: sampleAlerts })!;
  assert.equal(s.period_compare_7d!.current_total, 10);
  assert.equal(s.period_compare_30d!.previous_total, 0);
  assert.equal(s.sales_last_30_days!.length, 1);
  assert.equal(s.sales_month_to_date!.length, 1);
  assert.equal(s.stock_summary!.critical_count, 1);
  assert.equal(s.top_products!["30d"]![0].qty, 2);
  assert.equal(s.sales_by_payment!["30d"]![1].method, "débito");
});

check("19. E2E simulado POST→D1→GET (roundtrip sanitize)", () => {
  const pushed = sanitizePayload({
    ...f3Base,
    alerts: sampleAlerts,
    alerts_summary: { critical_count: 3, warning_count: 0, info_count: 0 },
    machine_id: "should-not-persist",
    license_id: "should-not-persist",
  })!;
  const d1Json = JSON.stringify(pushed);
  assert.ok(!d1Json.includes("should-not-persist"));
  const stored = JSON.parse(d1Json);
  const got = sanitizePayload(stored)!;
  assert.equal(got.alerts!.length, 3);
  assert.deepEqual(got.alerts_summary, {
    critical_count: 3,
    warning_count: 0,
    info_count: 0,
  });
  assert.equal(got.alerts![0].id, "stock-critical-1");
  assert.equal(got.alerts![1].id, "coverage-3");
  assert.equal(got.alerts![2].id, "sales-drop");
  assert.equal(got.sales_by_payment!["30d"]![0].total, 350891);
});

check("20. multi-tenant: alerts no inyectan license/machine", () => {
  const s = sanitizePayload({
    ...f3Base,
    alerts: [
      {
        ...sampleAlerts[0],
        license_id: "tenant-B",
        machine_id: "pc-B",
      },
    ],
  })!;
  const blob = JSON.stringify(s);
  assert.ok(!blob.includes("tenant-B"));
  assert.ok(!blob.includes("pc-B"));
  assert.ok(!("license_id" in (s as Record<string, unknown>)));
  assert.ok(!("machine_id" in (s as Record<string, unknown>)));
});

check("21. tipo desconocido (units_drop) no se expone", () => {
  const s = sanitizePayload({
    ...f3Base,
    alerts: [
      {
        id: "units-drop",
        type: "units_drop",
        severity: "warning",
        title: "Caída unidades",
        message: "x",
        metric: "units_change_pct",
        value: -20,
        threshold: -15,
      },
      sampleAlerts[0],
    ],
  })!;
  assert.equal(s.alerts!.length, 1);
  assert.equal(s.alerts![0].id, "stock-critical-1");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll Fase 4C portal Worker sanitize tests passed.");
