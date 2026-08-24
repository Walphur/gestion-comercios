import { validatePayloadSchema } from "./payloadSchema";
import { parseInterpretation, validateInterpretationFull, validateNumbers, buildAllowedNumbers } from "./validateResponse";
import { hasBusinessIntelligence } from "./licenseAuth";
import { checkRateLimit, resetRateLimitsForTests } from "./rateLimit";

const samplePayload = {
  computed_at: new Date().toISOString(),
  currency: "ARS",
  scope_notes: {
    cashIsLocalOnly: true,
    quotesMayLag: false,
    profitUsesCurrentCost: true,
    coverageIsEstimated: true,
    coverageNotForPurchaseQty: true,
  },
  freshness: { enabled: false, role: "off", status: "disconnected", pendingEvents: 0, lastSyncAt: null, conflictCount: 0 },
  sales: {
    today: { count: 1, total: 100, units_sold: 2, avg_ticket: 100 },
    period_30d: { count: 10, total: 800, units_sold: 50, avg_ticket: 80 },
    comparison_30d_vs_prev: {
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
  },
  inventory: { total_products: 10, stock_value: 1000, low_stock_count: 1, expiring_count: 0 },
  alerts_summary: { critical_count: 1, warning_count: 1, info_count: 0, top: [] },
  actions_today: [{ urgency: "now", title: "Reponer", reason: "Sin stock", category: "stock" }],
  meta: { payload_version: 1, show_profits: true },
  profit_estimated: {
    today: { revenue: 0, cost: 0, profit: 0, margin_pct: 0, is_estimated: true, estimation_note: "x" },
    period_30d: { revenue: 800, cost: 600, profit: 200, margin_pct: 25, is_estimated: true, estimation_note: "x" },
  },
};

export function runWorkerSelfTest(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  resetRateLimitsForTests();

  if (validatePayloadSchema({}, true).ok) errors.push("schema {}");
  if (validatePayloadSchema(null, true).ok) errors.push("schema null");
  const big = validatePayloadSchema({ ...samplePayload, extra: true }, true);
  if (big.ok) errors.push("schema extra field");

  const valid = validatePayloadSchema(samplePayload, true);
  if (!valid.ok) errors.push(`schema valid: ${valid.errors.join(",")}`);

  if (!hasBusinessIntelligence({ v: 1, lid: "x", plan: "basic", max_devices: 1, machine_id: "m", pro: false, iat: 1, key_mask: "x", billing: "monthly" })) {
    errors.push("entitlement monthly");
  }
  if (hasBusinessIntelligence({ v: 1, lid: "x", plan: "basic", max_devices: 1, machine_id: "m", pro: false, iat: 1, key_mask: "x", billing: "perpetual" })) {
    errors.push("entitlement perpetual");
  }

  const parsed = parseInterpretation(
    {
      summary: "Ventas 20% por debajo.",
      insights: [],
      action_explanations: [{ action_index: 0, explanation: "Reponé primero." }],
      caveats: [],
    },
    1,
  );
  if (!parsed) errors.push("parse ok");
  if (parsed && validateInterpretationFull(parsed, samplePayload).length) errors.push("validate ok interpret");

  const invented = parseInterpretation(
    {
      summary: "Hay 999 alertas.",
      insights: [],
      action_explanations: [{ action_index: 0, explanation: "x" }],
      caveats: [],
    },
    1,
  );
  if (invented && validateInterpretationFull(invented, samplePayload).length === 0) errors.push("invented number");

  const badIndex = parseInterpretation(
    {
      summary: "Resumen",
      insights: [],
      action_explanations: [{ action_index: 3, explanation: "x" }],
      caveats: [],
    },
    1,
  );
  if (badIndex) errors.push("bad index parsed");

  const allowed = buildAllowedNumbers(samplePayload);
  if (validateNumbers(["20% de caída"], allowed).length) errors.push("pct 20");

  for (let i = 0; i < 25; i++) {
    const r = checkRateLimit("test-key", "basic");
    if (!r.ok && i < 20) errors.push("rate limit early");
  }
  const blocked = checkRateLimit("test-key", "basic");
  if (blocked.ok) errors.push("rate limit not blocked");

  return { ok: errors.length === 0, errors };
}

const result = runWorkerSelfTest();
if (!result.ok) {
  console.error("Worker self-test FAIL", result.errors);
  process.exit(1);
}
console.log("Worker self-test PASS");
