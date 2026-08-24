#!/usr/bin/env node
/**
 * Auth positiva real: trial → token GC1 firmado por license-api → POST /interpret.
 * No inventa tokens. Requiere red.
 */
import { randomBytes } from "node:crypto";

const LICENSE_API = "https://gestion-comercios-license.walphur.workers.dev";
const BI_API = "https://gestion-bi-ia.walphur.workers.dev";

function samplePayload(machineFreshness = 0) {
  return {
    computed_at: new Date().toISOString(),
    currency: "ARS",
    scope_notes: {
      cashIsLocalOnly: true,
      quotesMayLag: false,
      profitUsesCurrentCost: true,
      coverageIsEstimated: true,
      coverageNotForPurchaseQty: true,
    },
    freshness: {
      enabled: false,
      role: "off",
      status: "disconnected",
      pendingEvents: machineFreshness,
      lastSyncAt: null,
      conflictCount: 0,
    },
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
    alerts_summary: { critical_count: 1, warning_count: 0, info_count: 0, top: [] },
    actions_today: [
      { urgency: "now", title: "Reponer stock", reason: "Sin stock", category: "stock" },
      { urgency: "today", title: "Revisar caja", reason: "Diferencia", category: "cash" },
      { urgency: "today", title: "Contactar cliente", reason: "Deuda", category: "customers" },
    ],
    meta: { payload_version: 1, show_profits: true },
    profit_estimated: {
      today: { revenue: 0, cost: 0, profit: 0, margin_pct: 0, is_estimated: true, estimation_note: "x" },
      period_30d: {
        revenue: 800,
        cost: 600,
        profit: 200,
        margin_pct: 25,
        is_estimated: true,
        estimation_note: "x",
      },
    },
  };
}

async function main() {
  const machineId = `smoke-${randomBytes(16).toString("hex")}`;
  const report = {
    machine_id: machineId,
    trial_start: null,
    bi_token: null,
    interpret: null,
    errors: [],
  };

  const startRes = await fetch(`${LICENSE_API}/v1/trial/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ machine_id: machineId, app_version: "1.0.4-smoke" }),
  });
  report.trial_start = { status: startRes.status, body: await startRes.json().catch(() => ({})) };
  if (!startRes.ok) {
    console.log(JSON.stringify({ ok: false, stage: "trial_start", report }, null, 2));
    process.exit(1);
  }

  const tokenRes = await fetch(`${LICENSE_API}/v1/trial/bi-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ machine_id: machineId }),
  });
  const tokenBody = await tokenRes.json().catch(() => ({}));
  report.bi_token = { status: tokenRes.status, ok: tokenBody.ok, has_token: Boolean(tokenBody.token) };
  if (!tokenRes.ok || !tokenBody.token) {
    console.log(JSON.stringify({ ok: false, stage: "bi_token", report, tokenBody }, null, 2));
    process.exit(1);
  }

  const payload = samplePayload();
  const interpretRes = await fetch(`${BI_API}/interpret`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenBody.token}`,
    },
    body: JSON.stringify({
      payload,
      machine_id: machineId,
      show_profits: true,
    }),
  });
  const interpretBody = await interpretRes.json().catch(() => ({}));
  const authAccepted = interpretRes.status !== 401 && interpretRes.status !== 403;
  report.interpret = {
    status: interpretRes.status,
    auth_accepted: authAccepted,
    ok: interpretBody.ok === true,
    has_summary: typeof interpretBody.summary === "string" && interpretBody.summary.length > 0,
    has_action_explanations: Array.isArray(interpretBody.action_explanations),
    engine: interpretBody.engine,
    error: interpretBody.error,
    detail: interpretBody.detail,
  };

  const modelOk =
    interpretRes.status === 200 &&
    interpretBody.ok === true &&
    typeof interpretBody.summary === "string" &&
    interpretBody.summary.length > 0;

  console.log(
    JSON.stringify(
      {
        ok: modelOk,
        auth_accepted: authAccepted,
        model_ok: modelOk,
        report,
      },
      null,
      2,
    ),
  );
  // Exit 0 solo si auth + modelo OK. Auth-only se reporta en JSON.
  process.exit(modelOk ? 0 : authAccepted ? 2 : 1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
