import { ImagePlus, Trash2, RefreshCw, Cloud, Download } from "lucide-react";
import { Card, Button } from "./ui";
import { useAppearance } from "../context/AppearanceContext";
import { BRAND_PRESETS } from "../config/branding";
import { checkAndInstallUpdate } from "../lib/updater";
import AppVersionLabel from "./AppVersionLabel";
import {
  checkDatabaseHealth,
  getAppStorageInfo,
  getConnectionStatus,
  repairDatabase,
  runBackupNow,
} from "../lib/tauri";
import { formatDbError } from "../lib/dbError";
import { useEffect, useState } from "react";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPersonalization({ onFlash }: Props) {
  const app = useAppearance();
  const [updateMsg, setUpdateMsg] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [dbMsg, setDbMsg] = useState("");
  const [dbBusy, setDbBusy] = useState(false);
  const [storageInfo, setStorageInfo] = useState<string>("");

  useEffect(() => {
    getAppStorageInfo()
      .then((s) => {
        setStorageInfo(
          `Datos de la app (acá está gestion.db):\n${s.app_data_dir}\n\nCatálogo CSV:\n${s.catalog_csv_path}\n${s.catalog_csv_ready ? "✓ Listo" : "✗ Falta — reinstalá con instalador completo o elegí CSV en Productos"}\n\nCarpeta del .exe (solo programa, no se edita):\n${s.exe_dir}`,
        );
      })
      .catch(() => setStorageInfo(""));
  }, []);

  async function handleLogoUpload() {
    try {
      await app.uploadLogo();
      onFlash("Logo guardado");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCheckUpdate(silent: boolean) {
    setCheckingUpdate(true);
    try {
      const status = await getConnectionStatus();
      if (!status.online && !silent) {
        setUpdateMsg("Sin internet: no se puede buscar actualizaciones.");
        return;
      }
      const r = await checkAndInstallUpdate(silent);
      if (r.message) setUpdateMsg(r.message);
      if (!silent && r.message) onFlash(r.message.slice(0, 80));
    } catch (e) {
      setUpdateMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCheckingUpdate(false);
    }
  }

  return (
    <>
      <AppVersionLabel variant="panel" showCopy />

      <Card>
        <h3 className="mb-1 text-base font-semibold text-ink">Personalización visual</h3>
        <p className="mb-4 text-sm text-ink-muted">
          Colores, logo y densidad de la interfaz. Tu comercio se ve con su propia identidad.
        </p>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Color principal
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {BRAND_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.label}
              onClick={() => void app.applyPreset(p.id).then(() => onFlash("Color aplicado"))}
              className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-[var(--color-panel)] transition-transform hover:scale-110 ${
                app.presetId === p.id ? "ring-brand-600" : "ring-transparent"
              }`}
              style={{ backgroundColor: p.primary }}
            />
          ))}
          <label
            title="Color personalizado"
            className={`relative h-9 w-9 shrink-0 cursor-pointer rounded-full ring-2 ring-offset-2 ring-offset-[var(--color-panel)] transition-transform hover:scale-110 ${
              app.presetId === "custom" ? "ring-brand-600" : "ring-transparent"
            }`}
            style={{ backgroundColor: app.primary }}
          >
            <input
              type="color"
              value={app.primary}
              onChange={(e) => void app.setPrimaryColor(e.target.value, "custom")}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Logo del negocio
        </p>
        <p className="mb-3 text-xs text-ink-muted">
          Se muestra en la barra lateral y en la pantalla de inicio de sesión.
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          {app.logoUrl ? (
            <img
              src={app.logoUrl}
              alt="Logo"
              className="h-32 max-w-[280px] rounded-xl border border-[var(--color-panel-border)] bg-transparent object-contain p-1"
            />
          ) : (
            <div className="flex h-32 w-40 items-center justify-center rounded-xl border border-dashed border-[var(--color-panel-border)] text-xs text-ink-muted">
              Sin logo
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleLogoUpload}>
              <ImagePlus size={16} /> Subir imagen
            </Button>
            {app.logoUrl && (
              <Button variant="ghost" onClick={() => void app.clearLogo().then(() => onFlash("Logo quitado"))}>
                <Trash2 size={16} />
              </Button>
            )}
          </div>
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Texto bajo el nombre (barra lateral)
        </p>
        <input
          className="mb-4 w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
          placeholder="Ej: Kiosco de barrio · Av. San Martín 1200"
          defaultValue={app.sidebarTitle}
          onBlur={(e) => void app.setSidebarTagline(e.target.value).then(() => onFlash("Guardado"))}
        />

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Densidad de interfaz
        </p>
        <div className="inline-flex rounded-xl border border-[var(--color-panel-border)] bg-brand-50 p-1 dark:bg-brand-900/40">
          <button
            type="button"
            onClick={() => void app.setDensity("comfortable").then(() => onFlash("Guardado"))}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              app.density === "comfortable" ? "bg-brand-600 text-white" : "text-ink-muted"
            }`}
          >
            Cómoda
          </button>
          <button
            type="button"
            onClick={() => void app.setDensity("compact").then(() => onFlash("Guardado"))}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              app.density === "compact" ? "bg-brand-600 text-white" : "text-ink-muted"
            }`}
          >
            Compacta
          </button>
        </div>

        <Button variant="ghost" className="mt-4" onClick={() => void app.resetBranding().then(() => onFlash("Restablecido"))}>
          Restablecer apariencia por defecto
        </Button>
      </Card>

      <Card>
        <h3 className="mb-1 text-base font-semibold text-ink">Base de datos</h3>
        <p className="mb-4 text-sm text-ink-muted">
          Si ves «database disk image is malformed», la base quedó dañada (a veces por importaciones
          muy grandes interrumpidas). Probá reparar antes de seguir usando la app.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={dbBusy}
            onClick={async () => {
              setDbBusy(true);
              try {
                const h = await checkDatabaseHealth();
                setDbMsg(h.message);
                onFlash(h.ok ? "Base OK" : "Revisá el mensaje");
              } catch (e) {
                setDbMsg(formatDbError(e));
              } finally {
                setDbBusy(false);
              }
            }}
          >
            Verificar integridad
          </Button>
          <Button
            variant="secondary"
            disabled={dbBusy}
            onClick={async () => {
              setDbBusy(true);
              try {
                const msg = await repairDatabase();
                setDbMsg(msg);
                onFlash("Reparación hecha — cerrá y abrí la app");
              } catch (e) {
                setDbMsg(formatDbError(e));
              } finally {
                setDbBusy(false);
              }
            }}
          >
            Reparar base de datos
          </Button>
        </div>
        {dbMsg && <p className="mt-3 text-xs text-ink-muted whitespace-pre-wrap">{dbMsg}</p>}
        {storageInfo && (
          <p className="mt-4 rounded-lg border border-[var(--color-panel-border)] bg-brand-50/30 p-3 text-xs text-ink-muted whitespace-pre-wrap dark:bg-brand-900/20">
            {storageInfo}
          </p>
        )}
      </Card>

      <Card>
        <h3 className="mb-1 text-base font-semibold text-ink">Con internet</h3>
        <p className="mb-4 text-sm text-ink-muted">
          Actualizaciones automáticas, respaldos y sincronización (cuando hay conexión).
        </p>

        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-panel-border)] bg-brand-50/50 p-4 dark:bg-brand-900/20">
            <p className="text-sm font-medium text-ink">Actualizaciones silenciosas</p>
            <p className="mt-1 text-xs text-ink-muted">
              Al abrir la app, busca parches en GitHub Releases (~6 MB). Si hay versión nueva, se
              instala y reinicia sola.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={checkingUpdate}
                onClick={() => void handleCheckUpdate(false)}
              >
                <RefreshCw size={16} className={checkingUpdate ? "animate-spin" : ""} />
                Buscar actualización ahora
              </Button>
            </div>
            {updateMsg && <p className="mt-2 text-xs text-ink-muted">{updateMsg}</p>}
          </div>

          <div className="rounded-xl border border-[var(--color-panel-border)] p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Cloud size={16} /> Backup en la nube
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Hoy: backup ZIP local (carpeta configurable). Próximo: subida encriptada a Google
              Drive / servidor propio.
            </p>
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
              <Download size={16} /> Generar backup ahora
            </Button>
          </div>

          <div className="rounded-xl border border-dashed border-[var(--color-panel-border)] p-4 opacity-90">
            <p className="text-sm font-medium text-ink-muted">Sincronización de catálogo</p>
            <p className="mt-1 text-xs text-ink-muted">
              Próximamente: precios y stock alineados con tienda online o Mercado Libre.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
