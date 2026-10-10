import { useCallback, useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "../ui";
import { openExternalUrl } from "../../lib/openExternal";
import { formatUserError } from "../../lib/userError";
import {
  catalogMobilePair,
  catalogMobileRevoke,
  catalogMobileStatus,
  catalogMobileSyncNow,
  type CatalogMobileStatus,
} from "../../lib/catalogMobile";

interface Props {
  onFlash: (msg: string) => void;
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.4 12.7c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.9-.8-1.5 0-2.8.9-3.6 2.2-1.5 2.6-.4 6.5 1.1 8.7.7 1.1 1.6 2.3 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7 1.9-1.1 2.6-2.1c.8-1.2 1.2-2.3 1.2-2.4-.1 0-2.1-.8-2.1-3.6zM14.6 6.9c.6-.7 1-1.7.9-2.7-1 .1-2.1.6-2.7 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2.1-.5 2.8-1.4z"
      />
    </svg>
  );
}

function AndroidMark() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.2 8.2 5.4 5.4l1.3-.7 1.6 2.5A6.8 6.8 0 0 1 12 6.2c1.2 0 2.4.3 3.7 1l1.6-2.5 1.3.7-1.8 2.8A6.4 6.4 0 0 1 18.5 14v5.2h-2.6V14H8.1v5.2H5.5V14a6.4 6.4 0 0 1 1.7-5.8zM9.2 12.4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm5.6 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
      />
    </svg>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Todavía no";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminCatalogMobileCard({ onFlash }: Props) {
  const [status, setStatus] = useState<CatalogMobileStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    catalogMobileStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function pair() {
    setBusy(true);
    try {
      const next = await catalogMobilePair();
      setStatus(next);
      onFlash("Código listo. Abrilo en el celular.");
    } catch (e) {
      onFlash(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const next = await catalogMobileSyncNow();
      setStatus(next);
      onFlash("Catálogo sincronizado.");
    } catch (e) {
      onFlash(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      const next = await catalogMobileRevoke();
      setStatus(next);
      onFlash("Celular desvinculado.");
    } catch (e) {
      onFlash(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  const linked = status?.linked ?? false;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 shrink-0 text-brand-700" size={22} />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">App del celular</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Los productos, precios y cantidades viajan de la compu al celular y del celular a la
            compu. En el teléfono también están los reportes del día: ventas, pagos y stock bajo.
            Las ventas siguen cerrándose acá. WalQo tiene que estar abierto para que el celular
            se actualice.
          </p>
        </div>
      </div>

      {linked && status?.pair_code ? (
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Código</p>
          <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] text-ink">
            {status.pair_code}
          </p>
          <p className="mt-2 break-all text-sm text-ink-muted">{status.phone_url}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Vence {formatWhen(status.pair_expires_at)}. En el celular abrí walqo.pro/celular y escribí el código.
            En Android, el navegador ofrece instalarla. En el iPhone, tocá Instalar el ícono.
          </p>
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-2 gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-3 text-ink"
          onClick={() => void openExternalUrl("https://walqo.pro/celular#iphone")}
        >
          <AppleMark />
          <span className="text-sm font-semibold">Instalar en iPhone</span>
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-3 text-ink"
          onClick={() => void openExternalUrl("https://walqo.pro/celular#android")}
        >
          <AndroidMark />
          <span className="text-sm font-semibold">Instalar en Android</span>
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Abrí walqo.pro/celular en el teléfono. Ahí queda el ícono de Apple o de Android.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void pair()}>
          {linked ? "Nuevo código" : "Generar código"}
        </Button>
        {linked ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void syncNow()}>
            Sincronizar ahora
          </Button>
        ) : null}
        {linked ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void revoke()}>
            Desvincular
          </Button>
        ) : null}
      </div>

      {linked ? (
        <p className="text-sm text-ink-muted">
          Última sincronización: {formatWhen(status?.last_sync_at ?? null)}
          {status?.phones ? ` · ${status.phones} celular${status.phones === 1 ? "" : "es"}` : ""}
          {status?.conflicts ? ` · ${status.conflicts} cambios para revisar` : ""}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          La primera vez puede tardar unos minutos si hay muchos productos.
        </p>
      )}

      {status?.last_error ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">{status.last_error}</p>
      ) : null}
    </div>
  );
}
