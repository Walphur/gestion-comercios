import type { CustomerLedgerEntry } from "../types";

export interface LedgerRow {
  m: CustomerLedgerEntry;
  balanceAfter: number;
}

export interface LedgerSummaryLine {
  key: string;
  label: string;
  amount: number;
}

function saleRef(m: CustomerLedgerEntry): number | null {
  return m.is_local && m.reference_type === "sale" && m.reference_id != null ? m.reference_id : null;
}

/** Venta local que se puede abrir para ver los productos. */
export function ledgerSaleId(m: CustomerLedgerEntry): number | null {
  return m.reason === "fiado" ? saleRef(m) : null;
}

export function ledgerConcept(m: CustomerLedgerEntry): string {
  const sale = saleRef(m);
  switch (m.reason) {
    case "payment":
      return "Pago de deuda";
    case "fiado":
      return sale != null ? `Compra a fiado · Venta #${sale}` : "Compra a fiado (otra caja)";
    case "adjust_down":
      return sale != null ? `Corrección de la venta #${sale}` : "Corrección de una venta a fiado";
    case "opening_balance":
      return "Deuda inicial (cargada al crear el cliente)";
    case "price_adjust": {
      const what = m.delta > 0 ? "Aumento de precio en lo fiado" : "Baja de precio en lo fiado";
      const product = m.is_local ? m.reference_label?.trim() : "";
      return product ? `${what} · ${product}` : what;
    }
    case "legacy_seed":
      return "Saldo anterior (lo que ya debía)";
    default:
      return m.delta > 0 ? "Suma a la deuda" : "Baja de la deuda";
  }
}

/** Texto chico debajo del concepto: medio, quién cobró, nota o explicación. */
export function ledgerDetailParts(m: CustomerLedgerEntry): string[] {
  const isPayment = m.reason === "payment";
  const parts: (string | null)[] = [
    isPayment ? `Cobró: ${m.user_name?.trim() || "sin dato"}` : null,
    m.notes?.trim() || null,
  ];
  if (!m.notes?.trim()) {
    if (m.reason === "price_adjust") {
      parts.push("Se actualizó lo fiado al precio nuevo del producto");
    } else if (m.reason === "legacy_seed") {
      parts.push("Saldo que la cuenta ya traía de antes; las compras viejas están en Ventas");
    }
  }
  return parts.filter((p): p is string => Boolean(p));
}

/** Movimientos del más viejo al más nuevo con el saldo después de cada uno. */
export function buildLedgerRows(entries: CustomerLedgerEntry[]): LedgerRow[] {
  let running = 0;
  return entries.map((m) => {
    running += m.delta;
    return { m, balanceAfter: Math.round(running * 100) / 100 };
  });
}

export function ledgerTotal(entries: CustomerLedgerEntry[]): number {
  return Math.round(entries.reduce((acc, m) => acc + m.delta, 0) * 100) / 100;
}

/**
 * Totales por concepto: suman exactamente lo que debe según los movimientos.
 * Las compras a fiado ya vienen netas de anulaciones y correcciones.
 */
export function summarizeLedger(entries: CustomerLedgerEntry[]): LedgerSummaryLine[] {
  const groups: Record<string, LedgerSummaryLine> = {
    start: { key: "start", label: "Saldo de arranque", amount: 0 },
    fiado: { key: "fiado", label: "Comprado a fiado", amount: 0 },
    price: { key: "price", label: "Cambios de precio en lo fiado", amount: 0 },
    payment: { key: "payment", label: "Pagado", amount: 0 },
    other: { key: "other", label: "Otros movimientos", amount: 0 },
  };
  for (const m of entries) {
    const key =
      m.reason === "opening_balance" || m.reason === "legacy_seed"
        ? "start"
        : m.reason === "fiado" || m.reason === "adjust_down"
          ? "fiado"
          : m.reason === "price_adjust"
            ? "price"
            : m.reason === "payment"
              ? "payment"
              : "other";
    groups[key].amount += m.delta;
  }
  return Object.values(groups)
    .map((g) => ({ ...g, amount: Math.round(g.amount * 100) / 100 }))
    .filter((g) => g.key === "fiado" || g.key === "payment" || Math.abs(g.amount) >= 0.005);
}

export interface LedgerSaleView {
  kind: "sale";
  key: string;
  saleId: number;
  date: string;
  /** Lo que suma hoy esa venta a la deuda (compra menos anulaciones y correcciones). */
  amount: number;
  /** Importe de la compra original. */
  firstAmount: number;
  corrections: number;
  voided: boolean;
  moves: CustomerLedgerEntry[];
  balanceAfter: number;
}

export interface LedgerMoveView {
  kind: "move";
  key: string;
  date: string;
  amount: number;
  m: CustomerLedgerEntry;
  balanceAfter: number;
}

export type LedgerView = LedgerSaleView | LedgerMoveView;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Una línea por venta a fiado (con sus correcciones adentro) y una por cada otro movimiento,
 * del más viejo al más nuevo, con el saldo después de cada línea. No se pierde ningún movimiento.
 * Las correcciones viejas no guardaban la venta: se asocian a la compra que se anotó justo después
 * (edición) o a la venta anulada con ese mismo importe.
 */
export function groupLedgerBySale(entries: CustomerLedgerEntry[], voidedSaleIds: Set<number>): LedgerView[] {
  const byId = [...entries].sort((a, b) => a.id - b.id);
  const saleOf = new Map<number, number>();
  for (let i = 0; i < byId.length; i++) {
    const m = byId[i];
    if (m.reason !== "fiado" && m.reason !== "adjust_down") continue;
    const ref = saleRef(m);
    if (ref != null) {
      saleOf.set(m.id, ref);
      continue;
    }
    if (m.reason === "adjust_down" && m.is_local) {
      const next = byId[i + 1];
      const nextSale = next && next.reason === "fiado" ? saleRef(next) : null;
      if (nextSale != null && next.created_at.slice(0, 16) === m.created_at.slice(0, 16)) {
        saleOf.set(m.id, nextSale);
      }
    }
  }

  const net = new Map<number, number>();
  for (const m of byId) {
    const sale = saleOf.get(m.id);
    if (sale != null) {
      net.set(sale, round2((net.get(sale) ?? 0) + m.delta));
      continue;
    }
    if (m.reason === "adjust_down" && m.is_local) {
      for (const id of voidedSaleIds) {
        const owed = net.get(id) ?? 0;
        if (owed > 0.005 && Math.abs(owed + m.delta) < 0.01) {
          saleOf.set(m.id, id);
          net.set(id, round2(owed + m.delta));
          break;
        }
      }
    }
  }

  const views: (Omit<LedgerSaleView, "balanceAfter"> | Omit<LedgerMoveView, "balanceAfter">)[] = [];
  const saleViews = new Map<number, Omit<LedgerSaleView, "balanceAfter">>();
  for (const m of entries) {
    const sale = saleOf.get(m.id);
    if (sale == null) {
      views.push({ kind: "move", key: `m${m.id}`, date: m.created_at, amount: m.delta, m });
      continue;
    }
    let v = saleViews.get(sale);
    if (!v) {
      v = {
        kind: "sale",
        key: `s${sale}`,
        saleId: sale,
        date: m.created_at,
        amount: 0,
        firstAmount: m.delta,
        corrections: 0,
        voided: voidedSaleIds.has(sale),
        moves: [],
      };
      saleViews.set(sale, v);
      views.push(v);
    }
    v.moves.push(m);
    v.amount = round2(v.amount + m.delta);
    if (m.reason === "adjust_down") v.corrections += 1;
  }

  let running = 0;
  return views.map((v) => {
    running = round2(running + v.amount);
    return { ...v, balanceAfter: running } as LedgerView;
  });
}

export interface SaleStep {
  key: string;
  date: string;
  kind: "compra" | "correccion" | "anulada";
  /** En una corrección: importe anterior y nuevo. */
  before?: number;
  after?: number;
  /** Cuánto movió la deuda ese paso. */
  delta: number;
  /** Movimientos de la cuenta que forman el paso (para la auditoría). */
  moves: CustomerLedgerEntry[];
}

/** Pasos de una venta: compra original, cada corrección (antes → ahora) y la anulación. */
export function saleMoveSteps(moves: CustomerLedgerEntry[]): SaleStep[] {
  const steps: SaleStep[] = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const next = moves[i + 1];
    if (m.reason === "adjust_down" && next && next.reason === "fiado") {
      steps.push({
        key: `c${m.id}`,
        date: m.created_at,
        kind: "correccion",
        before: -m.delta,
        after: next.delta,
        delta: round2(m.delta + next.delta),
        moves: [m, next],
      });
      i += 1;
    } else if (m.reason === "adjust_down") {
      steps.push({ key: `a${m.id}`, date: m.created_at, kind: "anulada", delta: m.delta, moves: [m] });
    } else {
      steps.push({ key: `f${m.id}`, date: m.created_at, kind: "compra", delta: m.delta, moves: [m] });
    }
  }
  return steps;
}
