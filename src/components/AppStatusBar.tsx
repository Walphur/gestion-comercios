import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import { lanStatusLabel, lanSyncGetStatus, type LanUiStatus } from "../lib/lanSync";
import ClockDisplay from "./ClockDisplay";
import CalculatorModal from "./CalculatorModal";
import WhatsAppAssistButton from "./WhatsAppAssistButton";

/** Barra inferior: red local a la izquierda; hora, calculadora y WhatsApp a la derecha. */
export default function AppStatusBar() {
  const [status, setStatus] = useState<LanUiStatus | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);

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

  const lanOn = Boolean(status && status.role !== "off" && status.enabled);
  const st = status?.status;
  const color = !lanOn
    ? "text-ink-muted"
    : st === "connected"
      ? "text-emerald-600 dark:text-emerald-400"
      : st === "syncing"
        ? "text-sky-600 dark:text-sky-400"
        : st === "connecting"
          ? "text-amber-600 dark:text-amber-400"
          : st === "error"
            ? "text-red-600 dark:text-red-400"
            : "text-ink-muted";

  const dot = !lanOn
    ? "bg-slate-400"
    : st === "connected"
      ? "bg-emerald-500"
      : st === "syncing"
        ? "bg-sky-500 animate-pulse"
        : st === "connecting"
          ? "bg-amber-400 animate-pulse"
          : st === "error"
            ? "bg-red-500"
            : "bg-slate-400";

  const roleLabel = status?.role === "server" ? "PC principal" : "Caja";

  return (
    <>
      <div
        className="flex min-w-0 items-center justify-between gap-3 border-t border-[var(--color-panel-border)] bg-[var(--color-panel)] px-3 py-1.5 text-xs"
        title={status?.last_error || undefined}
      >
        <div className={`flex min-w-0 flex-wrap items-center gap-2 ${color}`}>
          {lanOn ? (
            <>
              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
              <span className="truncate font-medium">
                Red local · {lanStatusLabel(st!)} ({roleLabel})
              </span>
              {status && status.outbox_pending > 0 && (
                <span className="text-ink-muted">
                  Pendientes: {status.outbox_pending.toLocaleString("es-AR")}
                </span>
              )}
              {status && status.clients_connected > 0 && status.role === "server" && (
                <span className="text-ink-muted">
                  {status.clients_connected} caja{status.clients_connected === 1 ? "" : "s"}
                </span>
              )}
            </>
          ) : (
            <span className="text-ink-muted">WalQo</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ClockDisplay variant="compact" className="px-1.5 tabular-nums text-ink-muted" />
          <button
            type="button"
            onClick={() => setCalcOpen(true)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition hover:bg-[var(--color-panel-muted)] hover:text-ink"
            title="Calculadora"
            aria-label="Abrir calculadora"
          >
            <Calculator size={15} />
          </button>
          <WhatsAppAssistButton />
        </div>
      </div>
      <CalculatorModal open={calcOpen} onClose={() => setCalcOpen(false)} />
    </>
  );
}
