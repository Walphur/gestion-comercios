/**
 * Unit tests Fase 3 — Owner Portal maps, deltas, sanitize, F2 compat.
 * Run: npx tsx scripts/run-portal-fase3-tests.ts
 */
import assert from "node:assert/strict";
import {
  mapPaymentRows,
  mapTopProductRows,
  mapRegisterPeriodRows,
  mapEmployeePeriodRows,
  paymentLabelWithFallback,
  periodCompareDelta,
  shrinkPeriodMapsForBudget,
  PORTAL_MAX_PAYMENTS,
  PORTAL_MAX_TOP_PRODUCTS,
  PORTAL_MAX_REGISTERS,
  PORTAL_MAX_EMPLOYEES,
} from "../src/lib/ownerPortalSnapshotMaps.ts";
import { sanitizePayload } from "../workers/license-api/src/portal.ts";

const LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  debito: "Débito",
  tarjeta: "Tarjeta",
};

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

check("1. payment aggregation mapping", () => {
  const rows = mapPaymentRows([
    { payment_method: "efectivo", count: 6, total: 350891 },
    { payment_method: "débito", count: 1, total: 8000 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].method, "efectivo");
  assert.equal(rows[1].method, "débito");
  assert.equal(rows[0].count, 6);
  assert.equal(rows[0].total, 350891);
  assert.notEqual(rows[1].method.toLowerCase(), "tarjeta");
});

check("2. payment fallback label", () => {
  assert.equal(paymentLabelWithFallback("efectivo", LABELS), "Efectivo");
  assert.equal(paymentLabelWithFallback("débito", LABELS), "Débito");
  assert.equal(paymentLabelWithFallback("debito", LABELS), "Débito");
  assert.equal(paymentLabelWithFallback("algo_raro", LABELS), "algo_raro");
  assert.equal(paymentLabelWithFallback("tarjeta", LABELS), "Tarjeta");
});

check("3. top product payload", () => {
  const rows = mapTopProductRows([
    { name: "Prod A", qty: 12, total: 45000 },
    { name: "Prod B", qty: 3, total: 9000 },
  ]);
  assert.equal(rows[0].name, "Prod A");
  assert.equal(rows[0].qty, 12);
  assert.equal(rows[0].total, 45000);
});

check("4. register period mapping", () => {
  const rows = mapRegisterPeriodRows([
    { device_code: "ABC", device_name: "Caja 1", count: 4, total: 1000 },
    { device_code: "XYZ", device_name: null, count: 1, total: 50 },
  ]);
  assert.equal(rows[0].name, "Caja 1");
  assert.equal(rows[1].name, "XYZ");
  assert.equal(rows[0].count, 4);
  assert.equal(rows[0].total, 1000);
});

check("5. employee period mapping", () => {
  const rows = mapEmployeePeriodRows([
    { display_name: "Ana", count: 2, total: 500 },
    { name: "Juan", count: 1, total: 100 },
  ]);
  assert.equal(rows[0].name, "Ana");
  assert.equal(rows[1].name, "Juan");
});

check("6. delta absoluto", () => {
  const d = periodCompareDelta({ current_total: 125000, previous_total: 100000 });
  assert.equal(d.delta_abs, 25000);
});

check("7. porcentaje cuando previous > 0", () => {
  const d = periodCompareDelta({ current_total: 112400, previous_total: 100000 });
  assert.ok(d.change_pct != null);
  assert.ok(Math.abs((d.change_pct as number) - 12.4) < 0.01);
});

check("8. porcentaje ausente cuando previous = 0", () => {
  const d = periodCompareDelta({ current_total: 5000, previous_total: 0 });
  assert.equal(d.delta_abs, 5000);
  assert.equal(d.change_pct, null);
});

check("9. límites de payload", () => {
  const manyPay = Array.from({ length: 30 }, (_, i) => ({
    payment_method: "m" + i,
    count: 1,
    total: i,
  }));
  assert.equal(mapPaymentRows(manyPay).length, PORTAL_MAX_PAYMENTS);
  assert.equal(
    mapTopProductRows(
      manyPay.map((p) => ({ name: p.payment_method, qty: 1, total: 1 })),
    ).length,
    PORTAL_MAX_TOP_PRODUCTS,
  );
  assert.equal(
    mapRegisterPeriodRows(
      manyPay.map((_, i) => ({ device_code: "D" + i, count: 1, total: 1 })),
    ).length,
    PORTAL_MAX_REGISTERS,
  );
  assert.equal(
    mapEmployeePeriodRows(
      manyPay.map((_, i) => ({ name: "E" + i, count: 1, total: 1 })),
    ).length,
    PORTAL_MAX_EMPLOYEES,
  );

  const bloated = {
    sales_by_payment: {
      today: mapPaymentRows(manyPay),
      "7d": mapPaymentRows(manyPay),
      "30d": mapPaymentRows(manyPay),
      mtd: mapPaymentRows(manyPay),
    },
    top_products: {
      today: mapTopProductRows(
        manyPay.map((p) => ({ name: p.payment_method, qty: 1, total: 1 })),
      ),
      "7d": [],
      "30d": [],
      mtd: [],
    },
    sales_by_register_by_period: { today: [], "7d": [], "30d": [], mtd: [] },
    sales_by_employee_by_period: { today: [], "7d": [], "30d": [], mtd: [] },
    pad: "x".repeat(159000),
  };
  const shrunk = shrinkPeriodMapsForBudget(bloated, 160000);
  const size = new TextEncoder().encode(JSON.stringify(shrunk)).length;
  assert.ok(size <= 160000, "shrunk size " + size);
  assert.ok(shrunk.sales_by_payment.today.length <= PORTAL_MAX_PAYMENTS);
});

check("10. compatibilidad con snapshot F2", () => {
  const f2 = {
    business_name: "Test",
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
  const clean = sanitizePayload(f2);
  assert.ok(clean);
  assert.equal(clean!.sales_today_total, 100);
  assert.equal(clean!.sales_by_register!.length, 1);
  assert.equal(clean!.top_products_today![0].qty, 2);
  assert.equal(clean!.sales_last_30_days!.length, 1);
  assert.equal(clean!.sales_month_to_date!.length, 1);
  assert.equal(clean!.period_compare_7d!.current_total, 10);
  assert.equal(clean!.period_compare_30d!.previous_total, 0);
  assert.equal(clean!.stock_summary!.critical_count, 1);
  assert.equal(clean!.low_stock!.length, 1);
  assert.equal(clean!.recent_sales!.length, 1);
  assert.equal(clean!.sales_by_payment, undefined);
  assert.equal(clean!.top_products, undefined);
  assert.equal(clean!.sales_by_register_by_period, undefined);
  assert.equal(clean!.sales_by_employee_by_period, undefined);
});

const f3Base = {
  business_name: "Los tanos",
  sales_today_total: 0,
  sales_today_count: 0,
  sales_yesterday_total: 0,
  sales_yesterday_count: 0,
  products_total: 15012,
  low_stock_count: 5,
  sales_by_register: [],
  sales_by_employee: [],
  sales_last_7_days: [],
  sales_last_30_days: [{ day: "2026-09-01", count: 7, total: 358891 }],
  sales_month_to_date: [],
  period_compare_7d: {
    current_total: 0,
    current_count: 0,
    previous_total: 0,
    previous_count: 0,
  },
  period_compare_30d: {
    current_total: 358891,
    current_count: 7,
    previous_total: 0,
    previous_count: 0,
  },
  top_products_today: [],
  recent_sales: [],
  low_stock: [],
  stock_summary: { products_total: 15012, critical_count: 5, low_count: 0 },
  pushed_at: "2026-09-17T00:00:00.000Z",
  device_name: "Servidor",
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

check("11. sanitize conserva sales_by_payment", () => {
  const s = sanitizePayload(f3Base)!;
  assert.ok(s.sales_by_payment);
  assert.equal(s.sales_by_payment!["30d"]![0].method, "efectivo");
  assert.equal(s.sales_by_payment!["30d"]![1].method, "débito");
  assert.equal(s.sales_by_payment!["30d"]![0].count, 6);
  assert.equal(s.sales_by_payment!["30d"]![0].total, 350891);
});

check("12. sanitize conserva top_products", () => {
  const s = sanitizePayload(f3Base)!;
  assert.ok(s.top_products);
  assert.equal(s.top_products!["30d"]![0].name, "Prod");
  assert.equal(s.top_products!["30d"]![0].qty, 2);
  assert.equal(s.top_products!["30d"]![0].total, 132213);
});

check("13. sanitize conserva sales_by_register_by_period", () => {
  const s = sanitizePayload(f3Base)!;
  assert.ok(s.sales_by_register_by_period);
  assert.equal(s.sales_by_register_by_period!["30d"]![0].name, "Servidor");
  assert.equal(s.sales_by_register_by_period!["30d"]![0].total, 201213);
});

check("14. sanitize conserva sales_by_employee_by_period", () => {
  const s = sanitizePayload(f3Base)!;
  assert.ok(s.sales_by_employee_by_period);
  assert.equal(s.sales_by_employee_by_period!["30d"]![0].name, "Juan");
  assert.equal(s.sales_by_employee_by_period!["30d"]![0].count, 2);
});

check("15. sanitize respeta límites F3", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    method: "m" + i,
    payment_method: "m" + i,
    name: "n" + i,
    device_code: "D" + i,
    device_name: "C" + i,
    count: 1,
    total: i,
    qty: 1,
  }));
  const s = sanitizePayload({
    ...f3Base,
    sales_by_payment: { today: many, "7d": many, "30d": many, mtd: many },
    top_products: { today: many, "7d": many, "30d": many, mtd: many },
    sales_by_register_by_period: {
      today: many,
      "7d": many,
      "30d": many,
      mtd: many,
    },
    sales_by_employee_by_period: {
      today: many,
      "7d": many,
      "30d": many,
      mtd: many,
    },
  })!;
  assert.equal(s.sales_by_payment!["30d"]!.length, PORTAL_MAX_PAYMENTS);
  assert.equal(s.top_products!["30d"]!.length, PORTAL_MAX_TOP_PRODUCTS);
  assert.equal(s.sales_by_register_by_period!["30d"]!.length, PORTAL_MAX_REGISTERS);
  assert.equal(s.sales_by_employee_by_period!["30d"]!.length, PORTAL_MAX_EMPLOYEES);
});

check("16. sanitize conserva campos F2 junto a F3", () => {
  const s = sanitizePayload(f3Base)!;
  assert.equal(s.sales_last_30_days![0].total, 358891);
  assert.equal(s.period_compare_30d!.current_total, 358891);
  assert.equal(s.stock_summary!.products_total, 15012);
  assert.equal(s.products_total, 15012);
  assert.equal(s.device_name, "Servidor");
  assert.ok(s.sales_by_payment);
  assert.ok(s.top_products);
});

check("17. payload sanitize no crece sin tope de listas", () => {
  const many = Array.from({ length: 500 }, (_, i) => ({
    method: "m" + i,
    name: "n" + i,
    device_code: "D" + i,
    count: 1,
    total: 1,
    qty: 1,
  }));
  const s = sanitizePayload({
    ...f3Base,
    sales_by_payment: { today: many, "7d": many, "30d": many, mtd: many },
    top_products: { today: many, "7d": many, "30d": many, mtd: many },
    sales_by_register_by_period: {
      today: many,
      "7d": many,
      "30d": many,
      mtd: many,
    },
    sales_by_employee_by_period: {
      today: many,
      "7d": many,
      "30d": many,
      mtd: many,
    },
  })!;
  const bytes = new TextEncoder().encode(JSON.stringify(s)).length;
  assert.ok(bytes < 160000, "sanitized bytes " + bytes);
});

check("18. snapshot F2 antiguo no rompe sanitize", () => {
  const legacy = sanitizePayload({
    business_name: "Old",
    sales_today_total: 1,
    sales_today_count: 1,
  });
  assert.ok(legacy);
  assert.equal(legacy!.sales_today_total, 1);
  assert.equal(legacy!.sales_by_payment, undefined);
  assert.deepEqual(legacy!.sales_by_register, []);
});

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nFase 3 portal unit tests PASS");
