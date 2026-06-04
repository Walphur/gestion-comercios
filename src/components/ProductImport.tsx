import { useState } from "react";
import { Upload } from "lucide-react";
import { Button, Modal } from "./ui";
import {
  importProductsFromCsv,
  pickProductsImportFile,
  type ImportProductsResult,
} from "../lib/tauri";
import { formatDbError } from "../lib/dbError";

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
      const path = await pickProductsImportFile();
      if (!path) {
        setBusy(false);
        return;
      }
      const res = await importProductsFromCsv(path, updateExisting);
      setResult(res);
      onDone();
    } catch (e) {
      setError(formatDbError(e));
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
    <Modal open={open} title="Importar productos (Excel o CSV)" onClose={handleClose} wide>
      <div className="space-y-4 text-sm text-ink-muted">
        <p>
          Elegí un archivo <strong className="text-ink">Excel (.xlsx, .xls)</strong> o{" "}
          <strong className="text-ink">.csv</strong> con la primera fila de encabezados. Se usa la
          primera hoja del libro de Excel.
        </p>
        <p>
          Columnas reconocidas: <code className="text-brand-700">nombre</code>,{" "}
          <code className="text-brand-700">barcode</code> / <code className="text-brand-700">ean</code> /{" "}
          <code className="text-brand-700">codigo</code>, <code className="text-brand-700">precio</code>,{" "}
          <code className="text-brand-700">costo</code>, <code className="text-brand-700">stock</code>,{" "}
          <code className="text-brand-700">sku</code>, <code className="text-brand-700">categoria</code>,{" "}
          <code className="text-brand-700">marca</code>, <code className="text-brand-700">proveedor</code>,{" "}
          <code className="text-brand-700">cat1</code>, <code className="text-brand-700">cat2</code>,{" "}
          <code className="text-brand-700">cat3</code>.
        </p>
        <p className="text-xs">
          El catálogo masivo de supermercado (~190.000 filas) sigue siendo por CSV desde{" "}
          <strong>Catálogo supermercado</strong>. Para el listado de tu amigo en Excel, usá este
          importador.
        </p>
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-brand-50/40 p-3 font-mono text-xs text-ink dark:bg-brand-900/20">
          nombre | codigo | precio | costo | stock | categoria | marca
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
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/40 dark:text-red-300 whitespace-pre-wrap">
            {error}
          </p>
        )}
        {result && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
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
          <Button onClick={() => void runImport()} disabled={busy}>
            {busy ? (
              "Importando…"
            ) : (
              <>
                <Upload size={16} /> Elegir archivo e importar
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
