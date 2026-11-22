/** Lógica pura de bolsa / suelto (sin DB). */

export type BagLooseMode = "bag" | "loose";

export interface BagLooseStock {
  /** Bolsas cerradas. */
  closedBags: number;
  /** Kilos que quedan de la bolsa abierta. */
  openBagKg: number;
  /** Kilos por bolsa (obligatorio si vende suelto). */
  bagKg: number;
}

export interface LooseSalePreview {
  ok: boolean;
  error?: string;
  /** Bolsas cerradas que hay que abrir. */
  bagsToOpen: number;
  /** open_bag_kg después de la venta. */
  openKgAfter: number;
  /** closedBags después de la venta. */
  closedAfter: number;
}

const EPS = 1e-9;

export function productSellsLoose(p: {
  sell_loose?: number | boolean | null;
  bag_kg?: number | null;
  loose_price_per_kg?: number | null;
}): boolean {
  const on = p.sell_loose === 1 || p.sell_loose === true;
  if (!on) return false;
  const bagKg = Number(p.bag_kg);
  const loose = Number(p.loose_price_per_kg);
  return Number.isFinite(bagKg) && bagKg > 0 && Number.isFinite(loose) && loose > 0;
}

/** Redondeo de kg / stock como en ventas por peso. */
export function roundBagLooseQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e6) / 1e6;
}

export function previewLooseSale(
  stock: BagLooseStock,
  sellKg: number,
): LooseSalePreview {
  const kg = roundBagLooseQty(sellKg);
  if (!(kg > 0)) {
    return {
      ok: false,
      error: "Ingresá cuántos kilos vendés.",
      bagsToOpen: 0,
      openKgAfter: stock.openBagKg,
      closedAfter: stock.closedBags,
    };
  }
  const bagKg = Number(stock.bagKg);
  if (!(bagKg > 0)) {
    return {
      ok: false,
      error: "Falta cargar los kilos por bolsa en el producto.",
      bagsToOpen: 0,
      openKgAfter: stock.openBagKg,
      closedAfter: stock.closedBags,
    };
  }

  let closed = Math.floor(Number(stock.closedBags) + EPS);
  let open = roundBagLooseQty(Math.max(0, Number(stock.openBagKg) || 0));
  let bagsToOpen = 0;
  let need = kg;

  while (need > open + EPS) {
    if (closed < 1) {
      return {
        ok: false,
        error: "No hay stock suficiente (bolsas cerradas ni kilos abiertos).",
        bagsToOpen,
        openKgAfter: open,
        closedAfter: closed,
      };
    }
    closed -= 1;
    bagsToOpen += 1;
    open = roundBagLooseQty(open + bagKg);
  }

  open = roundBagLooseQty(open - need);
  if (open < 0 && open > -EPS) open = 0;

  return {
    ok: true,
    bagsToOpen,
    openKgAfter: open,
    closedAfter: closed,
  };
}

export function canSellBag(closedBags: number, qty = 1): boolean {
  return Math.floor(Number(closedBags) + EPS) >= qty;
}

/** Texto de stock: «4 bolsas · abierta 1,2 kg». */
export function formatBagLooseStock(
  closedBags: number,
  openBagKg: number,
  formatQty: (n: number) => string,
): string {
  const closed = Math.max(0, Math.floor(Number(closedBags) + EPS));
  const open = roundBagLooseQty(Math.max(0, Number(openBagKg) || 0));
  const bagWord = closed === 1 ? "bolsa" : "bolsas";
  if (open > EPS) {
    return `${formatQty(closed)} ${bagWord} · abierta ${formatQty(open)} kg`;
  }
  return `${formatQty(closed)} ${bagWord}`;
}

/** Hint del modal: «Se abre N bolsa(s) · quedan X kg». */
export function looseSaleHint(
  preview: LooseSalePreview,
  formatQty: (n: number) => string,
): string | null {
  if (!preview.ok) return preview.error ?? null;
  if (preview.bagsToOpen <= 0) {
    return `Quedan ${formatQty(preview.openKgAfter)} kg en la bolsa abierta`;
  }
  const n = preview.bagsToOpen;
  const word = n === 1 ? "bolsa" : "bolsas";
  return `Se abre ${n} ${word} · quedan ${formatQty(preview.openKgAfter)} kg`;
}
