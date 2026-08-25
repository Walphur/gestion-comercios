import { Check, Lock } from "lucide-react";
import { RUBROS, RUBROS_COMERCIO, RUBROS_SERVICIOS } from "../config/rubros";
import { rubroIcon } from "../config/rubroIcons";
import { PRO_MODULES } from "../config/modules";
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
        const Icon = rubroIcon(r.icon);

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
            className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
              locked
                ? "cursor-not-allowed border-[var(--color-panel-border)] bg-slate-100/50 opacity-60 dark:bg-slate-900/40"
                : active
                  ? "border-emerald-500/70 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                  : "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] hover:border-brand-400 hover:bg-brand-500/5"
            }`}
          >
            {active && !locked && (
              <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                <Check size={12} strokeWidth={3} />
                Activo
              </span>
            )}

            <div className="flex items-start gap-3 pr-16">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  active && !locked
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                    : locked
                      ? "bg-slate-500/10 text-ink-muted"
                      : "bg-brand-500/15 text-brand-600 dark:text-brand-300"
                }`}
              >
                <Icon size={22} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-ink">{r.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">{r.description}</p>
              </div>
            </div>

            {needsPro && (
              <span
                className={`mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  licensedPro
                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    : "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                }`}
              >
                {locked ? <Lock size={10} /> : null}
                {licensedPro ? "Incluido con Pro" : "Requiere licencia Pro"}
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
    void (async () => {
      await cfg.setRubro(id);
      // En comercios (kiosco, etc.) los módulos Pro vienen destildados; se pueden activar a mano.
      if (RUBROS[id].group === "comercio") {
        for (const m of PRO_MODULES) {
          if (cfg.proModules[m.key]) await cfg.setProModule(m.key, false);
        }
      }
      onFlash("Rubro actualizado");
    })();
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
          items={RUBROS_COMERCIO.filter((r) => r.planHint !== "pro")}
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
          Comercios grandes — licencia Pro
        </p>
        <RubroGrid
          items={RUBROS_COMERCIO.filter((r) => r.planHint === "pro")}
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
