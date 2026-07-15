import { useEffect, useState } from "react";
import { lanStatusLabel, lanSyncGetStatus, type LanUiStatus } from "../lib/lanSync";

/** Indicador permanente Sync LAN (barra inferior del layout). */
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

  return (
    <div
      className={`flex items-center gap-2 border-t border-[var(--color-panel-border)] bg-[var(--color-panel)] px-4 py-1.5 text-xs ${color}`}
      title={status.last_error || undefined}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
      <span className="font-medium">
        Sync LAN · {lanStatusLabel(st)}
        {status.role === "server" ? " (servidor)" : " (caja)"}
      </span>
      {status.pending > 0 && (
        <span className="text-ink-muted">{status.pending} pendiente(s)</span>
      )}
      {status.role === "server" && status.clients_connected > 0 && (
        <span className="text-ink-muted">{status.clients_connected} cliente(s)</span>
      )}
    </div>
  );
}
