import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui";
import AppVersionLabel from "../AppVersionLabel";
import AdminWorkshopSyncPanel from "../AdminWorkshopSyncPanel";
import AdminSupportLegalPanel from "./AdminSupportLegalPanel";
import AdminModulesPanel from "../AdminModulesPanel";
import AdminBackupsPanel from "./AdminBackupsPanel";
import AdminAdvancedPanel from "./AdminAdvancedPanel";
import { checkAndInstallUpdate } from "../../lib/updater";
import { getConnectionStatus } from "../../lib/tauri";
import { formatUserError } from "../../lib/userError";
import { rubroUsesWorkshopFlow } from "../../config/workshop";
import { useAppConfig } from "../../context/AppConfig";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminSystemPanel({ onFlash }: Props) {
  const { rubro } = useAppConfig();
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
      const r = await checkAndInstallUpdate(false);
      if (r.message) {
        setUpdateMsg(r.message);
        onFlash(r.message.slice(0, 80));
      }
    } catch (e) {
      setUpdateMsg(formatUserError(e));
    } finally {
      setCheckingUpdate(false);
    }
  }

  return (
    <div className="space-y-6">
      <AppVersionLabel variant="panel" showCopy />

      <section className="rounded-xl border border-[var(--color-panel-border)] p-4">
        <p className="text-sm font-semibold text-ink">Actualizaciones</p>
        <p className="mt-1 text-xs text-ink-muted">
          La app busca mejoras al iniciar. Podés forzar la búsqueda acá.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          disabled={checkingUpdate}
          onClick={() => void handleCheckUpdate()}
        >
          <RefreshCw size={16} className={checkingUpdate ? "animate-spin" : ""} />
          Buscar actualización
        </Button>
        {updateMsg && <p className="mt-2 text-xs text-ink-muted">{updateMsg}</p>}
      </section>

      <AdminModulesPanel onFlash={onFlash} />
      {rubroUsesWorkshopFlow(rubro) && <AdminWorkshopSyncPanel onFlash={onFlash} />}
      <AdminBackupsPanel onFlash={onFlash} />
      <AdminAdvancedPanel embedded />
      <AdminSupportLegalPanel />
    </div>
  );
}
