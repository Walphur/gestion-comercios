import {
  getCustomerPaymentsByMethod,
  getSalesByPayment,
  type ReportScope,
  type ReportWindow,
  type SalesByPaymentRow,
} from "./reports";
import { isFiado } from "./sales";
import { roundMoney } from "./supplierAccounts";
import {
  accountForMethod,
  ACCOUNT_KIND_LABELS,
  defaultAccountKind,
  getMethodMap,
  listTreasuryAccounts,
  normalizeMethod,
  type MethodMap,
  type TreasuryAccount,
  type TreasuryAccountKind,
} from "./treasury";
import { formatPaymentMethod } from "../lib/paymentLabels";

export interface InflowLine {
  key: string;
  label: string;
  count: number;
  total: number;
  /** Cobro de una deuda de fiado, no una venta. */
  fromDebt: boolean;
}

export interface InflowPlace {
  key: string;
  label: string;
  /** null = medio sin cuenta asignada en Tesorería. */
  kind: TreasuryAccountKind | null;
  total: number;
  lines: InflowLine[];
}

export interface MoneyInflow {
  places: InflowPlace[];
  salesCollected: number;
  salesCollectedCount: number;
  debtPayments: number;
  debtPaymentsCount: number;
  /** Vendido a cuenta (fiado) que no entró. */
  onAccount: number;
  onAccountCount: number;
  /** Ventas cobradas más cobros de fiado. */
  totalIn: number;
}

const NO_ACCOUNT_KEY = "sin_cuenta";
const KIND_ORDER: TreasuryAccountKind[] = ["cajon", "banco", "mercadopago", "guardado", "otra"];

/** Medio de la línea: el normalizado, salvo los desconocidos, que quedan con su nombre. */
function lineKey(raw: string): string {
  const m = normalizeMethod(raw);
  if (m == null) return "efectivo";
  return m === "otro" ? raw.trim().toLowerCase() || "otro" : m;
}

function placeFor(
  raw: string,
  map: MethodMap,
  accounts: TreasuryAccount[],
): { key: string; label: string; kind: TreasuryAccountKind | null; order: number } {
  if (accounts.length === 0) {
    const m = normalizeMethod(raw);
    const kind = m == null ? "cajon" : defaultAccountKind(m);
    if (!kind) return { key: NO_ACCOUNT_KEY, label: "Sin cuenta asignada", kind: null, order: 999 };
    return {
      key: kind,
      label: kind === "cajon" ? "Efectivo" : ACCOUNT_KIND_LABELS[kind],
      kind,
      order: KIND_ORDER.indexOf(kind),
    };
  }
  const account = accountForMethod(raw, map, accounts);
  if (!account) return { key: NO_ACCOUNT_KEY, label: "Sin cuenta asignada", kind: null, order: 999 };
  return {
    key: `acc-${account.id}`,
    label: account.kind === "cajon" ? "Efectivo" : account.name,
    kind: account.kind,
    order: accounts.indexOf(account),
  };
}

/** Agrupa ventas y cobros de fiado por la cuenta a la que entra cada medio (reparto de Tesorería). */
export function buildMoneyInflow(
  sales: SalesByPaymentRow[],
  debtPayments: SalesByPaymentRow[],
  map: MethodMap,
  accounts: TreasuryAccount[],
): MoneyInflow {
  const places = new Map<string, InflowPlace>();
  const orderOf = new Map<string, number>();
  const out: MoneyInflow = {
    places: [],
    salesCollected: 0,
    salesCollectedCount: 0,
    debtPayments: 0,
    debtPaymentsCount: 0,
    onAccount: 0,
    onAccountCount: 0,
    totalIn: 0,
  };

  function add(row: SalesByPaymentRow, fromDebt: boolean) {
    const p = placeFor(row.payment_method, map, accounts);
    let place = places.get(p.key);
    if (!place) {
      place = { key: p.key, label: p.label, kind: p.kind, total: 0, lines: [] };
      places.set(p.key, place);
      orderOf.set(p.key, p.order);
    }
    const key = `${fromDebt ? "debt" : "sale"}-${lineKey(row.payment_method)}`;
    let line = place.lines.find((l) => l.key === key);
    if (!line) {
      line = { key, label: formatPaymentMethod(lineKey(row.payment_method)), count: 0, total: 0, fromDebt };
      place.lines.push(line);
    }
    line.count += row.count;
    line.total += row.total;
    place.total += row.total;
  }

  for (const row of sales) {
    if (isFiado(row.payment_method)) {
      out.onAccount += row.total;
      out.onAccountCount += row.count;
      continue;
    }
    out.salesCollected += row.total;
    out.salesCollectedCount += row.count;
    add(row, false);
  }
  for (const row of debtPayments) {
    if (isFiado(row.payment_method)) continue;
    out.debtPayments += row.total;
    out.debtPaymentsCount += row.count;
    add(row, true);
  }

  out.places = [...places.values()]
    .sort((a, b) => (orderOf.get(a.key) ?? 0) - (orderOf.get(b.key) ?? 0) || b.total - a.total)
    .map((place) => {
      const debtLines = place.lines.filter((l) => l.fromDebt).length;
      return {
        ...place,
        total: roundMoney(place.total),
        lines: place.lines
          .map((l) => ({
            ...l,
            total: roundMoney(l.total),
            label: !l.fromDebt ? l.label : debtLines > 1 ? `Cobros de fiado · ${l.label}` : "Cobros de fiado",
          }))
          .sort((a, b) => Number(a.fromDebt) - Number(b.fromDebt) || b.total - a.total),
      };
    });
  out.salesCollected = roundMoney(out.salesCollected);
  out.debtPayments = roundMoney(out.debtPayments);
  out.onAccount = roundMoney(out.onAccount);
  out.totalIn = roundMoney(out.salesCollected + out.debtPayments);
  return out;
}

/** Cuánto entró y dónde en el período, con los mismos filtros de Reportes (caja y cajero). */
export async function getMoneyInflow(window: ReportWindow, scope: ReportScope): Promise<MoneyInflow> {
  const [sales, debt, accounts, map] = await Promise.all([
    getSalesByPayment(window, scope),
    getCustomerPaymentsByMethod(window),
    listTreasuryAccounts(),
    getMethodMap(),
  ]);
  return buildMoneyInflow(sales, debt, map, accounts);
}
