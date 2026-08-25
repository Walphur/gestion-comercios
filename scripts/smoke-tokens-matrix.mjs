#!/usr/bin/env node
/**
 * Smoke tokens reales: activate → GC1 → POST /interpret
 * No imprime claves ni tokens completos.
 */
import { randomBytes } from "node:crypto";

const LICENSE_API = process.env.LICENSE_API_URL ?? "https://gestion-comercios-license.walphur.workers.dev";
const BI_API = "https://gestion-bi-ia.walphur.workers.dev";

const keys = {
  monthly: process.env.SMOKE_KEY_MONTHLY,
  perpetual: process.env.SMOKE_KEY_PERPETUAL,
  pro: process.env.SMOKE_KEY_PRO,
};

function samplePayload() {
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
      pendingEvents: 0,
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

async function activate(key, machineId) {
  const res = await fetch(`${LICENSE_API}/v1/activate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, machine_id: machineId }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function interpret(token, machineId) {
  const res = await fetch(`${BI_API}/interpret`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      payload: samplePayload(),
      machine_id: machineId,
      show_profits: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return {
    status: res.status,
    ok: body.ok === true,
    has_summary: typeof body.summary === "string" && body.summary.length > 0,
    error: body.error,
    detail: body.detail,
    engine: body.engine,
  };
}

async function runCase(label, key) {
  if (!key) {
    return { label, result: "UNTESTED", reason: "missing key env" };
  }
  const machineId = `smoke-${label}-${randomBytes(8).toString("hex")}`;
  const act = await activate(key, machineId);
  if (!act.body?.token) {
    return {
      label,
      result: "FAIL",
      activate_status: act.status,
      activate_error: act.body?.message ?? act.body?.error,
    };
  }
  const billing = act.body.billing;
  const interp = await interpret(act.body.token, machineId);
  const expectBi = billing === "monthly" || billing === "trial";
  let result;
  if (expectBi) {
    result = interp.status === 200 && interp.ok && interp.has_summary ? "PASS" : "FAIL";
  } else {
    // perpetual must be rejected by Worker
    result = interp.status === 403 ? "PASS" : "FAIL";
  }
  return {
    label,
    result,
    billing,
    activate_status: act.status,
    interpret_status: interp.status,
    interpret_ok: interp.ok,
    has_summary: interp.has_summary,
    error: interp.error,
    detail: interp.detail,
    expect_bi: expectBi,
  };
}

async function trialCase() {
  const machineId = `smoke-trial-${randomBytes(8).toString("hex")}`;
  await fetch(`${LICENSE_API}/v1/trial/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ machine_id: machineId, app_version: "1.0.4-smoke" }),
  });
  const tokenRes = await fetch(`${LICENSE_API}/v1/trial/bi-token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ machine_id: machineId }),
  });
  const tokenBody = await tokenRes.json().catch(() => ({}));
  if (!tokenBody.token) {
    return { label: "trial", result: "FAIL", reason: "no bi-token" };
  }
  const interp = await interpret(tokenBody.token, machineId);
  return {
    label: "trial",
    result: interp.status === 200 && interp.ok && interp.has_summary ? "PASS" : "FAIL",
    billing: "trial",
    interpret_status: interp.status,
    interpret_ok: interp.ok,
    has_summary: interp.has_summary,
    error: interp.error,
    detail: interp.detail,
    expect_bi: true,
  };
}

const rows = [];
rows.push(await trialCase());
rows.push(await runCase("monthly", keys.monthly));
rows.push(await runCase("pro", keys.pro));
rows.push(await runCase("perpetual", keys.perpetual));

console.log(JSON.stringify({ rows }, null, 2));
const hardFail = rows.some((r) => r.result === "FAIL");
process.exit(hardFail ? 1 : 0);
