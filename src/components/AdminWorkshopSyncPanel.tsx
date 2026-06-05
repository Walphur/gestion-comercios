import { useCallback, useEffect, useState } from "react";
import { Cloud, FolderOpen, RefreshCw } from "lucide-react";
import { Button, Select } from "./ui";
import { useAppConfig } from "../context/AppConfig";
import {
  MULTI_PC_ROLE_LABELS,
  getMultiPcSetupSteps,
  getMultiPcSyncDataSummary,
  getMultiPcSyncIntro,
} from "../config/multiPcSync";
import {
  getWorkshopSyncStatus,
  pickWorkshopSyncFolder,
  runWorkshopSyncNow,
  setWorkshopSyncConfig,
  type WorkshopSyncRole,
  type WorkshopSyncStatus,
} from "../lib/workshopSync";

interface Props {
  onFlash: (msg: string) => void;
}

const ROLE_OPTIONS: { value: WorkshopSyncRole; label: string }[] = [
  { value: "off", label: MULTI_PC_ROLE_LABELS.off },
  { value: "workshop", label: MULTI_PC_ROLE_LABELS.workshop },
  { value: "counter", label: MULTI_PC_ROLE_LABELS.counter },
];

export default function AdminWorkshopSyncPanel({ onFlash }: Props) {
  const { rubro, proPlanEnabled, proModules } = useAppConfig();
  const [status, setStatus] = useState<WorkshopSyncStatus | null>(null);
  const [role, setRole] = useState<WorkshopSyncRole>("off");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);

  const dataSummary = getMultiPcSyncDataSummary(rubro, proPlanEnabled, proModules);
  const setupSteps = getMultiPcSetupSteps(rubro, proPlanEnabled, proModules);

  const reload = useCallback(async () => {
    const s = await getWorkshopSyncStatus();
    setStatus(s);
    setRole(s.role);
    setFolder(s.folder_path ?? "");
  }, []);

  useEffect(() => {
    void reload();
    const id = setInterval(() => void reload(), 8000);
    return () => clearInterval(id);
  }, [reload]);

  async function saveConfig(nextRole = role, nextFolder = folder) {
    setBusy(true);
    try {
      await setWorkshopSyncConfig(nextRole, nextFolder.trim() || null);
      await reload();
      onFlash("Sincronización entre PCs guardada");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickFolder() {
    const path = await pickWorkshopSyncFolder();
    if (!path) return;
    setFolder(path);
    await saveConfig(role, path);
  }

  async function syncNow() {
    setBusy(true);
    try {
      const s = await runWorkshopSyncNow();
      setStatus(s);
      if (s.last_error) {
        onFlash(`Sync con aviso: ${s.last_error}`);
      } else if (role === "workshop" && s.pending_exports === 0) {
        onFlash("Cambios enviados a la carpeta compartida");
      } else if (role === "counter" && s.pending_exports === 0 && s.last_import_count === 0) {
        onFlash("Clientes enviados; sin novedades de la otra PC");
      } else if (role === "counter") {
        onFlash(
          s.last_import_count > 0
            ? `Importados ${s.last_import_count} registro(s) de la otra PC`
            : "Sin novedades de la otra PC",
        );
      } else {
        onFlash("Sincronización ejecutada");
      }
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--color-panel-border)] p-4 space-y-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Cloud size={16} /> Sincronización entre PCs
        </p>
        <p className="mt-1 text-xs text-ink-muted">{getMultiPcSyncIntro()}</p>
        <p className="mt-2 text-xs font-medium text-brand-700 dark:text-brand-300">{dataSummary}</p>
      </div>

      <Select
        label="Rol de esta PC"
        value={role}
        onChange={(e) => {
          const v = e.target.value as WorkshopSyncRole;
          setRole(v);
          void saveConfig(v, folder);
        }}
        disabled={busy}
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink">Carpeta compartida (ej. Google Drive)</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void pickFolder()} disabled={busy}>
            <FolderOpen size={16} /> Elegir carpeta…
          </Button>
          {folder && (
            <Button variant="ghost" onClick={() => void saveConfig()} disabled={busy}>
              Guardar ruta
            </Button>
          )}
        </div>
        {folder ? (
          <p className="break-all rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-2 text-xs text-ink-muted">
            {folder}
          </p>
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Creá una carpeta «GestionComercios-Sync» en Google Drive e instalá Google Drive para
            escritorio en cada PC. Elegí esa carpeta acá.
          </p>
        )}
      </div>

      {status?.enabled && (
        <div className="rounded-lg border border-[var(--color-panel-border)] p-3 text-xs text-ink-muted space-y-1">
          <p>
            <Cloud size={12} className="inline mr-1" />
            Dispositivo: <code className="text-ink">{status.device_id.slice(0, 8)}…</code>
          </p>
          {role === "workshop" && <p>Pendientes de enviar: {status.pending_exports}</p>}
          {role === "counter" && status.last_import_count > 0 && (
            <p>Última importación: {status.last_import_count} registro(s)</p>
          )}
          {status.last_error && (
            <p className="text-amber-700 dark:text-amber-300">Aviso: {status.last_error}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void syncNow()} disabled={busy || role === "off"}>
          <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
          Sincronizar ahora
        </Button>
      </div>

      <div className="rounded-lg border border-dashed border-[var(--color-panel-border)] p-3 text-xs text-ink-muted space-y-1">
        <p className="font-semibold text-ink">Configuración recomendada</p>
        {setupSteps.map((step, i) => (
          <p key={i}>
            {i + 1}. {step}
          </p>
        ))}
      </div>
    </section>
  );
}
