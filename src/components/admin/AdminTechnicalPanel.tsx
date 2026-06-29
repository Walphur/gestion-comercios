import { useState } from "react";
import { Wrench } from "lucide-react";
import { Button } from "../ui";
import { checkDatabaseHealth, repairDatabase, restoreDatabase } from "../../lib/tauri";
import { withRustDb } from "../../lib/rustDb";
import { confirmAction } from "../../lib/confirm";
import { showUserError, showUserSuccess } from "../../lib/notice";
import { formatUserError } from "../../lib/userError";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminTechnicalPanel({ onFlash }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <section className="rounded-xl border border-dashed border-[var(--color-panel-border)] p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-ink-muted"
      >
        <span className="inline-flex items-center gap-2">
          <Wrench size={16} />
          Soporte técnico avanzado
        </span>
        <span className="text-xs">{expanded ? "Ocultar" : "Mostrar"}</span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-ink-muted">
            Solo usá estas opciones si soporte WalTech te lo indica o si la app no guarda cambios.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const h = await withRustDb(() => checkDatabaseHealth());
                  setMsg(h.ok ? "Todo está en orden." : "Se detectó un problema. Contactá a soporte.");
                  onFlash(h.ok ? "Verificación OK" : "Revisá el mensaje");
                } catch (e) {
                  setMsg(formatUserError(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Verificar integridad
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await withRustDb(() => repairDatabase());
                  showUserSuccess("Se aplicó una corrección. Reiniciá la aplicación.");
                  onFlash("Corrección aplicada");
                } catch (e) {
                  showUserError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Solucionar problema
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                if (
                  !(await confirmAction({
                    title: "Restaurar copia anterior",
                    message: "¿Volver a la última copia de seguridad?",
                    detail: "Se perderán los cambios hechos después de esa copia.",
                    variant: "danger",
                    confirmLabel: "Restaurar",
                  }))
                ) {
                  return;
                }
                setBusy(true);
                try {
                  await withRustDb(() => restoreDatabase());
                  showUserSuccess("Copia restaurada. Reiniciá la aplicación.");
                  onFlash("Restaurado");
                } catch (e) {
                  showUserError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Restaurar copia anterior
            </Button>
          </div>
          {msg && <p className="text-xs text-ink-muted">{msg}</p>}
        </div>
      )}
    </section>
  );
}
