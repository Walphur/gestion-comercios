import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, Search, Store } from "lucide-react";
import { Button } from "./ui";
import {
  applyCatalogSetupChoice,
  getCatalogWizardState,
  listSupermarketCategories,
  type SupermarketCategory,
} from "../lib/tauri";

type Mode = "skip" | "full" | "categories";

interface Props {
  onFinished: () => void;
}

export default function CatalogSetupWizard({ onFinished }: Props) {
  const [mode, setMode] = useState<Mode>("skip");
  const [categories, setCategories] = useState<SupermarketCategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoadingCats(true);
    listSupermarketCategories()
      .then(setCategories)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingCats(false));
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, filter]);

  const selectedCount = useMemo(
    () => filtered.filter((c) => selected.has(c.name)).length,
    [filtered, selected],
  );

  function toggleCategory(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of filtered) next.add(c.name);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleContinue() {
    setSubmitting(true);
    setError("");
    try {
      const cats = mode === "categories" ? [...selected] : [];
      if (mode === "categories" && cats.length === 0) {
        setError("Elegí al menos una categoría.");
        setSubmitting(false);
        return;
      }
      await applyCatalogSetupChoice(mode, cats);
      onFinished();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-brand-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] shadow-2xl">
        <div className="border-b border-[var(--color-panel-border)] px-6 py-5">
          <h2 className="font-display text-xl font-semibold text-ink">
            ¿Querés cargar el catálogo de productos?
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Un kiosco puede usar el listado completo; una verdulería o petshop suele elegir solo
            algunas categorías. También podés empezar vacío y cargar a mano.
          </p>
        </div>

        <div className="space-y-3 overflow-y-auto px-6 py-4">
          <label className="flex cursor-pointer gap-3 rounded-xl border border-[var(--color-panel-border)] p-4 hover:border-brand-400">
            <input
              type="radio"
              name="catalog-mode"
              checked={mode === "skip"}
              onChange={() => setMode("skip")}
              className="mt-1"
            />
            <div>
              <p className="font-semibold text-ink">No, empezar vacío</p>
              <p className="text-sm text-ink-muted">
                Ideal para petshop, verdulería u otro rubro con productos propios.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer gap-3 rounded-xl border border-[var(--color-panel-border)] p-4 hover:border-brand-400">
            <input
              type="radio"
              name="catalog-mode"
              checked={mode === "full"}
              onChange={() => setMode("full")}
              className="mt-1"
            />
            <div>
              <p className="font-semibold text-ink">Sí, catálogo completo (~190.000 productos)</p>
              <p className="text-sm text-ink-muted">
                Tarda 15–25 minutos la primera vez. Recomendado para kiosco / almacén grande.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer gap-3 rounded-xl border border-brand-500/40 bg-brand-500/5 p-4">
            <input
              type="radio"
              name="catalog-mode"
              checked={mode === "categories"}
              onChange={() => setMode("categories")}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">Solo algunas categorías</p>
              <p className="text-sm text-ink-muted">
                Elegí rubros (ej. Mascotas, Verduras). Importa más rápido.
              </p>
            </div>
          </label>

          {mode === "categories" && (
            <div className="rounded-xl border border-[var(--color-panel-border)] p-3">
              <div className="relative mb-3">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                />
                <input
                  className="w-full rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-2 pl-9 pr-3 text-sm"
                  placeholder="Buscar categoría…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="mb-2 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="text-brand-700 hover:underline dark:text-brand-300"
                >
                  Marcar visibles
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-ink-muted hover:underline"
                >
                  Desmarcar
                </button>
                <span className="text-ink-muted">
                  {selected.size} elegida(s)
                  {filtered.length > 0 && ` · ${selectedCount} en esta lista`}
                </span>
              </div>
              {loadingCats ? (
                <p className="flex items-center gap-2 py-6 text-sm text-ink-muted">
                  <Loader2 size={18} className="animate-spin" /> Leyendo categorías del CSV…
                </p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {filtered.map((c) => (
                    <label
                      key={c.name}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-500/10"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.name)}
                        onChange={() => toggleCategory(c.name)}
                      />
                      <span className="flex-1 truncate text-sm text-ink">{c.name}</span>
                      <span className="text-xs tabular-nums text-ink-muted">
                        {c.count.toLocaleString("es-AR")}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-panel-border)] px-6 py-4">
          <Button onClick={handleContinue} disabled={submitting} className="min-w-[140px]">
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Preparando…
              </>
            ) : mode === "skip" ? (
              <>
                <Store size={16} /> Continuar sin catálogo
              </>
            ) : (
              <>
                <Package size={16} /> {mode === "full" ? "Importar todo" : "Importar elegidas"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Comprueba si hace falta mostrar el asistente (hook para Layout). */
export async function fetchCatalogWizardNeeded(): Promise<boolean> {
  try {
    const s = await getCatalogWizardState();
    return s.needed;
  } catch {
    return false;
  }
}
