import { useEffect, useState } from "react";
import { Tag } from "lucide-react";
import { getSetting, setSetting } from "../../db/settings";
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

export default function AdminLabelsCard({ onFlash }: Props) {
  const [widthMm, setWidthMm] = useState("50");
  const [heightMm, setHeightMm] = useState("30");
  const [showSku, setShowSku] = useState(true);
  const [copies, setCopies] = useState("1");

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

  async function save() {
    await setSetting(LABEL_WIDTH_MM_KEY, String(Math.min(100, Math.max(30, Number(widthMm) || 50))));
    await setSetting(LABEL_HEIGHT_MM_KEY, String(Math.min(80, Math.max(20, Number(heightMm) || 30))));
    await setSetting(LABEL_SHOW_SKU_KEY, showSku ? "1" : "0");
    await setSetting(LABEL_COPIES_KEY, String(Math.min(20, Math.max(1, Number(copies) || 1))));
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
      <div className="mt-4 flex justify-end">
        <Button onClick={() => void save()}>Guardar etiquetas</Button>
      </div>
    </Card>
  );
}
