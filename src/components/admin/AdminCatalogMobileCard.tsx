import { useCallback, useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "../ui";
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
            Vence {formatWhen(status.pair_expires_at)}. En el celular abrí ese enlace y escribí el código.
            En Android, el navegador ofrece instalarla. En iPhone: Compartir y después Agregar a inicio.
          </p>
        </div>
      ) : null}

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
