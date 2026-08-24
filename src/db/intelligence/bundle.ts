import { getIntelligenceSnapshot } from "./snapshot";
import { evaluateAlerts } from "./alerts";
import type { AlertEvaluationContext, AlertEvaluationResult } from "./alertTypes";
import type { IntelligenceSnapshot, IntelligenceSnapshotOptions } from "./types";

export interface IntelligenceBundle {
  snapshot: IntelligenceSnapshot;
  alerts: AlertEvaluationResult;
}

export async function getIntelligenceBundle(
  options: IntelligenceSnapshotOptions = {},
  alertCtx: AlertEvaluationContext = {},
): Promise<IntelligenceBundle> {
  const snapshot = await getIntelligenceSnapshot(options);
  const alerts = evaluateAlerts(snapshot, alertCtx);
  return { snapshot, alerts };
}

export { evaluateAlerts } from "./alerts";
export type {
  BusinessAlert,
  BusinessAlertSeverity,
  BusinessAlertType,
  AlertEvaluationContext,
  AlertEvaluationResult,
} from "./alertTypes";
