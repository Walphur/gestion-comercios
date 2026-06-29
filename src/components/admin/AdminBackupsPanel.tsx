import { useEffect, useState } from "react";
import { Cloud, Download, FolderOpen } from "lucide-react";
import { Button, Input } from "../ui";
import { formatBackupMessage } from "../../lib/backupFormat";
import { getSetting, setSetting } from "../../db/settings";
import { pickBackupFolder, runBackupNow } from "../../lib/tauri";
import { showUserError, showUserSuccess } from "../../lib/notice";
import AdminTechnicalPanel from "./AdminTechnicalPanel";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminBackupsPanel({ onFlash }: Props) {
  const [cloudBackupPath, setCloudBackupPath] = useState("");

  useEffect(() => {
    getSetting("cloud_backup_path").then((v) => {
      if (v) setCloudBackupPath(v);
    });
  }, []);

  async function saveCloudPath() {
    await setSetting("cloud_backup_path", cloudBackupPath.trim());
    onFlash("Carpeta guardada");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--color-panel-border)] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Download size={16} /> Copias de seguridad
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Guardá una copia de tus datos. Se genera automáticamente al cerrar caja y también podés
          hacerlo manualmente.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={async () => {
            try {
              const result = await runBackupNow();
              showUserSuccess(formatBackupMessage(result));
              onFlash("Copia guardada");
            } catch (e) {
              showUserError(e);
            }
          }}
        >
          <Download size={16} /> Guardar copia ahora
        </Button>

        <div className="mt-4 border-t border-[var(--color-panel-border)] pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Cloud size={14} /> Copia en la nube (opcional)
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Elegí una carpeta de Google Drive, OneDrive o Dropbox en tu PC. Cada copia se duplica ahí.
          </p>
          <Input
            label="Carpeta sincronizada"
            value={cloudBackupPath}
            onChange={(e) => setCloudBackupPath(e.target.value)}
            placeholder="Ej: carpeta de Google Drive"
            className="mt-2"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="ghost"
              className="!py-1.5 !text-xs"
              onClick={async () => {
                const path = await pickBackupFolder();
                if (path) setCloudBackupPath(path);
              }}
            >
              <FolderOpen size={14} /> Elegir carpeta…
            </Button>
            <Button variant="secondary" className="!py-1.5 !text-xs" onClick={() => void saveCloudPath()}>
              Guardar
            </Button>
          </div>
        </div>
      </section>

      <AdminTechnicalPanel onFlash={onFlash} />
    </div>
  );
}
