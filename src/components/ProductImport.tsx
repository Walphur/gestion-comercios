import { useState } from "react";
import { Upload } from "lucide-react";
import { Button, Modal } from "./ui";
import {
  importProductsFromCsv,
  pickProductsImportFile,
  type ImportProductsResult,
} from "../lib/tauri";
import { formatDbError, isDbCorruptionError } from "../lib/dbError";
import { withRustDb } from "../lib/rustDb";

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
      const res = await withRustDb(async () => {
        const path = await pickProductsImportFile();
        if (!path) return null;
        return importProductsFromCsv(path, updateExisting);
      });
      if (!res) {
        setBusy(false);
        return;
      }
      setResult(res);
      onDone();
    } catch (e) {
      const msg = formatDbError(e);
      setError(
        isDbCorruptionError(e)
          ? `${msg}\n\nAdministración → «Restaurar desde copia .bak», cerrá y abrí la app.`
          : msg,
      );
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
          Elegí un archivo de <strong className="text-ink">otro programa</strong> (Excel o CSV).
          La app <strong className="text-ink">solo usa las columnas que reconoce</strong>; el resto
          se ignora. Hace falta al menos <strong className="text-ink">nombre</strong> o{" "}
          <strong className="text-ink">código / EAN / SKU</strong> (también con tilde: Código,
          Descripción, etc.).
        </p>
        <p className="text-xs">
          Opcionales: precio, costo, stock, categoría, marca, proveedor. Si el Excel tiene un título
          arriba y los nombres de columna en la fila 2 o 3, se detectan solos.
        </p>
        <p className="text-xs">
          El catálogo masivo de supermercado (~190.000 productos) es aparte, desde{" "}
          <strong>Catálogo supermercado</strong>.
        </p>
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
            {result.notes?.length > 0 && (
              <ul className="mt-2 list-disc pl-4 text-xs">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
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
