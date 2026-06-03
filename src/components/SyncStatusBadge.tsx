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
      ? "bg-amber-400 shadow-amber-400/50"
      : "bg-brand-300 shadow-brand-300/50"
    : status.pending_count > 0
      ? "bg-amber-400"
      : "bg-brand-400/80";

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-2.5 rounded-2xl border border-brand-700/30 bg-brand-950/92 px-4 py-2.5 text-xs text-brand-100 shadow-lg shadow-brand-950/30 backdrop-blur-md"
      title={status.mode_label}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ${dot}`} />
      <span className="font-medium leading-snug">{status.mode_label}</span>
      {status.pending_count > 0 && (
        <span className="rounded-full bg-brand-600/80 px-2 py-0.5 font-semibold text-white">
          {status.pending_count}
        </span>
      )}
    </div>
  );
}
