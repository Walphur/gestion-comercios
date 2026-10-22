import type { Product } from "../types";

export interface PromoInfo {
  /** Precio de antes, en la moneda del local. */
  before: number;
  off: number;
}

/** Promo cuando el precio de lista (antes) supera al de venta. No cambia lo que se cobra. */
export function productPromo(
  p: Pick<Product, "price" | "list_price" | "price_usd" | "list_price_usd">,
): PromoInfo | null {
  const priceUsd = Number(p.price_usd) || 0;
  const listUsd = Number(p.list_price_usd) || 0;
  if (priceUsd > 0) {
    if (listUsd <= priceUsd || !(p.price > 0)) return null;
    return {
      before: Math.round((p.price * listUsd) / priceUsd),
      off: Math.round((1 - priceUsd / listUsd) * 100),
    };
  }
  const list = Number(p.list_price) || 0;
  if (!(p.price > 0) || list <= p.price) return null;
  const off = Math.round((1 - p.price / list) * 100);
  return off > 0 ? { before: list, off } : null;
}
