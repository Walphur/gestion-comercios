import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";
import { Card } from "./ui";
import { getSetting, setSetting } from "../db/settings";
import { openExternalUrl } from "../lib/openExternal";

const GUIDES = [
  { title: "Cargar un producto", href: "https://walqo.pro/guias/#producto" },
  { title: "Hacer una venta", href: "https://walqo.pro/guias/#venta" },
  { title: "Conectar Tienda Nube", href: "https://walqo.pro/guias/#tiendanube" },
];

/** Solo comercios que acaban de crear la cuenta. No se muestra en la web pública. */
export default function StarterGuides() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSetting("show_starter_guides"), getSetting("starter_guides_dismissed")])
      .then(([show, dismissed]) => {
        if (!cancelled) setVisible(show === "1" && dismissed !== "1");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <Card className="border-brand-400/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Para arrancar</h2>
          <p className="mt-1 text-sm text-ink-muted">Tres videos cortos. Después los podés cerrar.</p>
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-ink-muted hover:bg-brand-50 hover:text-ink dark:hover:bg-brand-950/40"
          aria-label="Cerrar las guías"
          onClick={() => {
            setVisible(false);
            void setSetting("starter_guides_dismissed", "1");
          }}
        >
          <X size={16} />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {GUIDES.map((guide) => (
          <button
            key={guide.href}
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm font-medium text-ink hover:border-brand-400"
            onClick={() => {
              void openExternalUrl(guide.href);
            }}
          >
            <Play size={14} className="text-brand-500" />
            {guide.title}
          </button>
        ))}
      </div>
    </Card>
  );
}
