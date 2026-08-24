import { invoke } from "@tauri-apps/api/core";
import { closeDb } from "./db/index";

export type GestionE2eBridge = {
  invoke: typeof invoke;
  closeDb: () => Promise<void>;
  clearStorage: () => void;
  getIntelligenceSnapshot?: () => Promise<unknown>;
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
  };
}
