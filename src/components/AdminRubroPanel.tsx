import { Check, Lock } from "lucide-react";
import { RUBROS, RUBROS_COMERCIO, RUBROS_SERVICIOS } from "../config/rubros";
import { useAppConfig } from "../context/AppConfig";
import { useLicense } from "../context/LicenseContext";
import type { Rubro } from "../types";

interface Props {
  onFlash: (msg: string) => void;
}

function RubroGrid({
  items,
  activeId,
  licensedPro,
  onSelect,
  onBlocked,
}: {
  items: typeof RUBROS_COMERCIO;
  activeId: Rubro;
  licensedPro: boolean;
  onSelect: (id: Rubro) => void;
  onBlocked: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((r) => {
        const active = activeId === r.id;
        const needsPro = r.planHint === "pro";
        const locked = needsPro && !licensedPro;

        return (
          <button
            key={r.id}
            type="button"
            disabled={locked}
            onClick={() => {
              if (locked) {
                onBlocked();
                return;
              }
              onSelect(r.id);
            }}
            className={`rounded-xl border-2 p-4 text-left transition-colors ${
              locked
                ? "cursor-not-allowed border-[var(--color-panel-border)] bg-slate-100/50 opacity-60 dark:bg-slate-900/40"
                : active
                  ? "border-brand-500 bg-brand-500/15 ring-1 ring-brand-500/40"
                  : "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] hover:border-brand-400"
            }`}
          >
            <p className="font-semibold text-ink">{r.label}</p>
            <p className="mt-1 text-xs text-ink-muted">{r.description}</p>
            {needsPro && (
              <span
                className={`mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${
                  licensedPro
                    ? "text-brand-600 dark:text-brand-300"
                    : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {locked ? <Lock size={10} /> : null}
                {licensedPro ? "Incluido con Pro" : "Requiere licencia Pro"}
              </span>
            )}
            {active && !locked && (
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
  const { status } = useLicense();
  const licensedPro = status?.pro_enabled ?? false;

  function selectRubro(id: Rubro) {
    if (RUBROS[id].planHint === "pro" && !licensedPro) {
      onFlash("Este rubro requiere licencia Pro. Actualizá tu licencia en Planes y módulos.");
      return;
    }
    void cfg.setRubro(id).then(() => onFlash("Rubro actualizado"));
  }

  return (
    <div className="space-y-6">
      {!licensedPro && RUBROS[cfg.rubro].planHint === "pro" && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          Tu licencia es <strong>Básica</strong> pero tenés un rubro Pro activo. Elegí un rubro de
          comercio o actualizá a licencia Pro.
        </div>
      )}

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Comercios — plan básico
        </p>
        <RubroGrid
          items={RUBROS_COMERCIO}
          activeId={cfg.rubro}
          licensedPro={licensedPro}
          onSelect={selectRubro}
          onBlocked={() =>
            onFlash("Requiere licencia Pro. Andá a Planes y módulos → Actualizar licencia.")
          }
        />
      </div>
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Servicios — licencia Pro
        </p>
        <RubroGrid
          items={RUBROS_SERVICIOS}
          activeId={cfg.rubro}
          licensedPro={licensedPro}
          onSelect={selectRubro}
          onBlocked={() =>
            onFlash("Requiere licencia Pro. Andá a Planes y módulos → Actualizar licencia.")
          }
        />
      </div>
    </div>
  );
}
