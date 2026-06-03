import { useEffect, useState } from "react";
import { getConnectionStatus, type SyncStatusDto } from "../lib/tauri";

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
            mode_label: "Modo Local Activo",
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

  const color = status.online
    ? status.pending_count > 0
      ? "bg-amber-400"
      : "bg-emerald-500"
    : status.pending_count > 0
      ? "bg-amber-500"
      : "bg-slate-500";

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-xs items-center gap-2 rounded-full border border-white/20 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg backdrop-blur"
      title={status.mode_label}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
      <span className="leading-tight">{status.mode_label}</span>
      {status.pending_count > 0 && (
        <span className="rounded-full bg-white/20 px-1.5 py-0.5 font-medium">
          {status.pending_count}
        </span>
      )}
    </div>
  );
}
