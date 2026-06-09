import { useState } from "react";
import { Upload } from "lucide-react";
import { Button, Modal } from "./ui";
import {
  checkDatabaseHealth,
  importProductsFromCsv,
  pickProductsImportFile,
  repairDatabase,
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
  const [repairing, setRepairing] = useState(false);
  const [result, setResult] = useState<ImportProductsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [dbCorrupt, setDbCorrupt] = useState(false);

  async function runRepair() {
    setRepairing(true);
    setError(null);
    try {
      const msg = await withRustDb(() => repairDatabase());
      setDbCorrupt(false);
      setError(`${msg}\n\nCerrá la app completamente y volvé a abrirla. Después probá importar de nuevo.`);
    } catch (e) {
      setError(formatDbError(e));
    } finally {
      setRepairing(false);
    }
  }

  async function runImport() {
    setError(null);
    setWarning(null);
    setResult(null);
    setDbCorrupt(false);
    setBusy(true);
    try {
      const res = await withRustDb(async () => {
        const health = await checkDatabaseHealth();
        if (!health.ok) {
          throw new Error("database disk image is malformed");
        }
        const path = await pickProductsImportFile();
        if (!path) return null;
        return importProductsFromCsv(path, updateExisting);
      });
      if (!res) {
        setBusy(false);
        return;
      }
      setResult(res);
      if (res.inserted === 0 && res.updated === 0 && res.skipped > 0) {
        setWarning(
          "No se importó ningún producto de este archivo. Revisá columnas de nombre o código (EAN/SKU). " +
            "Si desaparecieron productos de un Excel anterior, usá «Recuperar productos» en Productos.",
        );
      }
      onDone();
    } catch (e) {
      const corrupt = isDbCorruptionError(e);
      setDbCorrupt(corrupt);
      setError(formatDbError(e));
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setResult(null);
    setError(null);
    setWarning(null);
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

        {warning && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 whitespace-pre-wrap">
            {warning}
          </p>
        )}
        {error && (
          <div className="space-y-2">
            <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/40 dark:text-red-300 whitespace-pre-wrap">
              {error}
            </p>
            {dbCorrupt && (
              <Button variant="secondary" onClick={() => void runRepair()} disabled={repairing || busy}>
                {repairing ? "Reparando…" : "Reparar base de datos ahora"}
              </Button>
            )}
          </div>
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
