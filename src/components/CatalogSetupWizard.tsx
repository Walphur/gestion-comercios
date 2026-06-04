import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Package, Search, Sparkles, Store } from "lucide-react";
import { Button } from "./ui";
import { seedDemoCatalog } from "../db/demo";
import {
  applyCatalogSetupChoice,
  getCatalogWizardState,
  listSupermarketCategories,
  type SupermarketCategory,
} from "../lib/tauri";
import { withRustDb } from "../lib/rustDb";

type Mode = "empty" | "demo" | "full" | "categories";

interface Props {
  onFinished: () => void;
}

export default function CatalogSetupWizard({ onFinished }: Props) {
  const [mode, setMode] = useState<Mode>("demo");
  const [categories, setCategories] = useState<SupermarketCategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [catalogReady, setCatalogReady] = useState(false);

  useEffect(() => {
    getCatalogWizardState()
      .then((s) => setCatalogReady(s.catalog_ready || s.bundled))
      .catch(() => setCatalogReady(false));
  }, []);

  useEffect(() => {
    if (mode !== "categories") return;
    setLoadingCats(true);
    setError("");
    listSupermarketCategories(null)
      .then(setCategories)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingCats(false));
  }, [mode]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, filter]);

  async function handleContinue() {
    setSubmitting(true);
    setError("");
    try {
      if (mode === "categories") {
        const cats = [...selected];
        if (cats.length === 0) {
          setError("Elegí al menos una categoría.");
          setSubmitting(false);
          return;
        }
        if (!catalogReady) {
          setError("El módulo de catálogo super no está en este instalador.");
          setSubmitting(false);
          return;
        }
        await withRustDb(() => applyCatalogSetupChoice("categories", cats));
      } else if (mode === "full") {
        if (!catalogReady) {
          setError("El módulo de catálogo super no está en este instalador.");
          setSubmitting(false);
          return;
        }
        await withRustDb(() => applyCatalogSetupChoice("full", []));
      } else if (mode === "demo") {
        await withRustDb(() => applyCatalogSetupChoice("demo", []));
        const r = await seedDemoCatalog();
        if (r.added === 0 && r.skipped === 0) {
          setError("No se pudieron cargar los ejemplos.");
          setSubmitting(false);
          return;
        }
      } else {
        await withRustDb(() => applyCatalogSetupChoice("empty", []));
      }
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
          <h2 className="font-display text-xl font-semibold text-ink">Configurá tu comercio</h2>
          <p className="mt-2 text-sm text-ink-muted">
            La app base viene <strong className="text-ink">sin los 200.000 productos</strong>. Elegí
            cómo empezar; el catálogo supermercado es un módulo aparte (abajo).
          </p>
        </div>

        <div className="space-y-3 overflow-y-auto px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Inicio de la app
          </p>

          <label className="flex cursor-pointer gap-3 rounded-xl border-2 border-brand-500/50 bg-brand-500/10 p-4">
            <input
              type="radio"
              name="start-mode"
              checked={mode === "demo"}
              onChange={() => setMode("demo")}
              className="mt-1"
            />
            <div>
              <p className="flex items-center gap-2 font-semibold text-ink">
                <Sparkles size={16} /> Productos de ejemplo (~20)
              </p>
              <p className="text-sm text-ink-muted">
                Para probar ventas y stock. Los quitás cuando quieras en Productos → «Quitar
                ejemplos».
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer gap-3 rounded-xl border border-[var(--color-panel-border)] p-4 hover:border-brand-400">
            <input
              type="radio"
              name="start-mode"
              checked={mode === "empty"}
              onChange={() => setMode("empty")}
              className="mt-1"
            />
            <div>
              <p className="font-semibold text-ink">Empezar vacío</p>
              <p className="text-sm text-ink-muted">
                Sin productos. Cargá los tuyos a mano o con Excel/CSV.
              </p>
            </div>
          </label>

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Módulo catálogo supermercado (opcional)
          </p>

          {catalogReady ? (
            <p className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-300">
              <CheckCircle2 size={18} />
              Este instalador incluye el módulo super (~190.000 productos).
            </p>
          ) : (
            <p className="rounded-lg border border-[var(--color-panel-border)] bg-brand-50/40 px-3 py-2 text-sm text-ink-muted dark:bg-brand-900/20">
              El instalador estándar no trae el módulo super. Podés vender el instalador completo
              o importar el CSV después desde Productos.
            </p>
          )}

          <label
            className={`flex gap-3 rounded-xl border p-4 ${
              catalogReady
                ? "cursor-pointer hover:border-brand-400"
                : "cursor-not-allowed opacity-50"
            }`}
          >
            <input
              type="radio"
              name="start-mode"
              checked={mode === "full"}
              onChange={() => catalogReady && setMode("full")}
              disabled={!catalogReady}
              className="mt-1"
            />
            <div>
              <p className="font-semibold text-ink">Importar catálogo super completo</p>
              <p className="text-sm text-ink-muted">15–25 min la primera vez.</p>
            </div>
          </label>

          <label
            className={`flex gap-3 rounded-xl border p-4 ${
              catalogReady
                ? "cursor-pointer hover:border-brand-400"
                : "cursor-not-allowed opacity-50"
            }`}
          >
            <input
              type="radio"
              name="start-mode"
              checked={mode === "categories"}
              onChange={() => catalogReady && setMode("categories")}
              disabled={!catalogReady}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">Super: solo algunas categorías</p>
            </div>
          </label>

          {mode === "categories" && catalogReady && (
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
              {loadingCats ? (
                <p className="flex items-center gap-2 py-4 text-sm text-ink-muted">
                  <Loader2 size={18} className="animate-spin" /> Cargando categorías…
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {filtered.map((c) => (
                    <label
                      key={c.name}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-brand-500/10"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.name)}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.name)) next.delete(c.name);
                            else next.add(c.name);
                            return next;
                          });
                        }}
                      />
                      <span className="flex-1 truncate text-sm">{c.name}</span>
                      <span className="text-xs text-ink-muted">{c.count.toLocaleString("es-AR")}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-amber-600 dark:text-amber-400">{error}</p>}
        </div>

        <div className="flex justify-end border-t border-[var(--color-panel-border)] px-6 py-4">
          <Button onClick={handleContinue} disabled={submitting} className="min-w-[160px]">
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Preparando…
              </>
            ) : mode === "empty" ? (
              <>
                <Store size={16} /> Empezar vacío
              </>
            ) : mode === "demo" ? (
              <>
                <Sparkles size={16} /> Cargar ejemplos
              </>
            ) : (
              <>
                <Package size={16} /> Importar catálogo super
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export async function fetchCatalogWizardNeeded(): Promise<boolean> {
  try {
    const s = await getCatalogWizardState();
    return s.needed;
  } catch {
    return false;
  }
}
