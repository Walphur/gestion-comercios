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

/** % exacto (sin redondear) para guardar en base. */
export function exactDiscountPctFromFinalPrice(subtotal: number, finalPrice: number): number {
  if (subtotal <= 0) return 0;
  const clamped = Math.min(subtotal, Math.max(0, roundMoney(finalPrice)));
  return Math.min(100, Math.max(0, (1 - clamped / subtotal) * 100));
}

/** % redondeado solo para mostrar en pantalla. */
export function discountPctDisplay(subtotal: number, finalPrice: number): number {
  return roundDiscountPct(exactDiscountPctFromFinalPrice(subtotal, finalPrice));
}

export function discountedLineTotal(
  unitPrice: number,
  qty: number,
  discountPct: number,
): number {
  return roundMoney(lineTotal(unitPrice, qty, discountPct));
}
