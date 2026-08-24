import { buildIaPayload } from "./iaPayload";
import { mockSnapshot } from "./alerts.selftest";
import { evaluateAlerts } from "./alerts";
import { buildActions } from "./actions";

/** Ejecutable desde E2E: valida payload IA sin red. */
export function selfTestIaPayload(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const snap = mockSnapshot();
  const alerts = evaluateAlerts(snap, {
    showProfits: true,
    featuresStock: true,
    featuresCustomers: true,
  });
  const actions = buildActions(snap, alerts, {
    showProfits: true,
    featuresStock: true,
    featuresCustomers: true,
  });
  const payload = buildIaPayload(snap, alerts, actions, {
    showProfits: true,
    featuresStock: true,
    featuresCustomers: true,
    currency: "ARS",
  });

  if (!payload.computed_at) errors.push("falta computed_at");
  if (!payload.actions_today.length) errors.push("falta actions_today");
  if (payload.alerts_summary.critical_count < 1) errors.push("critical_count");
  if (!payload.profit_estimated?.period_30d.is_estimated) errors.push("profit no estimado");
  if (!payload.stock_highlights?.low_stock.length) errors.push("stock highlights");
  if (payload.scope_notes.profitUsesCurrentCost !== true) errors.push("scope profit");
  if (payload.scope_notes.coverageNotForPurchaseQty !== true) errors.push("scope coverage");

  const json = JSON.stringify(payload);
  if (json.length > 50_000) errors.push("payload demasiado grande");

  return { ok: errors.length === 0, errors };
}
