import { useEffect, useMemo, useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import type { Category, Product } from "../types";
import { formatMoney, formatUnitShort } from "../lib/format";
import { productSoldByWeight } from "../lib/weightSale";
import { listProducts } from "../db/products";
import ProductThumb from "./ProductThumb";

interface Props {
  categories: Category[];
  currency: string;
  onPick: (product: Product) => void;
  /** Compacto: filas con miniatura (modal de mesa). Default: tarjetas con foto grande (POS). */
  density?: "default" | "compact";
}

/** Varias tarjetas visibles: 2 en pantallas chicas, 3 en el POS típico. */
const CARTA_GRID = "grid min-w-0 grid-cols-2 gap-2.5 lg:grid-cols-3";
const CARTA_GRID_COMPACT = "grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2";

export default function PosCartaMenu({ categories, currency, onPick, density = "default" }: Props) {
  const compact = density === "compact";
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [dailyMenu, setDailyMenu] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      listProducts({
        categoryId: categoryId === "all" ? undefined : categoryId,
        limit: 500,
      }),
      listProducts({ limit: 200 }),
    ])
      .then(([rows, all]) => {
        if (cancelled) return;
        setProducts(rows);
        setDailyMenu(all.filter((p) => p.is_daily_menu));
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const dailyIds = useMemo(() => new Set(dailyMenu.map((p) => p.id)), [dailyMenu]);

  const byCategory = useMemo(() => {
    if (categoryId !== "all") return null;
    const map = new Map<string, Product[]>();
    for (const p of products) {
      // Evitar duplicar platos que ya están en «Menú del día».
      if (dailyIds.has(p.id)) continue;
      const key = p.category_name?.trim() || "Sin categoría";
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [products, categoryId, dailyIds]);

  if (!loading && products.length === 0 && categories.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center text-ink-muted">
        <UtensilsCrossed size={40} className="mb-3 opacity-35" />
        <p className="max-w-sm text-sm">
          Armá la carta en <strong className="text-ink">Productos</strong>: creá platos y bebidas y
          asignales categoría (Entradas, Principales, Bebidas…).
        </p>
      </div>
    );
  }

  const gridClass = compact ? CARTA_GRID_COMPACT : CARTA_GRID;

  return (
    <div className="min-w-0 space-y-3">
      <div className={`flex min-w-0 max-w-full flex-wrap ${compact ? "gap-2" : "gap-1.5"}`}>
        <CategoryChip
          label="Toda la carta"
          active={categoryId === "all"}
          onClick={() => setCategoryId("all")}
          compact={compact}
        />
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.name}
            active={categoryId === c.id}
            onClick={() => setCategoryId(c.id)}
            compact={compact}
          />
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Cargando carta…</p>
      ) : products.length === 0 && dailyMenu.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No hay productos en esta categoría. Agregalos en Productos.
        </p>
      ) : (
        <>
          {categoryId === "all" && dailyMenu.length > 0 && (
            <section className="min-w-0">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Menú del día
              </h3>
              <div className={gridClass}>
                {dailyMenu.map((p) => (
                  <CartaTile
                    key={`daily-${p.id}`}
                    product={p}
                    currency={currency}
                    onPick={onPick}
                    compact={compact}
                  />
                ))}
              </div>
            </section>
          )}
          {byCategory ? (
            byCategory.map(([name, items]) => (
              <section key={name} className="min-w-0">
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {name}
                </h3>
                <div className={gridClass}>
                  {items.map((p) => (
                    <CartaTile
                      key={p.id}
                      product={p}
                      currency={currency}
                      onPick={onPick}
                      compact={compact}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className={gridClass}>
              {products.map((p) => (
                <CartaTile
                  key={p.id}
                  product={p}
                  currency={currency}
                  onPick={onPick}
                  compact={compact}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
  compact,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex max-w-full items-center truncate rounded-full font-medium leading-5 transition-colors ${
        compact ? "px-3.5 py-2 text-sm" : "px-3 py-1.5 text-xs"
      } ${
        active
          ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500"
          : "bg-[var(--color-input-bg)] text-ink ring-1 ring-[var(--color-panel-border)] hover:bg-brand-50 dark:hover:bg-brand-950/40"
      }`}
    >
      {label}
    </button>
  );
}

/** Tarjeta: foto cuadrada (POS) o fila compacta con miniatura (mesa). */
function CartaTile({
  product,
  currency,
  onPick,
  compact,
}: {
  product: Product;
  currency: string;
  onPick: (p: Product) => void;
  compact?: boolean;
}) {
  const price = (
    <>
      {formatMoney(product.price, currency)}
      {productSoldByWeight(product.unit) && (
        <span className="text-xs font-normal text-ink-muted">
          {" "}
          / {formatUnitShort(product.unit)}
        </span>
      )}
    </>
  );

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onPick(product)}
        className="pos-product-card flex min-h-[3.25rem] min-w-0 flex-row items-center gap-2.5 !p-2 text-left"
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
          <ProductThumb imagePath={product.image_path} alt={product.name} size="card" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
            {product.name}
            {product.is_kit ? (
              <span className="ml-1 text-[10px] font-semibold uppercase text-brand-600">Combo</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-brand-600 dark:text-brand-300">
            {price}
          </p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPick(product)}
      className="pos-product-card !p-0 flex min-h-0 min-w-0 flex-col overflow-hidden text-left"
    >
      <div className="aspect-square w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
        <ProductThumb imagePath={product.image_path} alt={product.name} size="card" />
      </div>
      <div className="min-w-0 flex-1 px-2.5 py-2">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
          {product.name}
          {product.is_kit ? (
            <span className="ml-1 text-[10px] font-semibold uppercase text-brand-600">Combo</span>
          ) : null}
        </p>
        <p className="mt-1 text-sm font-bold tabular-nums text-brand-600 dark:text-brand-300">
          {price}
        </p>
      </div>
    </button>
  );
}
