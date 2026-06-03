import { useState } from "react";
import { Upload } from "lucide-react";
import { Button, Modal } from "./ui";
import { importProductsFromCsv, pickProductsCsvFile, type ImportProductsResult } from "../lib/tauri";

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export default function ProductImport({ open, onClose, onDone }: Props) {
  const [updateExisting, setUpdateExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportProductsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const path = await pickProductsCsvFile();
      if (!path) {
        setBusy(false);
        return;
      }
      const res = await importProductsFromCsv(path, updateExisting);
      setResult(res);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setResult(null);
    setError(null);
    onClose();
  }

  return (
    <Modal open={open} title="Importar productos (CSV)" onClose={handleClose}>
      <div className="space-y-4 text-sm text-ink-muted">
        <p>
          Elegí un archivo <strong className="text-ink">.csv</strong> con encabezados. Columnas
          reconocidas: <code className="text-brand-700">barcode</code>,{" "}
          <code className="text-brand-700">nombre</code>, <code className="text-brand-700">precio</code>,{" "}
          <code className="text-brand-700">costo</code>, <code className="text-brand-700">stock</code>,{" "}
          <code className="text-brand-700">sku</code>, <code className="text-brand-700">categoria</code>.
        </p>
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 font-mono text-xs text-brand-900">
          barcode,nombre,precio,costo,stock,sku,categoria
          <br />
          7790001001001,Coca 500ml,1200,800,24,,Bebidas
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-ink">
          <input
            type="checkbox"
            checked={updateExisting}
            onChange={(e) => setUpdateExisting(e.target.checked)}
            className="rounded border-brand-300 text-brand-600"
          />
          Actualizar productos si el código ya existe
        </label>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
        )}
        {result && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-emerald-900">
            <p>
              <strong>{result.inserted}</strong> nuevos · <strong>{result.updated}</strong>{" "}
              actualizados · <strong>{result.skipped}</strong> omitidos
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-24 list-disc overflow-y-auto pl-4 text-xs">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            Cerrar
          </Button>
          <Button onClick={runImport} disabled={busy}>
            {busy ? (
              "Importando…"
            ) : (
              <>
                <Upload size={16} /> Elegir CSV e importar
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
