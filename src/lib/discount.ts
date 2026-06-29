import { lineTotal } from "./weightSale";

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function roundDiscountPct(pct: number): number {
  return Math.round(pct * 100) / 100;
}

/** Acepta "1400", "1400,50" o "1.400" (miles con punto). */
export function parseAmountInput(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney(n);
}

export function lineSubtotal(unitPrice: number, qty: number): number {
  return roundMoney(unitPrice * qty);
}

/** Límites del ajuste: hasta 100% descuento o 100% recargo. */
export const MIN_ADJUST_PCT = -100;
export const MAX_ADJUST_PCT = 100;

export function clampAdjustPct(pct: number): number {
  return roundDiscountPct(Math.min(MAX_ADJUST_PCT, Math.max(MIN_ADJUST_PCT, pct)));
}

/** % exacto (sin redondear). Positivo = descuento, negativo = recargo (interno / BD). */
export function exactDiscountPctFromFinalPrice(subtotal: number, finalPrice: number): number {
  if (subtotal <= 0) return 0;
  const price = roundMoney(Math.max(0, finalPrice));
  return (1 - price / subtotal) * 100;
}

/** UI del POS: +% = recargo, −% = descuento. */
export function internalDiscountToAdjustDisplay(internalPct: number): number {
  return roundDiscountPct(-internalPct);
}

export function adjustDisplayToInternalDiscount(displayPct: number): number {
  return clampAdjustPct(-displayPct);
}

/** % redondeado para mostrar en pantalla (convención UI). */
export function discountPctDisplay(subtotal: number, finalPrice: number): number {
  return internalDiscountToAdjustDisplay(exactDiscountPctFromFinalPrice(subtotal, finalPrice));
}

export function discountedLineTotal(
  unitPrice: number,
  qty: number,
  discountPct: number,
): number {
  return roundMoney(lineTotal(unitPrice, qty, discountPct));
}
