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
}

export default function PosCartaMenu({ categories, currency, onPick }: Props) {
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
      listProducts({ limit: 100 }),
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

  const byCategory = useMemo(() => {
    if (categoryId !== "all") return null;
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const key = p.category_name?.trim() || "Sin categoría";
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [products, categoryId]);

  if (!loading && products.length === 0 && categories.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center text-ink-muted">
        <UtensilsCrossed size={40} className="mb-3 opacity-35" />
        <p className="max-w-sm text-sm">
          Armá la carta en <strong className="text-ink">Productos</strong>: creá platos y bebidas y asignales
          categoría (Entradas, Principales, Bebidas…).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <CategoryChip
          label="Toda la carta"
          active={categoryId === "all"}
          onClick={() => setCategoryId("all")}
        />
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.name}
            active={categoryId === c.id}
            onClick={() => setCategoryId(c.id)}
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
            <section>
              <h3 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                Menú del día
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {dailyMenu.map((p) => (
                  <CartaTile key={`daily-${p.id}`} product={p} currency={currency} onPick={onPick} />
                ))}
              </div>
            </section>
          )}
          {byCategory ? (
            byCategory.map(([name, items]) => (
              <section key={name}>
                <h3 className="mb-2 text-sm font-semibold text-ink">{name}</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((p) => (
                    <CartaTile key={p.id} product={p} currency={currency} onPick={onPick} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <CartaTile key={p.id} product={p} currency={currency} onPick={onPick} />
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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500"
          : "bg-[var(--color-input-bg)] text-ink ring-1 ring-[var(--color-panel-border)] hover:bg-brand-50 dark:hover:bg-brand-950/40"
      }`}
    >
      {label}
    </button>
  );
}

function CartaTile({
  product,
  currency,
  onPick,
}: {
  product: Product;
  currency: string;
  onPick: (p: Product) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(product)}
      className="pos-product-card relative min-h-[5rem] text-left"
    >
      <div className="flex gap-2.5">
        <ProductThumb imagePath={product.image_path} alt={product.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-ink">
            {product.name}
            {product.is_kit ? (
              <span className="ml-1 text-[10px] font-semibold uppercase text-brand-600">Combo</span>
            ) : null}
          </p>
          <p className="mt-1 text-base font-bold text-brand-600 tabular-nums dark:text-brand-300">
            {formatMoney(product.price, currency)}
            {productSoldByWeight(product.unit) && (
              <span className="text-xs font-normal text-ink-muted">
                {" "}
                / {formatUnitShort(product.unit)}
              </span>
            )}
          </p>
        </div>
      </div>
    </button>
  );
}
