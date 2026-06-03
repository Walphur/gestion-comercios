import { useEffect, useState } from "react";
import { getConnectionStatus, type SyncStatusDto } from "../lib/tauri";

/** Indicador de conexión integrado en el sidebar (sobre Administración). */
export default function SyncStatusBadge() {
  const [status, setStatus] = useState<SyncStatusDto | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await getConnectionStatus();
        if (alive) setStatus(s);
      } catch {
        if (alive) {
          setStatus({
            online: false,
            pending_count: 0,
            worker_active: false,
            mode_label: "Modo local activo",
          });
        }
      }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!status) return null;

  const dot = status.online
    ? status.pending_count > 0
      ? "bg-emerald-400 animate-pulse"
      : "bg-emerald-400"
    : status.pending_count > 0
      ? "bg-amber-400 animate-pulse"
      : "bg-brand-400/80";

  return (
    <div
      className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-brand-100/90"
      title={status.mode_label}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1 truncate font-medium leading-snug">{status.mode_label}</span>
      {status.pending_count > 0 && (
        <span className="shrink-0 rounded-full bg-brand-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {status.pending_count}
        </span>
      )}
    </div>
  );
}
