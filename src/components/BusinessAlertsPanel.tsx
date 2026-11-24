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
  critical: "border-[var(--color-danger)]/45 bg-[var(--color-danger-bg)]",
  warning: "border-[var(--color-warning)]/40 bg-[var(--color-warning-bg)]",
  info: "border-[var(--color-info,#0ea5e9)]/30 bg-[var(--color-info-bg,#eff6ff)]",
};

const SEVERITY_ICON: Record<BusinessAlertSeverity, ReactNode> = {
  critical: <AlertTriangle size={16} className="shrink-0 text-semantic-danger" />,
  warning: <AlertTriangle size={16} className="shrink-0 text-semantic-warning" />,
  info: <Info size={16} className="shrink-0 text-semantic-info" />,
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
        <p className="rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success-bg)] px-3 py-2.5 text-sm text-ink">
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
          <span className="rounded-full bg-[var(--color-danger-bg)] px-2 py-0.5 text-xs font-semibold text-semantic-danger">
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
                <ul className="max-h-64 space-y-2 overflow-y-auto border-t border-black/10 px-3 py-2.5 dark:border-white/10">
                  {list.map((a) => (
                    <li
                      key={a.id}
                      className={
                        severity === "critical"
                          ? "rounded-lg border border-[var(--color-danger)]/35 bg-[var(--color-panel)] px-3 py-2"
                          : "rounded-lg bg-[var(--color-panel)]/55 px-3 py-2"
                      }
                    >
                      <div className="min-w-0">
                        <span
                          className={
                            severity === "critical"
                              ? "text-sm font-semibold text-semantic-danger"
                              : "text-sm font-semibold text-ink"
                          }
                        >
                          {a.title}
                        </span>
                        <p
                          className={
                            severity === "critical"
                              ? "mt-0.5 text-sm text-ink"
                              : "mt-0.5 text-sm text-ink-muted"
                          }
                        >
                          {a.message}
                        </p>
                        <Link
                          to={a.link}
                          className={
                            severity === "critical"
                              ? "mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-semantic-danger hover:underline"
                              : "mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                          }
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
