import { useEffect } from "react";
import { checkAndInstallUpdate } from "../lib/updater";
import { getConnectionStatus } from "../lib/tauri";

/** Busca actualizaciones al abrir la app (con internet), sin pedir confirmación. */
export default function AutoUpdater() {
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const st = await getConnectionStatus();
        if (st.online) await checkAndInstallUpdate(true);
      } catch {
        /* desktop sin Tauri o sin red */
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
