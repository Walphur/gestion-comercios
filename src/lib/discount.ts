import { lineTotal } from "./weightSale";

export function lineSubtotal(unitPrice: number, qty: number): number {
  return unitPrice * qty;
}

/** Porcentaje de descuento (0–100) para llegar a un precio final sobre un subtotal. */
export function discountPctFromFinalPrice(subtotal: number, finalPrice: number): number {
  if (subtotal <= 0) return 0;
  const clamped = Math.min(subtotal, Math.max(0, finalPrice));
  const pct = (1 - clamped / subtotal) * 100;
  return Math.min(100, Math.max(0, pct));
}

export function discountedLineTotal(
  unitPrice: number,
  qty: number,
  discountPct: number,
): number {
  return lineTotal(unitPrice, qty, discountPct);
}
