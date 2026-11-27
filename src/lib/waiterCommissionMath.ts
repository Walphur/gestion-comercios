/**
 * Matemática pura de comisiones de mozos V1 (B+P0).
 * Base = mercadería neta de descuentos; propina excluida del %.
 */

export type SaleLineForCommission = {
  name: string;
  product_id: number | null;
  line_total: number;
};

export function isTipSaleLine(line: SaleLineForCommission): boolean {
  if (line.product_id != null) return false;
  return line.name.trim().toLowerCase() === "propina";
}

/** Suma líneas de mercadería (sin propina) y aplica descuento global de la venta. */
export function merchandiseBaseFromSale(
  lines: SaleLineForCommission[],
  discountPct: number,
): { merchandiseGross: number; merchandiseBase: number; tipAmount: number } {
  let merchandiseGross = 0;
  let tipAmount = 0;
  for (const line of lines) {
    const total = Number(line.line_total) || 0;
    if (isTipSaleLine(line)) tipAmount += total;
    else merchandiseGross += total;
  }
  merchandiseGross = round2(merchandiseGross);
  tipAmount = round2(tipAmount);
  const pct = Math.max(0, Number(discountPct) || 0);
  const merchandiseBase = round2(merchandiseGross * (1 - pct / 100));
  return { merchandiseGross, merchandiseBase, tipAmount };
}

export function commissionFromBase(merchandiseBase: number, pct: number): number {
  const p = clampCommissionPct(pct);
  return round2((Math.max(0, merchandiseBase) * p) / 100);
}

/** 0–100; NaN/negativo → 0; >100 → 100. */
export function clampCommissionPct(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  if (raw > 100) return 100;
  return round2(raw);
}

export function parseCommissionPctInput(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return round2(n);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
