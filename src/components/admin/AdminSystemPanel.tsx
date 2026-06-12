import { useEffect, useState } from "react";
import { Cloud, Download, RefreshCw } from "lucide-react";
import { Button } from "../ui";
import AppVersionLabel from "../AppVersionLabel";
import AdminWorkshopSyncPanel from "../AdminWorkshopSyncPanel";
import AdminSupportLegalPanel from "./AdminSupportLegalPanel";
import { checkAndInstallUpdate } from "../../lib/updater";
import {
  checkDatabaseHealth,
  getAppStorageInfo,
  getConnectionStatus,
  repairDatabase,
  restoreDatabase,
  runBackupNow,
} from "../../lib/tauri";
import { formatDbError } from "../../lib/dbError";
import { withRustDb } from "../../lib/rustDb";
import { confirmAction } from "../../lib/confirm";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminSystemPanel({ onFlash }: Props) {
  const [updateMsg, setUpdateMsg] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [dbMsg, setDbMsg] = useState("");
  const [dbBusy, setDbBusy] = useState(false);
  const [storageInfo, setStorageInfo] = useState("");

  useEffect(() => {
    getAppStorageInfo()
      .then((s) => {
        setStorageInfo(
          `Datos: ${s.app_data_dir}\nCatálogo: ${s.catalog_csv_path}\nPrograma: ${s.exe_dir}`,
        );
      })
      .catch(() => setStorageInfo(""));
  }, []);

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
      setUpdateMsg(e instanceof Error ? e.message : String(e));
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
          La app busca parches al iniciar. Acá podés forzar la búsqueda.
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

      <AdminWorkshopSyncPanel onFlash={onFlash} />

      <AdminSupportLegalPanel />

      <section className="rounded-xl border border-[var(--color-panel-border)] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Cloud size={16} /> Backup local
        </p>
        <p className="mt-1 text-xs text-ink-muted">Genera un ZIP de la base de datos.</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={async () => {
            try {
              const path = await runBackupNow();
              onFlash(`Backup: ${path}`);
            } catch (e) {
              alert(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          <Download size={16} /> Generar backup
        </Button>
      </section>

      <section className="rounded-xl border border-[var(--color-panel-border)] p-4">
        <p className="text-sm font-semibold text-ink">Base de datos</p>
        <p className="mt-1 text-xs text-ink-muted">Verificar, reparar o restaurar desde copia .bak</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={dbBusy}
            onClick={async () => {
              setDbBusy(true);
              try {
                const h = await withRustDb(() => checkDatabaseHealth());
                setDbMsg(h.message);
                onFlash(h.ok ? "Base OK" : "Revisá el mensaje");
              } catch (e) {
                setDbMsg(formatDbError(e));
              } finally {
                setDbBusy(false);
              }
            }}
          >
            Verificar
          </Button>
          <Button
            variant="secondary"
            disabled={dbBusy}
            onClick={async () => {
              setDbBusy(true);
              try {
                const msg = await withRustDb(() => repairDatabase());
                setDbMsg(msg);
                onFlash("Reparación lista — reiniciá la app");
              } catch (e) {
                setDbMsg(formatDbError(e));
              } finally {
                setDbBusy(false);
              }
            }}
          >
            Reparar
          </Button>
          <Button
            variant="secondary"
            disabled={dbBusy}
            onClick={async () => {
              if (
                !(await confirmAction({
                  title: "Restaurar base de datos",
                  message: "¿Usar la copia gestion.db.bak?",
                  detail: "Se pierden cambios posteriores al respaldo.",
                  variant: "danger",
                  confirmLabel: "Restaurar",
                }))
              ) {
                return;
              }
              setDbBusy(true);
              try {
                const msg = await withRustDb(() => restoreDatabase());
                setDbMsg(msg);
                onFlash("Restaurado — reiniciá la app");
              } catch (e) {
                setDbMsg(formatDbError(e));
              } finally {
                setDbBusy(false);
              }
            }}
          >
            Restaurar .bak
          </Button>
        </div>
        {dbMsg && <p className="mt-3 text-xs text-ink-muted whitespace-pre-wrap">{dbMsg}</p>}
        {storageInfo && (
          <p className="mt-3 rounded-lg bg-brand-50/30 p-3 text-xs text-ink-muted whitespace-pre-wrap dark:bg-brand-900/20">
            {storageInfo}
          </p>
        )}
      </section>
    </div>
  );
}
