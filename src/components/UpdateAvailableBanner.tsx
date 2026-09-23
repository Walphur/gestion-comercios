import { useState } from "react";
import { CloudDownload } from "lucide-react";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import { useUpdateAvailability } from "../context/UpdateAvailabilityContext";
import { checkAndInstallUpdate } from "../lib/updater";
import { openExternalUrl } from "../lib/openExternal";
import { showUserError } from "../lib/notice";

const RELEASES_URL = "https://github.com/Walphur/gestion-comercios/releases/latest";

/** Banner cuando hay update. Instala acá mismo (no manda a Config / PIN). */
export default function UpdateAvailableBanner() {
  const { latestVersion, currentVersion, clear } = useUpdateAvailability();
  const { autoUpdates } = usePlanEntitlements();
  const [busy, setBusy] = useState(false);

  if (!latestVersion) return null;

  async function install() {
    setBusy(true);
    try {
      const r = await checkAndInstallUpdate(false, { autoUpdates });
      if (!r.available) {
        clear();
      }
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2 border-b border-sky-500/30 bg-sky-500/15 px-3 py-2 text-sm text-ink">
      <CloudDownload size={16} className="shrink-0 text-sky-600 dark:text-sky-300" />
      <span className="min-w-0 text-center sm:text-left">
        Hay una versión nueva (v{latestVersion}
        {currentVersion ? ` · tenés v${currentVersion}` : ""}).
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void install()}
        className="shrink-0 rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {busy ? "Actualizando…" : "Actualizar ahora"}
      </button>
      <button
        type="button"
        className="shrink-0 text-xs font-medium text-sky-800 underline-offset-2 hover:underline dark:text-sky-200"
        onClick={() => void openExternalUrl(RELEASES_URL)}
      >
        Descargar instalador
      </button>
    </div>
  );
}
