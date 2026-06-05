import { useCallback, useEffect, useState } from "react";
import { Cloud, FolderOpen, RefreshCw, Wrench } from "lucide-react";
import { Card, Button, Select } from "./ui";
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
  { value: "off", label: "Desactivada" },
  { value: "workshop", label: "PC taller (envía presupuestos y OT; recibe clientes)" },
  { value: "counter", label: "PC mostrador (envía clientes; recibe presupuestos del taller)" },
];

export default function AdminWorkshopSyncPanel({ onFlash }: Props) {
  const [status, setStatus] = useState<WorkshopSyncStatus | null>(null);
  const [role, setRole] = useState<WorkshopSyncRole>("off");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);

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
      onFlash("Sincronización taller guardada");
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
        onFlash("Clientes enviados; sin novedades del taller");
      } else if (role === "counter") {
        onFlash(
          s.last_import_count > 0
            ? `Importados ${s.last_import_count} archivos del taller`
            : "Sin novedades del taller",
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
    <Card className="space-y-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Wrench size={16} /> Sincronización taller ↔ mostrador
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Usá una carpeta de <strong>Google Drive para escritorio</strong> (gratis) compartida entre
          las dos PCs. No se copia el archivo de la base: solo presupuestos, clientes, vehículos,
          turnos y órdenes de trabajo en archivos JSON.
        </p>
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
            escritorio en ambas PCs. Elegí esa carpeta acá.
          </p>
        )}
      </div>

      {status?.enabled && (
        <div className="rounded-lg border border-[var(--color-panel-border)] p-3 text-xs text-ink-muted space-y-1">
          <p>
            <Cloud size={12} className="inline mr-1" />
            Dispositivo: <code className="text-ink">{status.device_id.slice(0, 8)}…</code>
          </p>
          {role === "workshop" && (
            <p>Pendientes de enviar: {status.pending_exports}</p>
          )}
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
        <p>1. Instalá Google Drive para escritorio en las dos PCs.</p>
        <p>2. Creá la carpeta «GestionComercios-Sync» en Drive (compartida o misma cuenta).</p>
        <p>3. PC taller → rol «PC taller» + esa carpeta.</p>
        <p>4. PC mostrador → rol «PC mostrador» + la misma carpeta.</p>
        <p>5. Taller: presupuestos e impresión. Mostrador: clientes y ventas. Se sincroniza solo cada ~2 min.</p>
      </div>
    </Card>
  );
}
