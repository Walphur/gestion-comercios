import { useEffect, useState } from "react";
import { ExternalLink, Globe, RefreshCw } from "lucide-react";
import { Alert, Button } from "../ui";
import { openExternalUrl } from "../../lib/openExternal";
import {
  getOwnerPortalStatus,
  pushOwnerPortalSnapshot,
  setOwnerPortalEnabled,
  type OwnerPortalStatus,
} from "../../lib/ownerPortalPush";

const PORTAL_URL = "https://walqo.pro/app/";

interface Props {
  onFlash: (msg: string) => void;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Nunca";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminOwnerPortalPanel({ onFlash }: Props) {
  const [status, setStatus] = useState<OwnerPortalStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setStatus(await getOwnerPortalStatus());
  }

  useEffect(() => {
    void reload();
  }, []);

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      await setOwnerPortalEnabled(enabled);
      if (enabled) {
        const err = await pushOwnerPortalSnapshot();
        await reload();
        if (err) {
          onFlash("Activado, pero no se pudo subir aún");
        } else {
          onFlash("Panel web activado · datos subidos");
        }
      } else {
        await reload();
        onFlash("Panel web desactivado");
      }
    } finally {
      setBusy(false);
    }
  }

  async function pushNow() {
    setBusy(true);
    try {
      const err = await pushOwnerPortalSnapshot();
      await reload();
      if (err) onFlash(err.slice(0, 80));
      else onFlash("Resumen subido al panel web");
    } finally {
      setBusy(false);
    }
  }

  const enabled = status?.enabled ?? false;

  return (
    <div className="space-y-4 min-w-0">
      <Alert variant="info">
        Mirás ventas del día y stock bajo desde el celular en{" "}
        <strong>walqo.pro/app</strong>, con la misma cuenta de WalQo. La PC de acá sube un
        resumen cada pocos minutos. No se edita nada desde la web.
      </Alert>

      <div className="rounded-xl border border-[var(--color-panel-border)] p-4 min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex items-start gap-3">
            <Globe className="shrink-0 mt-0.5 text-[var(--color-accent)]" size={22} />
            <div className="min-w-0">
              <p className="font-semibold text-ink">Panel web del dueño</p>
              <p className="text-sm text-ink-muted">
                Sube ventas de hoy, stock bajo y últimas tickets a la nube.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer select-none">
            <span className="text-sm text-ink-muted">{enabled ? "Activado" : "Apagado"}</span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--color-accent)]"
              checked={enabled}
              disabled={busy || status == null}
              onChange={(e) => void toggle(e.target.checked)}
            />
          </label>
        </div>

        <div className="grid gap-2 text-sm min-w-0 sm:grid-cols-2">
          <div className="min-w-0 rounded-lg bg-[var(--color-panel-muted)] px-3 py-2">
            <p className="text-xs uppercase text-ink-muted">Última subida</p>
            <p className="font-medium truncate">{formatWhen(status?.lastPushAt ?? null)}</p>
          </div>
          <div className="min-w-0 rounded-lg bg-[var(--color-panel-muted)] px-3 py-2">
            <p className="text-xs uppercase text-ink-muted">Estado</p>
            <p className="font-medium truncate">
              {status?.lastError ? "Con error" : enabled ? "Listo" : "Inactivo"}
            </p>
          </div>
        </div>

        {status?.lastError ? (
          <Alert variant="warning">{status.lastError}</Alert>
        ) : null}

        <div className="flex flex-wrap gap-2 min-w-0">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !enabled}
            onClick={() => void pushNow()}
          >
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
            Subir ahora
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void openExternalUrl(PORTAL_URL).catch(() => undefined)}
          >
            <ExternalLink size={16} />
            Abrir panel
          </Button>
        </div>
      </div>
    </div>
  );
}
