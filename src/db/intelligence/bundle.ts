import { getIntelligenceSnapshot } from "./snapshot";
import { evaluateAlerts } from "./alerts";
import { buildActions } from "./actions";
import type { AlertEvaluationContext, AlertEvaluationResult } from "./alertTypes";
import type { ActionEvaluationContext, ActionEvaluationResult } from "./actionTypes";
import type { IntelligenceSnapshot, IntelligenceSnapshotOptions } from "./types";

export interface IntelligenceBundle {
  snapshot: IntelligenceSnapshot;
  alerts: AlertEvaluationResult;
  actions: ActionEvaluationResult;
}

export type IntelligenceBundleContext = AlertEvaluationContext & ActionEvaluationContext;

export async function getIntelligenceBundle(
  options: IntelligenceSnapshotOptions = {},
  ctx: IntelligenceBundleContext = {},
): Promise<IntelligenceBundle> {
  const snapshot = await getIntelligenceSnapshot(options);
  const alerts = evaluateAlerts(snapshot, ctx);
  const actions = buildActions(snapshot, alerts, ctx);
  return { snapshot, alerts, actions };
}

export { evaluateAlerts } from "./alerts";
export { buildActions } from "./actions";
export type {
  BusinessAlert,
  BusinessAlertSeverity,
  BusinessAlertType,
  AlertEvaluationContext,
  AlertEvaluationResult,
} from "./alertTypes";
export type {
  BusinessAction,
  BusinessActionKind,
  BusinessActionCategory,
  BusinessActionUrgency,
  ActionEvaluationContext,
  ActionEvaluationResult,
} from "./actionTypes";
