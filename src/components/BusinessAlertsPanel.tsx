import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, ChevronDown, Info } from "lucide-react";
import { Card } from "../components/ui";
import type { BusinessAlert, BusinessAlertSeverity } from "../db/intelligence/alertTypes";

const SEVERITY_LABEL: Record<BusinessAlertSeverity, string> = {
  critical: "Crítica",
  warning: "Atención",
  info: "Info",
};

const SEVERITY_CLASS: Record<BusinessAlertSeverity, string> = {
  critical: "border-red-500/40 bg-red-500/10",
  warning: "border-amber-500/40 bg-amber-500/10",
  info: "border-sky-500/30 bg-sky-500/8",
};

const SEVERITY_ICON: Record<BusinessAlertSeverity, ReactNode> = {
  critical: <AlertTriangle size={16} className="shrink-0 text-red-600 dark:text-red-400" />,
  warning: <AlertTriangle size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />,
  info: <Info size={16} className="shrink-0 text-sky-600 dark:text-sky-400" />,
};

const GROUP_ORDER: BusinessAlertSeverity[] = ["critical", "warning", "info"];

export function BusinessAlertsPanel({
  alerts,
  critical_count,
  warning_count,
}: {
  alerts: BusinessAlert[];
  critical_count: number;
  warning_count: number;
}) {
  const groups = useMemo(() => {
    const map: Record<BusinessAlertSeverity, BusinessAlert[]> = {
      critical: [],
      warning: [],
      info: [],
    };
    for (const a of alerts) map[a.severity].push(a);
    return map;
  }, [alerts]);

  const [open, setOpen] = useState<Record<BusinessAlertSeverity, boolean>>({
    critical: true,
    warning: critical_count === 0,
    info: critical_count === 0 && warning_count === 0,
  });

  if (alerts.length === 0) {
    return (
      <Card className="min-w-0">
        <h2 className="mb-2 font-display text-base font-semibold text-ink">Alertas</h2>
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm text-ink">
          Sin alertas activas — el negocio no muestra señales críticas según las reglas actuales.
        </p>
      </Card>
    );
  }

  return (
    <Card className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-base font-semibold text-ink">Alertas</h2>
        {critical_count > 0 && (
          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
            {critical_count} crítica{critical_count === 1 ? "" : "s"}
          </span>
        )}
        {warning_count > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
            {warning_count} atención
          </span>
        )}
        <span className="text-xs text-ink-muted">{alerts.length} en total</span>
      </div>

      <div className="space-y-2">
        {GROUP_ORDER.map((severity) => {
          const list = groups[severity];
          if (list.length === 0) return null;
          const isOpen = open[severity];
          return (
            <div
              key={severity}
              className={`overflow-hidden rounded-xl border ${SEVERITY_CLASS[severity]}`}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                onClick={() => setOpen((prev) => ({ ...prev, [severity]: !prev[severity] }))}
                aria-expanded={isOpen}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  {SEVERITY_ICON[severity]}
                  <span className="text-sm font-semibold text-ink">
                    {SEVERITY_LABEL[severity]}
                    <span className="ml-1.5 font-medium text-ink-muted">({list.length})</span>
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <ul className="max-h-64 space-y-2 overflow-y-auto border-t border-black/5 px-3 py-2.5 dark:border-white/10">
                  {list.map((a) => (
                    <li key={a.id} className="rounded-lg bg-[var(--color-panel)]/55 px-3 py-2">
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-ink">{a.title}</span>
                        <p className="mt-0.5 text-sm text-ink-muted">{a.message}</p>
                        <Link
                          to={a.link}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Ver detalle <ArrowUpRight size={12} />
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
