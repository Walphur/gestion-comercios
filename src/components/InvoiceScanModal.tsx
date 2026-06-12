import { useRef, useState } from "react";
import { Camera, Sparkles } from "lucide-react";
import { Modal, Button } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Escaneo de factura con IA — preparado para integrar OCR/visión en una versión futura.
 * Hoy permite elegir imagen y muestra el flujo previsto (margen, alta automática).
 */
export default function InvoiceScanModal({ open: isOpen, onClose }: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [margin, setMargin] = useState("30");
  const fileRef = useRef<HTMLInputElement>(null);

  function onFilePicked(file: File | undefined) {
    if (file) setFileName(file.name);
  }

  function handleAnalyze() {
    alert(
      "Escanear factura con IA estará disponible en una próxima actualización.\n\n" +
        "Se leerá la foto, se detectarán productos, cantidades y precios, se te preguntará el margen de ganancia esperado y se cargarán al stock.\n\n" +
        "Mientras tanto: usá «Importar» (Excel/CSV o catálogo super) o alta manual.",
    );
  }

  return (
    <Modal open={isOpen} title="Factura con IA (próximamente)" onClose={onClose} wide>
      <div className="flex gap-3 rounded-xl border border-brand-200/80 bg-brand-50/60 p-4 dark:border-brand-800 dark:bg-brand-900/30">
        <Sparkles className="shrink-0 text-brand-600 dark:text-brand-300" size={22} />
        <p className="text-sm text-ink-muted">
          Sacá una foto de la factura de compra. La app detectará ítems, stock y precios,
          te pedirá el margen de venta y podrá dar de alta los productos automáticamente.
          Requiere conexión y servicio de visión (en desarrollo).
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Imagen de factura</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFilePicked(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            className="w-full"
          >
            <Camera size={16} /> Elegir foto
          </Button>
          {fileName && (
            <p className="mt-2 truncate text-xs text-ink-muted">{fileName}</p>
          )}
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-muted">
            Margen de ganancia esperado (%)
          </span>
          <input
            type="number"
            className="w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2.5 text-sm text-ink"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        <Button onClick={handleAnalyze} disabled={!fileName}>
          Analizar factura
        </Button>
      </div>
    </Modal>
  );
}
