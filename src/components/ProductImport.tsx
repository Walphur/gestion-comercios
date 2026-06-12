import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eraser, FileUp, Loader2, Search, Upload } from "lucide-react";
import { Button, Modal } from "./ui";
import {
  checkDatabaseHealth,
  getAppStorageInfo,
  importProductsFromCsv,
  importSupermarketCatalog,
  listSupermarketCategories,
  pickProductsImportFile,
  pickSupermarketCsvFile,
  repairDatabase,
  type ImportProductsResult,
  type SupermarketCategory,
} from "../lib/tauri";
import { formatDbError, isDbCorruptionError } from "../lib/dbError";
import { withRustDb } from "../lib/rustDb";

type ImportTab = "list" | "supermarket";
type SuperMode = "full" | "categories";

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  initialTab?: ImportTab;
  supermarketImportedCount?: number;
  onRemoveSupermarket?: () => void | Promise<void>;
  removingSupermarket?: boolean;
}

export default function ProductImport({
  open,
  onClose,
  onDone,
  initialTab = "list",
  supermarketImportedCount = 0,
  onRemoveSupermarket,
  removingSupermarket = false,
}: Props) {
  const [tab, setTab] = useState<ImportTab>(initialTab);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [result, setResult] = useState<ImportProductsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [dbCorrupt, setDbCorrupt] = useState(false);

  const [superMode, setSuperMode] = useState<SuperMode>("categories");
  const [categories, setCategories] = useState<SupermarketCategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [catFilter, setCatFilter] = useState("");
  const [superError, setSuperError] = useState("");
  const [csvPath, setCsvPath] = useState<string | null>(null);
  const [fromDbOnly, setFromDbOnly] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setResult(null);
    setError(null);
    setWarning(null);
    setSuperError("");
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || tab !== "supermarket") return;
    getAppStorageInfo()
      .then((s) => setCatalogReady(s.catalog_csv_ready || s.catalog_bundled))
      .catch(() => setCatalogReady(false));
  }, [open, tab]);

  const loadCategories = useCallback(
    async (path: string | null) => {
      setLoadingCats(true);
      setSuperError("");
      try {
        const list = await listSupermarketCategories(path);
        setCategories(list);
        setFromDbOnly(!path && list.length > 0 && !catalogReady);
      } catch (e) {
        setCategories([]);
        setSuperError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingCats(false);
      }
    },
    [catalogReady],
  );

  useEffect(() => {
    if (!open || tab !== "supermarket" || superMode !== "categories") return;
    void loadCategories(csvPath);
  }, [open, tab, superMode, csvPath, loadCategories]);

  const filteredCats = useMemo(() => {
    const q = catFilter.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, catFilter]);

  function toggleCategory(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

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

  async function runListImport() {
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

  async function runSuperImport() {
    const cats = superMode === "categories" ? [...selected] : undefined;
    if (superMode === "categories" && (!cats || cats.length === 0)) {
      alert("Elegí al menos una categoría.");
      return;
    }
    if (!catalogReady && !csvPath) {
      alert("Elegí el archivo productos_supermercado.csv o usá un instalador que lo traiga incluido.");
      return;
    }
    setBusy(true);
    try {
      const r = await withRustDb(() => importSupermarketCatalog(false, cats, csvPath));
      alert(
        `Importación terminada.\n${r.inserted} nuevos · ${r.updated} actualizados · ${r.skipped} omitidos`,
      );
      onDone();
      handleClose();
    } catch (e) {
      const msg = formatDbError(e);
      alert(
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
    setWarning(null);
    onClose();
  }

  return (
    <Modal open={open} title="Importar productos" onClose={handleClose} wide>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("list")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === "list" ? "bg-brand-600 text-white" : "bg-[var(--color-input-bg)] text-ink-muted"
          }`}
        >
          Tu Excel o CSV
        </button>
        <button
          type="button"
          onClick={() => setTab("supermarket")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === "supermarket"
              ? "bg-brand-600 text-white"
              : "bg-[var(--color-input-bg)] text-ink-muted"
          }`}
        >
          Catálogo supermercado
        </button>
      </div>

      {tab === "list" ? (
        <div className="space-y-4 text-sm text-ink-muted">
          <p>
            Archivo de <strong className="text-ink">otro programa</strong> (Excel o CSV). Hace falta al
            menos <strong className="text-ink">nombre</strong> o{" "}
            <strong className="text-ink">código / EAN / SKU</strong>.
          </p>
          <p className="text-xs">
            Opcionales: precio, costo, stock, categoría, marca, proveedor.
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
                <strong>{result.inserted}</strong> nuevos · <strong>{result.updated}</strong> actualizados ·{" "}
                <strong>{result.skipped}</strong> omitidos
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={handleClose}>
              Cerrar
            </Button>
            <Button onClick={() => void runListImport()} disabled={busy}>
              {busy ? "Importando…" : (
                <>
                  <Upload size={16} /> Elegir archivo e importar
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-ink-muted">
          <p>
            Listado grande (~190.000 productos). Elegí el CSV si no viene en tu instalador, después
            importá todo o por categorías.
          </p>

          {catalogReady ? (
            <p className="flex items-center gap-2 text-brand-600 dark:text-brand-300">
              <CheckCircle2 size={18} />
              Catálogo disponible en el instalador o en la carpeta de datos.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    const path = await pickSupermarketCsvFile();
                    if (path) setCsvPath(path);
                  } catch (e) {
                    alert(formatDbError(e));
                  }
                }}
              >
                <FileUp size={16} /> Elegir productos_supermercado.csv
              </Button>
              {csvPath && (
                <span className="max-w-md truncate text-xs" title={csvPath}>
                  {csvPath.split(/[/\\]/).pop()}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSuperMode("full")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                superMode === "full"
                  ? "bg-brand-600 text-white"
                  : "bg-[var(--color-input-bg)] text-ink-muted"
              }`}
            >
              Importar todo
            </button>
            <button
              type="button"
              onClick={() => setSuperMode("categories")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                superMode === "categories"
                  ? "bg-brand-600 text-white"
                  : "bg-[var(--color-input-bg)] text-ink-muted"
              }`}
            >
              Por categorías
            </button>
          </div>

          {superMode === "categories" && (
            <>
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <input
                  className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-2 pl-9 pr-3 text-sm text-ink"
                  placeholder="Buscar categoría…"
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                />
              </div>
              {loadingCats ? (
                <p className="py-4">Cargando categorías…</p>
              ) : superError ? (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-ink">
                  {superError}
                </p>
              ) : filteredCats.length === 0 ? (
                <p>
                  {catalogReady || csvPath
                    ? "Esperá unos segundos y volvé a abrir esta ventana."
                    : "Elegí el archivo CSV del catálogo."}
                </p>
              ) : (
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-panel-border)] p-2">
                  {fromDbOnly && (
                    <p className="mb-2 px-2 text-xs">
                      Listado desde productos ya importados.
                    </p>
                  )}
                  {filteredCats.map((c) => (
                    <label
                      key={c.name}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-brand-500/10"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.name)}
                        onChange={() => toggleCategory(c.name)}
                      />
                      <span className="flex-1 truncate text-sm text-ink">{c.name}</span>
                      <span className="text-xs">{c.count.toLocaleString("es-AR")}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {supermarketImportedCount > 0 && onRemoveSupermarket && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 dark:border-red-900 dark:bg-red-950/20">
              <p className="text-ink">
                Tenés {supermarketImportedCount.toLocaleString("es-AR")} productos del catálogo super
                importados.
              </p>
              <Button
                variant="secondary"
                className="mt-2 text-red-600"
                disabled={removingSupermarket || busy}
                onClick={() => void onRemoveSupermarket()}
              >
                <Eraser size={16} />
                {removingSupermarket ? "Quitando…" : "Quitar catálogo super importado"}
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={handleClose}>
              Cerrar
            </Button>
            <Button onClick={() => void runSuperImport()} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Importando…
                </>
              ) : (
                "Importar catálogo"
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
