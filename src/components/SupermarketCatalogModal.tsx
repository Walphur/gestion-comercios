import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Search } from "lucide-react";
import { Modal, Button } from "./ui";
import {
  getAppStorageInfo,
  importSupermarketCatalog,
  listSupermarketCategories,
  pickSupermarketCsvFile,
  type SupermarketCategory,
} from "../lib/tauri";
import { formatDbError } from "../lib/dbError";

type Mode = "full" | "categories";

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export default function SupermarketCatalogModal({ open, onClose, onDone }: Props) {
  const [mode, setMode] = useState<Mode>("categories");
  const [categories, setCategories] = useState<SupermarketCategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [csvPath, setCsvPath] = useState<string | null>(null);
  const [fromDbOnly, setFromDbOnly] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    getAppStorageInfo()
      .then((s) => setCatalogReady(s.catalog_csv_ready || s.catalog_bundled))
      .catch(() => setCatalogReady(false));
  }, [open]);

  const loadCategories = useCallback(async (path: string | null) => {
    setLoadingCats(true);
    setError("");
    try {
      const list = await listSupermarketCategories(path);
      setCategories(list);
      setFromDbOnly(!path && list.length > 0 && !catalogReady);
    } catch (e) {
      setCategories([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingCats(false);
    }
  }, [catalogReady]);

  useEffect(() => {
    if (!open) return;
    if (mode !== "categories") return;
    void loadCategories(csvPath);
  }, [open, mode, csvPath, loadCategories]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, filter]);

  function toggleCategory(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function runImport() {
    const cats = mode === "categories" ? [...selected] : undefined;
    if (mode === "categories" && (!cats || cats.length === 0)) {
      alert("Elegí al menos una categoría.");
      return;
    }
    if (!catalogReady && !csvPath) {
      alert(
        "No hay catálogo en el instalador. Reinstalá con el instalador completo o elegí el archivo CSV en tu PC.",
      );
      return;
    }
    setBusy(true);
    try {
      const r = await importSupermarketCatalog(false, cats, csvPath);
      alert(
        `Importación terminada.\n${r.inserted} nuevos · ${r.updated} actualizados · ${r.skipped} omitidos`,
      );
      onDone();
      onClose();
    } catch (e) {
      alert(formatDbError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Catálogo supermercado" onClose={onClose} wide>
      {catalogReady ? (
        <p className="mb-4 flex items-center gap-2 text-sm text-brand-600 dark:text-brand-300">
          <CheckCircle2 size={18} />
          El catálogo viene dentro del instalador. No tenés que copiar archivos a mano.
        </p>
      ) : (
        <p className="mb-4 text-sm text-ink-muted">
          Este instalador no trae el listado grande. Si tenés el archivo en tu PC, usá «Elegir archivo
          CSV» una sola vez.
        </p>
      )}

      {!catalogReady && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
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
            <FileUp size={16} /> Elegir archivo CSV
          </Button>
          {csvPath && (
            <span className="max-w-md truncate text-xs text-ink-muted" title={csvPath}>
              {csvPath.split(/[/\\]/).pop()}
            </span>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("full")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            mode === "full" ? "bg-brand-600 text-white" : "bg-[var(--color-input-bg)] text-ink-muted"
          }`}
        >
          Completo
        </button>
        <button
          type="button"
          onClick={() => setMode("categories")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            mode === "categories"
              ? "bg-brand-600 text-white"
              : "bg-[var(--color-input-bg)] text-ink-muted"
          }`}
        >
          Por categorías
        </button>
      </div>

      {mode === "categories" && (
        <>
          <div className="relative mb-2">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-2 pl-9 pr-3 text-sm text-ink"
              placeholder="Buscar categoría…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {loadingCats ? (
            <p className="py-4 text-sm text-ink-muted">Cargando categorías…</p>
          ) : error ? (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-ink">
              <p>{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="mb-4 text-sm text-ink-muted">
              {catalogReady
                ? "Esperá unos segundos y volvé a abrir esta ventana (el catálogo se está copiando del instalador)."
                : "Elegí el archivo CSV del catálogo o reinstalá con el instalador completo."}
            </p>
          ) : (
            <div className="mb-4 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-panel-border)] p-2">
              {fromDbOnly && (
                <p className="mb-2 px-2 text-xs text-ink-muted">
                  Listado desde productos ya importados. Para importar más, usá el instalador completo.
                </p>
              )}
              {filtered.map((c) => (
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
                  <span className="text-xs text-ink-muted">{c.count.toLocaleString("es-AR")}</span>
                </label>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => void runImport()} disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Importando…
            </>
          ) : (
            "Importar desde instalador"
          )}
        </Button>
      </div>
    </Modal>
  );
}
