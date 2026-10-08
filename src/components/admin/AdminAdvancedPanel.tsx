import { SlidersHorizontal } from "lucide-react";
import { Card, Switch } from "../ui";
import { useAppConfig } from "../../context/AppConfig";
import type { FeatureFlags } from "../../types";

const FEATURE_LABELS: Record<keyof FeatureFlags, string> = {
  pos: "Punto de venta",
  products: "Productos",
  stock: "Stock",
  customers: "Clientes",
  reports: "Reportes",
  invoicing: "Facturación electrónica",
};

interface Props {
  embedded?: boolean;
}

export default function AdminAdvancedPanel({ embedded = false }: Props) {
  const cfg = useAppConfig();

  const switches = (
    <div className="divide-y divide-[var(--color-panel-border)]">
      {(Object.keys(FEATURE_LABELS) as (keyof FeatureFlags)[]).map((key) => {
        const enabled = cfg.features[key];
        const overridden = cfg.featureOverrides[key] !== undefined;
        return (
          <div
            key={key}
            className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{FEATURE_LABELS[key]}</p>
              {overridden && (
                <button
                  type="button"
                  onClick={() => cfg.setFeatureOverride(key, null)}
                  className="mt-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  Volver al valor del rubro
                </button>
              )}
            </div>
            <Switch checked={enabled} onChange={(v) => cfg.setFeatureOverride(key, v)} />
          </div>
        );
      })}
    </div>
  );

  if (embedded) {
    return (
      <details className="rounded-xl border border-[var(--color-panel-border)] p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
          <SlidersHorizontal size={16} className="text-brand-600" />
          Qué querés ver en WalQo
        </summary>
        <p className="mt-2 text-xs text-ink-muted">
          El menú ya se adapta al rubro. Cambiá esto solo si querés ocultar una sección.
        </p>
        <div className="mt-3">{switches}</div>
      </details>
    );
  }

  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <SlidersHorizontal size={18} className="text-brand-600 dark:text-brand-300" />
        Qué querés ver en WalQo
      </h3>
      <p className="mb-4 text-sm text-ink-muted">
        El menú ya se adapta al rubro. Cambiá esto solo si querés ocultar una sección.
      </p>
      {switches}
    </Card>
  );
}
