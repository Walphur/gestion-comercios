import { invoke } from "@tauri-apps/api/core";
import { closeDb } from "./db/index";

export type GestionE2eBridge = {
  invoke: typeof invoke;
  closeDb: () => Promise<void>;
  clearStorage: () => void;
  /** Abre SQLite vía plugin (corre migraciones reales) y cierra para Rust. */
  warmDb?: () => Promise<void>;
  getIntelligenceSnapshot?: () => Promise<unknown>;
  evaluateBusinessAlerts?: (snap: unknown, ctx?: unknown) => Promise<unknown>;
  getIntelligenceBundle?: (options?: unknown, ctx?: unknown) => Promise<unknown>;
  buildBusinessActions?: (snap: unknown, alerts: unknown, ctx?: unknown) => Promise<unknown>;
  selfTestAlertRules?: () => Promise<{ ok: boolean; errors: string[] }>;
  selfTestActionRules?: () => Promise<{ ok: boolean; errors: string[] }>;
  selfTestIaPayload?: () => Promise<{ ok: boolean; errors: string[] }>;
  selfTestIaValidation?: () => Promise<{ ok: boolean; errors: string[] }>;
  hashIaPayload?: (payload: unknown) => Promise<string>;
  saveCachedInterpretation?: (payload: unknown, interpretation: unknown) => Promise<void>;
  loadCachedInterpretation?: (payload: unknown) => Promise<unknown>;
  buildIaPayload?: (
    snap: unknown,
    alerts: unknown,
    actions: unknown,
    options?: unknown,
  ) => Promise<unknown>;
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
    async warmDb() {
      const { getDb, closeDb: close } = await import("./db/index");
      await getDb();
      await close();
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
    selfTestIaPayload: () =>
      import("./db/intelligence/iaPayload.selftest").then((m) => m.selfTestIaPayload()),
    selfTestIaValidation: () =>
      import("./db/intelligence/iaValidation.selftest").then((m) => m.selfTestIaValidation()),
    hashIaPayload: (payload: unknown) =>
      import("./db/intelligence/iaPayloadHash").then((m) =>
        m.hashIaPayload(payload as import("./db/intelligence/iaPayload").IaPayload),
      ),
    saveCachedInterpretation: (payload: unknown, interpretation: unknown) =>
      import("./lib/biIaApi").then((m) =>
        m.saveCachedInterpretation(
          payload as import("./db/intelligence/iaPayload").IaPayload,
          interpretation as import("./db/intelligence/interpretationTypes").BusinessInterpretation,
        ),
      ),
    loadCachedInterpretation: (payload: unknown) =>
      import("./lib/biIaApi").then((m) =>
        m.loadCachedInterpretation(payload as import("./db/intelligence/iaPayload").IaPayload),
      ),
    buildIaPayload: (snap: unknown, alerts: unknown, actions: unknown, options?: unknown) =>
      import("./db/intelligence").then((m) =>
        m.buildIaPayload(
          snap as import("./db/intelligence/types").IntelligenceSnapshot,
          alerts as import("./db/intelligence/alertTypes").AlertEvaluationResult,
          actions as import("./db/intelligence/actionTypes").ActionEvaluationResult,
          options as import("./db/intelligence/iaPayload").IaPayloadOptions,
        ),
      ),
  };
}
