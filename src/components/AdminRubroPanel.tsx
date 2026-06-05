import { Check } from "lucide-react";
import { RUBROS, RUBROS_COMERCIO, RUBROS_SERVICIOS } from "../config/rubros";
import { useAppConfig } from "../context/AppConfig";
import type { Rubro } from "../types";

interface Props {
  onFlash: (msg: string) => void;
}

function RubroGrid({
  items,
  activeId,
  onSelect,
}: {
  items: typeof RUBROS_COMERCIO;
  activeId: Rubro;
  onSelect: (id: Rubro) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((r) => {
        const active = activeId === r.id;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r.id)}
            className={`rounded-xl border-2 p-4 text-left transition-colors ${
              active
                ? "border-brand-500 bg-brand-500/15 ring-1 ring-brand-500/40"
                : "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] hover:border-brand-400"
            }`}
          >
            <p className="font-semibold text-ink">{r.label}</p>
            <p className="mt-1 text-xs text-ink-muted">{r.description}</p>
            {r.planHint === "pro" && (
              <span className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">
                Recomendado con Pro
              </span>
            )}
            {active && (
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-300">
                <Check size={13} /> Activo
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminRubroPanel({ onFlash }: Props) {
  const cfg = useAppConfig();

  function selectRubro(id: Rubro) {
    void cfg.setRubro(id).then(() => {
      onFlash("Rubro actualizado");
      if (RUBROS[id].planHint === "pro" && !cfg.proPlanEnabled) {
        setTimeout(
          () =>
            onFlash("Tip: activá el Plan Pro para turnos y presupuestos"),
          400,
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Comercios — plan básico
        </p>
        <RubroGrid items={RUBROS_COMERCIO} activeId={cfg.rubro} onSelect={selectRubro} />
      </div>
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Servicios — con módulo Pro
        </p>
        <RubroGrid items={RUBROS_SERVICIOS} activeId={cfg.rubro} onSelect={selectRubro} />
      </div>
    </div>
  );
}
