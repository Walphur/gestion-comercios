import type { CustomerLedgerEntry, SaleItem } from "../types";
import { formatDateShort, formatMoney } from "./format";

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
    case "payment_void":
      return "Anulación de cobro";
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
  const isVoid = m.reason === "payment_void";
  const parts: (string | null)[] = [
    isPayment ? `Cobró: ${m.user_name?.trim() || "sin dato"}` : null,
    isVoid ? `Anuló: ${m.user_name?.trim() || "sin dato"}` : null,
    isVoid && m.notes?.trim() ? `Motivo: ${m.notes.trim()}` : m.notes?.trim() || null,
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

function paymentKey(m: CustomerLedgerEntry): string | null {
  if (m.reference_type !== "customer_payment" || m.reference_id == null) return null;
  return `${m.device_id ?? ""}:${m.reference_id}`;
}

/**
 * Anulación de cada cobro: id del movimiento del cobro → movimiento `payment_void`.
 * Se unen por la PC que los anotó y el número de cobro de esa PC.
 */
export function paymentVoids(entries: CustomerLedgerEntry[]): Map<number, CustomerLedgerEntry> {
  const voids = new Map<string, CustomerLedgerEntry>();
  for (const m of entries) {
    const key = m.reason === "payment_void" ? paymentKey(m) : null;
    if (key && !voids.has(key)) voids.set(key, m);
  }
  const out = new Map<number, CustomerLedgerEntry>();
  for (const m of entries) {
    const key = m.reason === "payment" ? paymentKey(m) : null;
    const v = key ? voids.get(key) : undefined;
    if (v) out.set(m.id, v);
  }
  return out;
}

/**
 * Totales por concepto: suman exactamente lo que debe según los movimientos.
 * Las compras a fiado ya vienen netas de anulaciones y correcciones; lo pagado, de cobros anulados.
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
            : m.reason === "payment" || m.reason === "payment_void"
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

export interface PriceAdjustSegment {
  name: string;
  oldPrice: number;
  newPrice: number;
  saleIds: number[];
}

const PRICE_NOTE_SEGMENT =
  /(.+?): (\S+\s-?[\d.]+,\d{2}) → (\S+\s-?[\d.]+,\d{2}) · [\d.,]+ u\. \(ventas? ((?:#\d+(?:, )?)+)\)(?: · |$)/g;

function parseNoteMoney(text: string): number {
  const m = text.match(/-?[\d.]+,\d{2}/);
  return m ? Number(m[0].replace(/\./g, "").replace(",", ".")) : Number.NaN;
}

/** Lee la nota que deja el cambio de precio: producto, precio viejo → nuevo y ventas tocadas. */
export function parsePriceAdjustNote(notes: string | null | undefined): PriceAdjustSegment[] {
  const text = notes?.trim();
  if (!text) return [];
  const out: PriceAdjustSegment[] = [];
  for (const m of text.matchAll(PRICE_NOTE_SEGMENT)) {
    const saleIds = [...m[4].matchAll(/#(\d+)/g)].map((x) => Number(x[1])).filter((n) => n > 0);
    if (saleIds.length === 0) continue;
    out.push({
      name: m[1].trim(),
      oldPrice: parseNoteMoney(m[2]),
      newPrice: parseNoteMoney(m[3]),
      saleIds,
    });
  }
  return out;
}

export interface PriceShare {
  saleId: number;
  amount: number;
}

function allocate(total: number, weights: Map<number, number>): PriceShare[] {
  const sign = Math.sign(total);
  let picked: [number, number][] = [...weights].filter(([, w]) => w * sign > 0);
  if (picked.length === 0) {
    picked = [...weights]
      .filter(([, w]) => Math.abs(w) > 0)
      .map(([id, w]): [number, number] => [id, Math.abs(w) * sign]);
  }
  const sum = picked.reduce((acc, [, w]) => acc + w, 0);
  if (picked.length === 0 || Math.abs(sum) < 1e-9) return [];
  const shares = picked.map(([saleId, w]) => ({ saleId, amount: round2((total * w) / sum) }));
  const residual = round2(total - shares.reduce((acc, s) => acc + s.amount, 0));
  if (Math.abs(residual) >= 0.005) {
    const biggest = shares.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a));
    biggest.amount = round2(biggest.amount + residual);
  }
  return shares;
}

function effectiveUnits(it: SaleItem): number {
  return (Number(it.qty) || 0) * (1 - (Number(it.discount_pct) || 0) / 100);
}

/**
 * A qué compra corresponde cada cambio de precio (movimiento `price_adjust` → ventas e importes).
 * La nota guarda producto, precio viejo y nuevo y las ventas: se reparte según las unidades de ese
 * producto en cada venta. Los ajustes viejos sin nota se reparten entre las compras anteriores que
 * llevaban ese producto. Lo que no se puede ubicar queda sin repartir (y se sigue mostrando aparte).
 * Cada reparto suma exactamente el importe del movimiento.
 */
export function attributePriceAdjustments(
  entries: CustomerLedgerEntry[],
  itemsBySale: Map<number, SaleItem[]>,
): Map<number, PriceShare[]> {
  const firstIdx = new Map<number, number>();
  entries.forEach((m, i) => {
    const sale = ledgerSaleId(m);
    if (sale != null && !firstIdx.has(sale)) firstIdx.set(sale, i);
  });
  const out = new Map<number, PriceShare[]>();
  entries.forEach((m, i) => {
    if (m.reason !== "price_adjust" || !m.is_local || Math.abs(m.delta) < 0.005) return;
    const weights = new Map<number, number>();
    const segments = parsePriceAdjustNote(m.notes);
    if (segments.length > 0) {
      for (const seg of segments) {
        const diff = seg.newPrice - seg.oldPrice;
        const unitDiff = Number.isFinite(diff) && Math.abs(diff) > 0.0001 ? diff : Math.sign(m.delta);
        for (const saleId of seg.saleIds) {
          if (!firstIdx.has(saleId)) continue;
          const units = (itemsBySale.get(saleId) ?? [])
            .filter((it) => it.name.trim() === seg.name)
            .reduce((acc, it) => acc + effectiveUnits(it), 0);
          weights.set(saleId, (weights.get(saleId) ?? 0) + (units > 0 ? units : 1) * unitDiff);
        }
      }
    } else if (m.reference_id != null && (m.reference_type === "product" || m.reference_type === "variant")) {
      for (const [saleId, idx] of firstIdx) {
        if (idx > i) continue;
        const units = (itemsBySale.get(saleId) ?? [])
          .filter((it) =>
            m.reference_type === "variant"
              ? it.variant_id === m.reference_id
              : it.product_id === m.reference_id && !it.variant_id,
          )
          .reduce((acc, it) => acc + effectiveUnits(it), 0);
        if (units > 0) weights.set(saleId, units);
      }
    }
    const shares = allocate(m.delta, weights);
    if (shares.length > 0) out.set(m.id, shares);
  });
  return out;
}

/** Un cambio de precio de un artículo de la compra: cuándo y de cuánto a cuánto (precio unitario). */
export interface PriceStep {
  name: string;
  date: string;
  oldPrice: number;
  newPrice: number;
}

export interface FoldedLedgerEntry extends CustomerLedgerEntry {
  /** Cambios de precio sumados a esta compra (solo en la vista con el precio dentro de cada compra). */
  price_folded?: number;
  /** Detalle de esos cambios, si la nota del ajuste lo guardó. */
  price_steps?: PriceStep[];
}

/**
 * Misma cuenta, con cada cambio de precio sumado a la compra que actualizó: no cambia ningún movimiento
 * guardado ni el saldo final, solo cómo se muestra. Un cambio de precio que no se pudo ubicar (o que
 * `canFold` no deja mover) sigue como línea aparte con lo que le quedó.
 */
export function foldPriceAdjustments(
  entries: CustomerLedgerEntry[],
  shares: Map<number, PriceShare[]>,
  canFold: (priceMove: CustomerLedgerEntry, purchase: CustomerLedgerEntry) => boolean = () => true,
): FoldedLedgerEntry[] {
  const out: FoldedLedgerEntry[] = entries.map((m) => ({ ...m }));
  const drop = new Set<number>();
  out.forEach((p, i) => {
    const list = shares.get(p.id);
    if (!list) return;
    const segments = parsePriceAdjustNote(p.notes);
    for (const share of list) {
      const isPurchase = (m: CustomerLedgerEntry) => m.reason === "fiado" && saleRef(m) === share.saleId;
      let target = -1;
      for (let j = i - 1; j >= 0 && target < 0; j--) if (isPurchase(out[j])) target = j;
      for (let j = i + 1; j < out.length && target < 0; j++) if (isPurchase(out[j])) target = j;
      if (target < 0 || !canFold(p, out[target])) continue;
      const purchase = out[target];
      purchase.delta = round2(purchase.delta + share.amount);
      purchase.price_folded = round2((purchase.price_folded ?? 0) + share.amount);
      p.delta = round2(p.delta - share.amount);
      for (const seg of segments) {
        if (!seg.saleIds.includes(share.saleId)) continue;
        if (!Number.isFinite(seg.oldPrice) || !Number.isFinite(seg.newPrice)) continue;
        const steps = purchase.price_steps ?? [];
        const dup = steps.some(
          (s) => s.name === seg.name && s.date === p.created_at && s.oldPrice === seg.oldPrice && s.newPrice === seg.newPrice,
        );
        if (!dup) steps.push({ name: seg.name, date: p.created_at, oldPrice: seg.oldPrice, newPrice: seg.newPrice });
        purchase.price_steps = steps;
      }
    }
    if (Math.abs(p.delta) < 0.005) drop.add(p.id);
  });
  return out.filter((m) => !drop.has(m.id));
}

/** Atajo: reparte y suma los cambios de precio en cada compra. */
export function ledgerWithPricesInPurchases(
  entries: CustomerLedgerEntry[],
  itemsBySale: Map<number, SaleItem[]>,
): FoldedLedgerEntry[] {
  return foldPriceAdjustments(entries, attributePriceAdjustments(entries, itemsBySale));
}

/** Cambios de precio de los movimientos de una compra (puede tener varios si se corrigió). */
export function priceStepsOf(moves: CustomerLedgerEntry[]): PriceStep[] {
  return moves.flatMap((m) => (m as FoldedLedgerEntry).price_steps ?? []);
}

/** Cambios de precio de un artículo, por nombre, del más viejo al más nuevo. */
export function priceStepsForItem(steps: PriceStep[], itemName: string): PriceStep[] {
  const name = itemName.trim();
  return steps.filter((s) => s.name === name);
}

/** Los que no coinciden con ningún artículo de la compra (p. ej. se le cambió el nombre). */
export function priceStepsWithoutItem(steps: PriceStep[], items: SaleItem[]): PriceStep[] {
  const names = new Set(items.map((it) => it.name.trim()));
  return steps.filter((s) => !names.has(s.name));
}

function stepWentUp(s: PriceStep): boolean {
  return s.newPrice >= s.oldPrice;
}

/** «Aumentó el 10/11/2026: de $ 3.500,00 a $ 4.000,00». */
export function priceStepText(s: PriceStep, currency: string, withName = false): string {
  const verb = stepWentUp(s) ? "Aumentó" : "Bajó";
  const text = `${verb} el ${formatDateShort(s.date)}: de ${formatMoney(s.oldPrice, currency)} a ${formatMoney(s.newPrice, currency)}`;
  return withName ? `${s.name}: ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

function plainMoney(n: number, currency: string): string {
  return `${currency}${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Versión corta y sin tildes para ticket y WhatsApp: «Aumento 10/11/2026: $3.500,00 a $4.000,00». */
export function priceStepPlain(s: PriceStep, currency: string, withName = false): string {
  const text = `${stepWentUp(s) ? "Aumento" : "Baja"} ${formatDateShort(s.date)}: ${plainMoney(s.oldPrice, currency)} a ${plainMoney(s.newPrice, currency)}`;
  return withName ? `${s.name}: ${text}` : text;
}

/** Aviso chico para la fila de la compra: «incluye aumento del 10/11». */
export function priceStepsHint(steps: PriceStep[]): string | null {
  if (steps.length === 0) return null;
  const days = [...new Set(steps.map((s) => formatDateShort(s.date).slice(0, 5)))];
  const allDown = steps.every((s) => !stepWentUp(s));
  const what = allDown ? "baja de precio" : steps.length > 1 && days.length > 1 ? "aumentos" : "aumento";
  const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} y ${days[days.length - 1]}` : days[0];
  return `incluye ${what} del ${list}`;
}

export function hasPriceAdjustments(entries: CustomerLedgerEntry[]): boolean {
  return entries.some((m) => m.reason === "price_adjust");
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
