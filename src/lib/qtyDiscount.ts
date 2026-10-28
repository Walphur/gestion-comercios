/** Escalón: desde `min_qty` (kg, unidades… según el producto) se descuenta `pct` %. */
export interface QtyDiscountTier {
  min_qty: number;
  pct: number;
}

export const MAX_QTY_DISCOUNT_TIERS = 5;

function validTier(t: unknown): t is QtyDiscountTier {
  if (!t || typeof t !== "object") return false;
  const { min_qty, pct } = t as Record<string, unknown>;
  return (
    typeof min_qty === "number" &&
    typeof pct === "number" &&
    Number.isFinite(min_qty) &&
    Number.isFinite(pct) &&
    min_qty > 0 &&
    pct > 0 &&
    pct <= 100
  );
}

/** Ordena por cantidad y deja un solo escalón por cantidad (el último cargado). */
export function normalizeQtyDiscounts(tiers: QtyDiscountTier[]): QtyDiscountTier[] {
  const byQty = new Map<number, number>();
  for (const t of tiers) {
    if (!validTier(t)) continue;
    const qty = Math.round(t.min_qty * 1000) / 1000;
    byQty.set(qty, Math.round(t.pct * 100) / 100);
  }
  return [...byQty.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_QTY_DISCOUNT_TIERS)
    .map(([min_qty, pct]) => ({ min_qty, pct }));
}

export function parseQtyDiscounts(raw: string | null | undefined): QtyDiscountTier[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? normalizeQtyDiscounts(data as QtyDiscountTier[]) : [];
  } catch {
    return [];
  }
}

export function serializeQtyDiscounts(tiers: QtyDiscountTier[]): string | null {
  const clean = normalizeQtyDiscounts(tiers);
  return clean.length > 0 ? JSON.stringify(clean) : null;
}

/** % del escalón más alto alcanzado; 0 si no llega a ninguno. */
export function qtyDiscountPctFor(tiers: QtyDiscountTier[], qty: number): number {
  let pct = 0;
  for (const t of tiers) {
    if (qty + 1e-9 >= t.min_qty) pct = t.pct;
  }
  return pct;
}
