import { useEffect, useState } from "react";
import { lanStatusLabel, lanSyncGetStatus, type LanUiStatus } from "../lib/lanSync";

/** Indicador permanente de sincronización entre PCs (barra inferior). */
export default function LanSyncIndicator() {
  const [status, setStatus] = useState<LanUiStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const s = await lanSyncGetStatus();
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setStatus(null);
      }
    }
    void tick();
    const id = setInterval(() => void tick(), 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!status || status.role === "off" || !status.enabled) {
    return null;
  }

  const st = status.status;
  const color =
    st === "connected"
      ? "text-emerald-600 dark:text-emerald-400"
      : st === "syncing"
        ? "text-sky-600 dark:text-sky-400"
        : st === "connecting"
          ? "text-amber-600 dark:text-amber-400"
          : st === "error"
            ? "text-red-600 dark:text-red-400"
            : "text-ink-muted";

  const dot =
    st === "connected"
      ? "bg-emerald-500"
      : st === "syncing"
        ? "bg-sky-500 animate-pulse"
        : st === "connecting"
          ? "bg-amber-400 animate-pulse"
          : st === "error"
            ? "bg-red-500"
            : "bg-slate-400";

  const roleLabel = status.role === "server" ? "PC principal" : "Caja";

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-2 border-t border-[var(--color-panel-border)] bg-[var(--color-panel)] px-4 py-1.5 text-xs ${color}`}
      title={status.last_error || undefined}
    >
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="font-medium">
        Red local · {lanStatusLabel(st)} ({roleLabel})
      </span>
      {status.outbox_pending > 0 && (
        <span className="text-ink-muted">
          Pendientes: {status.outbox_pending.toLocaleString("es-AR")}
        </span>
      )}
      {status.deferred_pending > 0 && (
        <span className="text-ink-muted">
          En espera: {status.deferred_pending.toLocaleString("es-AR")}
        </span>
      )}
      {status.conflicts_open > 0 && (
        <span className="text-ink-muted">
          Conflictos: {status.conflicts_open.toLocaleString("es-AR")}
        </span>
      )}
      {status.outbox_pending === 0 && status.pending > 0 && (
        <span className="text-ink-muted">
          {status.pending.toLocaleString("es-AR")} pendiente(s)
        </span>
      )}
      {status.role === "server" && status.clients_connected > 0 && (
        <span className="text-ink-muted">
          {status.clients_connected} caja{status.clients_connected === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
