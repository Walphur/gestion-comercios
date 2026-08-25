import { useEffect, useState } from "react";
import { Cloud, Download, FolderOpen, PlayCircle } from "lucide-react";
import { Button, Input } from "../ui";
import { formatBackupMessage } from "../../lib/backupFormat";
import { getSetting, setSetting } from "../../db/settings";
import { pickBackupFolder, runBackupNow } from "../../lib/tauri";
import { showUserError, showUserSuccess } from "../../lib/notice";
import AdminTechnicalPanel from "./AdminTechnicalPanel";

interface Props {
  onFlash: (msg: string) => void;
}

/** Mini-tutorial visual (pasos animados) — sin depender de un video externo embebido. */
function DriveBackupGuide() {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: "1. Instalá Drive para escritorio",
      body: "Descargá «Google Drive para escritorio» e iniciá sesión con la cuenta del comercio.",
    },
    {
      title: "2. Creá una carpeta",
      body: "En Mi unidad creá una carpeta, por ejemplo «WalQo-Backups», y esperá que aparezca en el Explorador de Windows.",
    },
    {
      title: "3. Elegí esa carpeta acá",
      body: "Tocá «Elegir carpeta…» y seleccioná esa carpeta de Google Drive. Cada copia se guardará también ahí.",
    },
    {
      title: "4. Listo en otras PCs",
      body: "En otra PC con Drive instalado, la misma carpeta se sincroniza sola. No hace falta USB.",
    },
  ];

  useEffect(() => {
    const t = window.setInterval(() => setStep((s) => (s + 1) % steps.length), 3500);
    return () => window.clearInterval(t);
  }, [steps.length]);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-transparent to-emerald-500/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink">
        <PlayCircle size={14} className="text-sky-600 dark:text-sky-300" />
        Mini guía · Google Drive (automática)
      </div>
      <div className="relative min-h-[4.5rem]">
        {steps.map((s, i) => (
          <div
            key={s.title}
            className={`absolute inset-0 transition-opacity duration-500 ${
              i === step ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <p className="text-sm font-semibold text-ink">{s.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{s.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {steps.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Paso ${i + 1}`}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i === step ? "bg-sky-500" : "bg-slate-400/30"
            }`}
            onClick={() => setStep(i)}
          />
        ))}
      </div>
      <a
        href="https://www.youtube.com/results?search_query=google+drive+para+escritorio+windows+tutorial"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex text-xs font-medium text-sky-700 underline dark:text-sky-300"
      >
        Ver video en YouTube (Drive para escritorio)
      </a>
    </div>
  );
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
          <DriveBackupGuide />
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
