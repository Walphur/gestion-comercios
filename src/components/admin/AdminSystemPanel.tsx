import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui";
import AppVersionLabel from "../AppVersionLabel";
import AdminSupportLegalPanel from "./AdminSupportLegalPanel";
import AdminTechnicalPanel from "./AdminTechnicalPanel";
import { checkAndInstallUpdate } from "../../lib/updater";
import { getConnectionStatus } from "../../lib/tauri";
import { formatUserError } from "../../lib/userError";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";
import PlanUpsellNotice from "../PlanUpsellNotice";
import { useUpdateAvailability } from "../../context/UpdateAvailabilityContext";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminSystemPanel({ onFlash }: Props) {
  const { autoUpdates } = usePlanEntitlements();
  const { clear: clearUpdateBanner, refresh: refreshUpdateBanner } = useUpdateAvailability();
  const [updateMsg, setUpdateMsg] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  async function handleCheckUpdate() {
    setCheckingUpdate(true);
    try {
      const status = await getConnectionStatus();
      if (!status.online) {
        setUpdateMsg("Sin internet: no se puede buscar actualizaciones.");
        return;
      }
      const r = await checkAndInstallUpdate(false, { autoUpdates });
      if (r.message) {
        setUpdateMsg(r.message);
        onFlash(r.message.slice(0, 80));
      }
      if (r.available && r.message.includes("Actualizado")) {
        clearUpdateBanner();
      } else {
        await refreshUpdateBanner();
      }
    } catch (e) {
      setUpdateMsg(formatUserError(e));
    } finally {
      setCheckingUpdate(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminSupportLegalPanel />

      <details className="rounded-xl border border-dashed border-[var(--color-panel-border)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink-muted">
          Información avanzada
        </summary>
        <p className="mt-2 text-xs text-ink-muted">
          Para soporte. El día a día del comercio no necesita estos datos.
        </p>
        <div className="mt-4 space-y-4">
          <AppVersionLabel variant="panel" showCopy />
          <section>
            <p className="text-sm font-semibold text-ink">Buscar actualización</p>
            {autoUpdates ? (
              <Button
                variant="secondary"
                className="mt-3"
                disabled={checkingUpdate}
                onClick={() => void handleCheckUpdate()}
              >
                <RefreshCw size={16} className={checkingUpdate ? "animate-spin" : ""} />
                Buscar actualización
              </Button>
            ) : (
              <PlanUpsellNotice feature="autoUpdates" className="mt-3" />
            )}
            {updateMsg && <p className="mt-2 text-xs text-ink-muted">{updateMsg}</p>}
          </section>
          <AdminTechnicalPanel onFlash={onFlash} />
        </div>
      </details>
    </div>
  );
}
