import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Filter, X } from "lucide-react";
import { Button } from "../ui";
import { ReportIcon } from "./ReportIcon";
import {
  REPORT_PERIOD_OPTIONS,
  type ReportPeriodChoice,
} from "../../lib/reportPeriods";
import { REPORT_SCOPE_LABELS, type ReportScope } from "../../db/reports";
import { todayYmd } from "../../lib/format";
import type { StaffUser } from "../../db/users";

export type ReportFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

type Props = {
  periodChoice: ReportPeriodChoice;
  onPeriodChange: (v: ReportPeriodChoice) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
  /** Mostrar selector de caja. */
  showScope: boolean;
  scope: ReportScope;
  onScopeChange: (v: ReportScope) => void;
  /** Mostrar selector de empleado. */
  showCashier: boolean;
  cashierId: number | null;
  onCashierChange: (v: number | null) => void;
  staff: StaffUser[];
  chips: ReportFilterChip[];
  activeFilterCount: number;
  onClearFilters: () => void;
  isSnapshot?: boolean;
};

/**
 * Encabezado compacto de filtros: un período + botón Filtros + chips.
 */
export default function ReportFiltersBar({
  periodChoice,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
  showScope,
  scope,
  onScopeChange,
  showCashier,
  cashierId,
  onCashierChange,
  staff,
  chips,
  activeFilterCount,
  onClearFilters,
  isSnapshot = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const today = todayYmd();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isSnapshot) {
    return (
      <p className="max-w-xs text-right text-xs text-ink-muted">
        Este reporte es la foto de hoy: no depende del período ni del cajero.
      </p>
    );
  }

  const hasExtraFilters = showScope || (showCashier && staff.length > 1);

  return (
    <div className="report-filters-bar flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <label className="report-filters-bar__period inline-flex min-w-0 items-center gap-1.5">
          <ReportIcon icon={CalendarDays} size="sm" className="text-ink-muted" />
          <select
            value={periodChoice}
            onChange={(e) => onPeriodChange(e.target.value as ReportPeriodChoice)}
            aria-label="Período"
            className="report-filters-bar__select max-w-[12rem] truncate"
          >
            {REPORT_PERIOD_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {periodChoice === "custom" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="sr-only" htmlFor="report-from">
              Desde
            </label>
            <input
              id="report-from"
              type="date"
              value={customFrom}
              max={today}
              onChange={(e) => onCustomFrom(e.target.value)}
              className="report-filters-bar__date"
            />
            <span className="text-xs text-ink-muted">→</span>
            <label className="sr-only" htmlFor="report-to">
              Hasta
            </label>
            <input
              id="report-to"
              type="date"
              value={customTo}
              max={today}
              onChange={(e) => onCustomTo(e.target.value)}
              className="report-filters-bar__date"
            />
          </div>
        )}

        {hasExtraFilters && (
          <div className="relative" ref={panelRef}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="relative gap-1.5"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
            >
              <ReportIcon icon={Filter} size="sm" />
              Filtros
              {activeFilterCount > 0 ? (
                <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
            {open && (
              <div
                id={panelId}
                role="dialog"
                aria-label="Filtros del reporte"
                className="report-filters-bar__panel absolute right-0 z-30 mt-1.5 w-[min(100vw-2rem,16rem)] rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-3 shadow-lg"
              >
                <div className="space-y-3">
                  {showScope && (
                    <label className="block space-y-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                        Caja
                      </span>
                      <select
                        value={scope}
                        onChange={(e) => onScopeChange(e.target.value as ReportScope)}
                        className="report-filters-bar__select w-full"
                        aria-label="Alcance del reporte"
                      >
                        <option value="consolidado">{REPORT_SCOPE_LABELS.consolidado}</option>
                        <option value="local">{REPORT_SCOPE_LABELS.local}</option>
                      </select>
                    </label>
                  )}
                  {showCashier && staff.length > 1 && (
                    <label className="block space-y-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                        Empleado
                      </span>
                      <select
                        value={cashierId ?? ""}
                        onChange={(e) =>
                          onCashierChange(e.target.value ? Number(e.target.value) : null)
                        }
                        className="report-filters-bar__select w-full"
                        aria-label="Empleado"
                      >
                        <option value="">Todos</option>
                        {staff.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.display_name}
                            {u.active ? "" : " (inactivo)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={c.onRemove}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--color-panel-border)] bg-[var(--color-panel-muted)] px-2.5 py-0.5 text-[11px] font-medium text-ink hover:border-brand-500/40"
              aria-label={`Quitar filtro ${c.label}`}
            >
              <span className="truncate">{c.label}</span>
              <ReportIcon icon={X} size="sm" className="opacity-70" />
            </button>
          ))}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-300"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
