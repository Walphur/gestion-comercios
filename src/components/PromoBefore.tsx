import type { Product } from "../types";
import { formatMoney } from "../lib/format";
import { productPromo } from "../lib/listPrice";

export default function PromoBefore({
  product,
  currency,
  compact = false,
}: {
  product: Pick<Product, "price" | "list_price" | "price_usd" | "list_price_usd">;
  currency: string;
  /** Solo el % (listados angostos). */
  compact?: boolean;
}) {
  const promo = productPromo(product);
  if (!promo) return null;
  const before = formatMoney(promo.before, currency);
  const off = (
    <span className="shrink-0 rounded-full bg-rose-600 px-1.5 py-px text-[10px] font-bold leading-4 text-white">
      -{promo.off}%
    </span>
  );
  if (compact) {
    return (
      <span className="ml-1 inline-flex align-middle" title={`Promo: antes ${before}`}>
        {off}
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px]" title={`Promo: antes ${before}`}>
      <span className="min-w-0 truncate text-ink-muted line-through">{before}</span>
      {off}
    </span>
  );
}
