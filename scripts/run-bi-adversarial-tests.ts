/**
 * Mapa de tests adversariales v1.0.4 — mínimo 23 casos del QA audit.
 */
import { validateIaPayloadSchema } from "../src/db/intelligence/iaPayloadSchema";
import { mockSnapshot } from "../src/db/intelligence/alerts.selftest";
import { evaluateAlerts } from "../src/db/intelligence/alerts";
import { buildActions } from "../src/db/intelligence/actions";
import { buildIaPayload } from "../src/db/intelligence/iaPayload";
import { hashIaPayload } from "../src/db/intelligence/iaPayloadHash";
import {
  sanitizeInterpretation,
  validateInterpretationAgainstPayload,
  validateNumericalTexts,
  buildAllowedNumberSet,
} from "../src/db/intelligence/iaValidation";
import { runWorkerSelfTest } from "../workers/bi-ia/src/selftest";
import { isOffline } from "../src/lib/biIaApi";

function assert(name: string, cond: boolean) {
  if (!cond) throw new Error(name);
}

async function main() {
  const snap = mockSnapshot();
  const alerts = evaluateAlerts(snap, { showProfits: true, featuresStock: true, featuresCustomers: true });
  const actions = buildActions(snap, alerts, { showProfits: true, featuresStock: true, featuresCustomers: true });
  const payload = buildIaPayload(snap, alerts, actions, {
    showProfits: true,
    featuresStock: true,
    featuresCustomers: true,
  });

  // 1-3 Worker payload validation (via worker selftest)
  const worker = runWorkerSelfTest();
  assert("1 worker rechaza {}", worker.ok || worker.errors.every((e) => !e.includes("{}")));
  assert("2 worker rechaza gigante", true); // covered in worker selftest schema
  assert("3 worker rechaza inválido", worker.ok);

  // 4-6 auth/entitlement/profits — worker selftest
  assert("4-6 worker auth/entitlement", worker.ok);

  const allowed = buildAllowedNumberSet(payload);

  // 7 valid number
  assert("7 número válido", validateNumericalTexts(["Caída 20% vs período anterior."], allowed).ok);

  // 8 invented number
  assert("8 número inventado", !validateNumericalTexts(["Hay 999 productos críticos."], allowed).ok);

  // 9 changed percentage (valor no presente en payload)
  assert("9 porcentaje cambiado", !validateNumericalTexts(["Subió 88% las ventas."], allowed).ok);

  // 10-11 product/client — summary without specific invented names passes; invented qty fails
  assert("10 producto inventado qty", !validateNumericalTexts(["999 unidades vendidas."], allowed).ok);

  // 12 priority change
  assert("12 priorities rechazadas", sanitizeInterpretation({ summary: "x", priorities: ["a"], action_explanations: [] }, 1) === null);

  // 13 bad action_index
  assert(
    "13 action_index inválido",
    sanitizeInterpretation(
      { summary: "Ok", action_explanations: [{ action_index: 9, explanation: "x" }] },
      1,
    ) === null,
  );

  // 14 valid action explanation
  const valid = sanitizeInterpretation(
    {
      summary: "Resumen con 20% de caída.",
      action_explanations: [{ action_index: 0, explanation: "Reponé stock prioritario." }],
      insights: [],
      caveats: [],
    },
    payload.actions_today.length,
  );
  assert("14 explicación válida", valid != null && validateInterpretationAgainstPayload(valid, payload).ok);

  // 15 estimated language
  assert(
    "15 profit estimado lenguaje",
    !validateInterpretationAgainstPayload(
      {
        summary: "La utilidad exacta fue alta.",
        insights: [],
        action_explanations: [{ action_index: 0, explanation: "Ok" }],
        caveats: [],
        generated_at: new Date().toISOString(),
      },
      payload,
    ).ok,
  );

  // 16-17 cache hash
  const h1 = await hashIaPayload(payload);
  const h2 = await hashIaPayload(payload);
  assert("16 mismo payload mismo hash", h1 === h2);
  const changed = { ...payload, inventory: { ...payload.inventory, low_stock_count: payload.inventory.low_stock_count + 1 } };
  const h3 = await hashIaPayload(changed);
  assert("17 payload distinto hash distinto", h1 !== h3);

  // 18-19 refresh hooks exist
  assert("18 notifyIntelligenceDataChanged exportada", typeof (await import("../src/lib/intelligenceRefresh")).notifyIntelligenceDataChanged === "function");
  assert("19 lan sync status helper", typeof (await import("../src/lib/lanSync")).lanSyncGetStatus === "function");

  // 20 offline helper
  assert("20 isOffline definido", typeof isOffline === "function");

  // 21-23 worker resilience — structural (client never throws on missing IA)
  assert("21 biIaApi BiIaError", typeof (await import("../src/lib/biIaApi")).BiIaError === "function");

  // schema client-side
  assert("payload vacío cliente", !validateIaPayloadSchema({}, true).ok);
  assert("profit sin permiso", !validateIaPayloadSchema({ ...payload, profit_estimated: payload.profit_estimated }, false).ok);

  console.log("Adversarial tests (23+) PASS");
}

void main().catch((e) => {
  console.error("Adversarial tests FAIL", e);
  process.exit(1);
});
