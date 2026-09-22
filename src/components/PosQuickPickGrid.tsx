import { useEffect, useState, type ReactNode } from "react";
import { Star, TrendingUp, Sun } from "lucide-react";
import type { Product } from "../types";
import { formatMoney, formatUnitShort } from "../lib/format";
import { productSoldByWeight } from "../lib/weightSale";
import ProductThumb from "./ProductThumb";
import { listProducts } from "../db/products";

interface Props {
  favorites: Product[];
  topSellers: Product[];
  currency: string;
  onPick: (product: Product) => void;
}

function ProductTile({
  product,
  currency,
  onPick,
  badge,
}: {
  product: Product;
  currency: string;
  onPick: (p: Product) => void;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(product)}
      className="pos-product-card relative min-h-[5.5rem] text-left"
    >
      {badge}
      <div className="flex items-start gap-2.5">
        <ProductThumb imagePath={product.image_path} alt={product.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 pr-6 text-sm font-semibold text-ink">
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
          <p className="mt-0.5 text-[11px] text-ink-muted">
            {product.is_kit
              ? "Combo"
              : product.track_stock === 0
                ? "Al momento"
                : product.has_variants
                  ? "Variantes"
                  : `Stock ${product.stock}`}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function PosQuickPickGrid({ favorites, topSellers, currency, onPick }: Props) {
  const [dailyMenu, setDailyMenu] = useState<Product[]>([]);
  useEffect(() => {
    void listProducts({ limit: 200 })
      .then((rows) => setDailyMenu(rows.filter((p) => p.is_daily_menu)))
      .catch(() => setDailyMenu([]));
  }, [favorites, topSellers]);

  const hasFavorites = favorites.length > 0;
  const hasTop = topSellers.length > 0;
  const hasDaily = dailyMenu.length > 0;

  if (!hasFavorites && !hasTop && !hasDaily) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center text-ink-muted">
        <Star size={40} className="mb-3 opacity-35" />
        <p className="max-w-sm text-sm">
          Escaneá o buscá productos. Los más vendidos aparecen acá cuando haya ventas; en{" "}
          <strong className="text-ink">Productos</strong> podés marcar favoritos para el mostrador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasDaily && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <Sun size={16} />
            Menú del día
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {dailyMenu.map((p) => (
              <ProductTile key={`daily-${p.id}`} product={p} currency={currency} onPick={onPick} />
            ))}
          </div>
        </section>
      )}
      {hasFavorites && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Star size={16} className="text-amber-500" />
            Favoritos del mostrador
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {favorites.map((p) => (
              <ProductTile
                key={p.id}
                product={p}
                currency={currency}
                onPick={onPick}
                badge={
                  <span className="absolute right-2 top-2 text-amber-500">
                    <Star size={14} className="fill-current" />
                  </span>
                }
              />
            ))}
          </div>
        </section>
      )}
      {hasTop && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <TrendingUp size={16} className="text-brand-500" />
            Más vendidos
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {topSellers.map((p) => (
              <ProductTile key={p.id} product={p} currency={currency} onPick={onPick} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
