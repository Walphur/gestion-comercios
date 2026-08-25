import { useEffect, useMemo, useState } from "react";
import { Eye, Tag } from "lucide-react";
import { getSetting, setSetting } from "../../db/settings";
import { formatMoney } from "../../lib/format";
import { useAppConfig } from "../../context/AppConfig";
import { Button, Card, Input } from "../ui";
import {
  LABEL_COPIES_KEY,
  LABEL_HEIGHT_MM_KEY,
  LABEL_SHOW_SKU_KEY,
  LABEL_WIDTH_MM_KEY,
} from "../../lib/prints/productLabels";

interface Props {
  onFlash: (msg: string) => void;
}

const DEMO_PRODUCT = {
  name: "Producto de ejemplo",
  sku: "DEMO-001",
  barcode: "7790001001001",
  price: 1250,
};

export default function AdminLabelsCard({ onFlash }: Props) {
  const { currency } = useAppConfig();
  const [widthMm, setWidthMm] = useState("50");
  const [heightMm, setHeightMm] = useState("30");
  const [showSku, setShowSku] = useState(true);
  const [copies, setCopies] = useState("1");
  const [showDemo, setShowDemo] = useState(true);

  useEffect(() => {
    Promise.all([
      getSetting(LABEL_WIDTH_MM_KEY),
      getSetting(LABEL_HEIGHT_MM_KEY),
      getSetting(LABEL_SHOW_SKU_KEY),
      getSetting(LABEL_COPIES_KEY),
    ]).then(([w, h, sku, c]) => {
      setWidthMm(w ?? "50");
      setHeightMm(h ?? "30");
      setShowSku(sku !== "0");
      setCopies(c ?? "1");
    });
  }, []);

  const preview = useMemo(() => {
    const w = Math.min(100, Math.max(30, Number(widthMm) || 50));
    const h = Math.min(80, Math.max(20, Number(heightMm) || 30));
    const n = Math.min(20, Math.max(1, Number(copies) || 1));
    return { w, h, n };
  }, [widthMm, heightMm, copies]);

  async function save() {
    await setSetting(LABEL_WIDTH_MM_KEY, String(preview.w));
    await setSetting(LABEL_HEIGHT_MM_KEY, String(preview.h));
    await setSetting(LABEL_SHOW_SKU_KEY, showSku ? "1" : "0");
    await setSetting(LABEL_COPIES_KEY, String(preview.n));
    onFlash("Preferencias de etiquetas guardadas");
  }

  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <Tag size={18} className="text-brand-600 dark:text-brand-300" />
        Etiquetas de productos
      </h3>
      <p className="mb-4 text-sm text-ink-muted">
        Tamaño al imprimir desde Productos (selección → Imprimir etiquetas). Se abre el diálogo de
        impresión de Windows / «Guardar como PDF».
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="Ancho (mm)"
          type="number"
          min={30}
          max={100}
          value={widthMm}
          onChange={(e) => setWidthMm(e.target.value)}
        />
        <Input
          label="Alto (mm)"
          type="number"
          min={20}
          max={80}
          value={heightMm}
          onChange={(e) => setHeightMm(e.target.value)}
        />
        <Input
          label="Copias por producto"
          type="number"
          min={1}
          max={20}
          value={copies}
          onChange={(e) => setCopies(e.target.value)}
        />
        <label className="flex items-end gap-2 pb-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={showSku}
            onChange={(e) => setShowSku(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-panel-border)]"
          />
          Mostrar SKU
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => setShowDemo((v) => !v)}>
          <Eye size={16} />
          {showDemo ? "Ocultar demostración" : "Ver demostración"}
        </Button>
        <Button onClick={() => void save()}>Guardar etiquetas</Button>
      </div>

      {showDemo && (
        <div className="mt-4 rounded-xl border border-dashed border-brand-400/40 bg-brand-50/40 p-4 dark:bg-brand-950/20">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Vista previa en vivo · {preview.w}×{preview.h} mm
            {preview.n > 1 ? ` · ${preview.n} copias` : ""}
          </p>
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: Math.min(preview.n, 4) }, (_, i) => (
              <div
                key={i}
                className="flex flex-col justify-between rounded-md border border-slate-300 bg-white p-2 text-slate-900 shadow-sm dark:border-slate-600"
                style={{
                  width: `${Math.max(96, preview.w * 2.2)}px`,
                  height: `${Math.max(64, preview.h * 2.2)}px`,
                }}
              >
                <p className="line-clamp-2 text-[11px] font-bold leading-tight">{DEMO_PRODUCT.name}</p>
                <p className="text-sm font-extrabold tabular-nums">
                  {formatMoney(DEMO_PRODUCT.price, currency)}
                </p>
                {showSku && (
                  <p className="text-[10px] text-slate-500">SKU {DEMO_PRODUCT.sku}</p>
                )}
                <div className="mt-auto space-y-0.5 text-center">
                  <div
                    className="mx-auto h-6 w-[85%] bg-[repeating-linear-gradient(90deg,#111_0_1px,transparent_1px_3px)] opacity-80"
                    aria-hidden
                  />
                  <p className="font-mono text-[9px] tracking-wider text-slate-600">
                    {DEMO_PRODUCT.barcode}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {preview.n > 4 && (
            <p className="mt-2 text-xs text-ink-muted">Se muestran 4 de {preview.n} copias.</p>
          )}
        </div>
      )}
    </Card>
  );
}
