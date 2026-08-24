import { buildIaPayload } from "./iaPayload";
import { mockSnapshot } from "./alerts.selftest";
import { evaluateAlerts } from "./alerts";
import { buildActions } from "./actions";
import { hashIaPayload, canonicalizePayload } from "./iaPayloadHash";
import {
  buildAllowedNumberSet,
  sanitizeInterpretation,
  validateActionExplanations,
  validateInterpretationAgainstPayload,
  validateNumericalTexts,
} from "./iaValidation";
import { validateIaPayloadSchema } from "./iaPayloadSchema";

export function selfTestIaPayload(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const snap = mockSnapshot();
  const alerts = evaluateAlerts(snap, { showProfits: true, featuresStock: true, featuresCustomers: true });
  const actions = buildActions(snap, alerts, { showProfits: true, featuresStock: true, featuresCustomers: true });
  const payload = buildIaPayload(snap, alerts, actions, { showProfits: true, featuresStock: true, featuresCustomers: true, currency: "ARS" });

  if (!payload.meta?.payload_version) errors.push("meta");
  if (payload.meta.show_profits !== true) errors.push("show_profits meta");

  const empty = validateIaPayloadSchema({}, true);
  if (empty.ok) errors.push("schema aceptó {}");

  const noProfit = buildIaPayload(snap, alerts, actions, { showProfits: false });
  if (noProfit.profit_estimated) errors.push("profit sin permiso");

  return { ok: errors.length === 0, errors };
}

export async function selfTestIaValidation(): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const snap = mockSnapshot();
  const alerts = evaluateAlerts(snap, { showProfits: true, featuresStock: true, featuresCustomers: true });
  const actions = buildActions(snap, alerts, { showProfits: true, featuresStock: true, featuresCustomers: true });
  const payload = buildIaPayload(snap, alerts, actions, { showProfits: true, featuresStock: true, featuresCustomers: true });

  const allowed = buildAllowedNumberSet(payload);
  const validNum = validateNumericalTexts(["Caída de ventas 20% vs período anterior."], allowed);
  if (!validNum.ok) errors.push(`num válido: ${validNum.errors.join(",")}`);

  const invalidNum = validateNumericalTexts(["Hay 999 productos críticos."], allowed);
  if (invalidNum.ok) errors.push("num inválido pasó");

  const good = sanitizeInterpretation(
    {
      summary: "Ventas 20% por debajo del período anterior.",
      insights: [],
      action_explanations: [{ action_index: 0, explanation: "Priorizá reponer stock." }],
      caveats: ["Utilidad estimada según costo actual."],
    },
    payload.actions_today.length,
  );
  if (!good) errors.push("sanitize good");

  const badPriority = sanitizeInterpretation(
    {
      summary: "Ok",
      insights: [],
      priorities: ["Cliente primero"],
      action_explanations: [],
      caveats: [],
    },
    payload.actions_today.length,
  );
  if (badPriority) errors.push("priorities libres aceptadas");

  const exactProfit = validateInterpretationAgainstPayload(
    {
      summary: "La utilidad exacta del mes fue alta.",
      insights: [],
      action_explanations: [{ action_index: 0, explanation: "Ok" }],
      caveats: [],
      generated_at: new Date().toISOString(),
    },
    payload,
  );
  if (exactProfit.ok) errors.push("lenguaje exacto pasó");

  const badIndex = validateActionExplanations([{ action_index: 99, explanation: "x" }], 3);
  if (badIndex.ok) errors.push("index inválido pasó");

  if (good) {
    const check = validateInterpretationAgainstPayload(good, payload);
    if (!check.ok) errors.push(`interpretación válida: ${check.errors.join(",")}`);
  }

  const h1 = await hashIaPayload(payload);
  const h2 = await hashIaPayload(payload);
  if (h1 !== h2) errors.push("hash inestable");

  const changed = { ...payload, inventory: { ...payload.inventory, low_stock_count: payload.inventory.low_stock_count + 1 } };
  const h3 = await hashIaPayload(changed);
  if (h1 === h3) errors.push("hash no cambió");

  if (canonicalizePayload({ b: 1, a: 2 }) !== canonicalizePayload({ a: 2, b: 1 })) {
    errors.push("canonical");
  }

  return { ok: errors.length === 0, errors };
}
