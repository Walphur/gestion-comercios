import type { Sale } from "../types";

/** Largo máximo del detalle de una venta (quién retiró, para qué…). */
export const SALE_NOTE_MAX = 200;

/** Detalle en una sola línea, sin espacios de más y cortado al máximo; vacío → null. */
export function normalizeSaleNote(raw: string | null | undefined): string | null {
  const clean = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, SALE_NOTE_MAX).trim();
  return clean || null;
}

/** Detalle de cada venta que lo tiene, por id. */
export function saleNotesById(sales: Pick<Sale, "id" | "note">[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const s of sales) {
    const note = normalizeSaleNote(s.note);
    if (note) out.set(s.id, note);
  }
  return out;
}
