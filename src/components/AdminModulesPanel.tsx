import { Sparkles } from "lucide-react";
import {
  BASIC_PLAN_FEATURES,
  PRO_MODULES,
  type ProModuleKey,
} from "../config/modules";
import { useAppConfig } from "../context/AppConfig";
import { Switch } from "./ui";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminModulesPanel({ onFlash }: Props) {
  const cfg = useAppConfig();

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--color-panel-border)] bg-brand-50/40 p-4 dark:bg-brand-900/20">
        <p className="text-sm font-semibold text-ink">Plan Básico</p>
        <p className="mt-1 text-xs text-ink-muted">Incluido siempre — kiosco, farmacia, ferretería, pet shop, etc.</p>
        <ul className="mt-3 space-y-1 text-xs text-ink-muted">
          {BASIC_PLAN_FEATURES.map((f) => (
            <li key={f}>· {f}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-brand-300/60 bg-gradient-to-br from-brand-50/80 to-transparent p-4 dark:border-brand-700 dark:from-brand-900/30">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Sparkles size={16} className="text-brand-600 dark:text-brand-300" />
              Plan Pro (módulo de pago)
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Desbloquea turnos, presupuestos, remitos y órdenes de servicio para talleres, clínicas,
              estética, peluquerías y barberías.
            </p>
          </div>
          <Switch
            checked={cfg.proPlanEnabled}
            onChange={(v) => {
              void cfg.setProPlanEnabled(v).then(() =>
                onFlash(v ? "Plan Pro activado" : "Plan Pro desactivado"),
              );
            }}
          />
        </div>

        {cfg.proPlanEnabled && (
          <div className="mt-4 divide-y divide-[var(--color-panel-border)] border-t border-[var(--color-panel-border)] pt-4">
            {PRO_MODULES.map((m) => (
              <div key={m.key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{m.label}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{m.description}</p>
                </div>
                <Switch
                  checked={cfg.proModules[m.key as ProModuleKey]}
                  onChange={(v) => {
                    void cfg.setProModule(m.key, v).then(() =>
                      onFlash(v ? `${m.label} activado` : `${m.label} desactivado`),
                    );
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
