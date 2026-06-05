import { Switch } from "../ui";
import { useAppConfig } from "../../context/AppConfig";
import type { FeatureFlags } from "../../types";

const FEATURE_LABELS: Record<keyof FeatureFlags, string> = {
  pos: "Punto de venta",
  products: "Productos",
  stock: "Stock",
  customers: "Clientes",
  reports: "Reportes",
  invoicing: "Facturación (ARCA)",
};

export default function AdminAdvancedPanel() {
  const cfg = useAppConfig();

  return (
    <div>
      <p className="mb-4 text-sm text-ink-muted">
        Ocultá secciones del menú. Por defecto se ajustan según el rubro.
      </p>
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
    </div>
  );
}
