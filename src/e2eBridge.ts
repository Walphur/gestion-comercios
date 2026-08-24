import { invoke } from "@tauri-apps/api/core";
import { closeDb } from "./db/index";

export type GestionE2eBridge = {
  invoke: typeof invoke;
  closeDb: () => Promise<void>;
  clearStorage: () => void;
  getIntelligenceSnapshot?: () => Promise<unknown>;
  evaluateBusinessAlerts?: (snap: unknown, ctx?: unknown) => Promise<unknown>;
  getIntelligenceBundle?: (options?: unknown, ctx?: unknown) => Promise<unknown>;
  buildBusinessActions?: (snap: unknown, alerts: unknown, ctx?: unknown) => Promise<unknown>;
  selfTestAlertRules?: () => Promise<{ ok: boolean; errors: string[] }>;
  selfTestActionRules?: () => Promise<{ ok: boolean; errors: string[] }>;
};

declare global {
  interface Window {
    __GESTION_E2E__?: GestionE2eBridge;
  }
}

if (import.meta.env.DEV) {
  window.__GESTION_E2E__ = {
    invoke,
    closeDb,
    clearStorage() {
      localStorage.clear();
      sessionStorage.clear();
    },
    getIntelligenceSnapshot: () =>
      import("./db/intelligence").then((m) => m.getIntelligenceSnapshot()),
    evaluateBusinessAlerts: (snap: unknown, ctx?: unknown) =>
      import("./db/intelligence").then((m) =>
        m.evaluateAlerts(snap as import("./db/intelligence/types").IntelligenceSnapshot, ctx as import("./db/intelligence/alertTypes").AlertEvaluationContext),
      ),
    getIntelligenceBundle: (options?: unknown, ctx?: unknown) =>
      import("./db/intelligence").then((m) =>
        m.getIntelligenceBundle(
          options as import("./db/intelligence/types").IntelligenceSnapshotOptions,
          ctx as import("./db/intelligence/alertTypes").AlertEvaluationContext,
        ),
      ),
    buildBusinessActions: (snap: unknown, alerts: unknown, ctx?: unknown) =>
      import("./db/intelligence").then((m) =>
        m.buildActions(
          snap as import("./db/intelligence/types").IntelligenceSnapshot,
          alerts as import("./db/intelligence/alertTypes").AlertEvaluationResult,
          ctx as import("./db/intelligence/actionTypes").ActionEvaluationContext,
        ),
      ),
    selfTestAlertRules: () =>
      import("./db/intelligence/alerts.selftest").then((m) => m.selfTestAlertRules()),
    selfTestActionRules: () =>
      import("./db/intelligence/actions.selftest").then((m) => m.selfTestActionRules()),
  };
}
