import type { CustomerLedgerEntry, SaleItem } from "../types";
import { listFiadoLedgerUntil, listSaleItemsForSales, type FiadoLedgerRow } from "../db/fiadoReport";
import { ledgerConcept, ledgerDetailParts, ledgerSaleId, paymentVoids } from "./customerLedger";
import { formatDateShort, formatQty, formatTime, shiftYmd, todayYmd } from "./format";
import { formatPaymentMethod } from "./paymentLabels";

export interface FiadoPeriod {
  from: string;
  to: string;
}

export interface FiadoReportMove {
  m: CustomerLedgerEntry;
  concept: string;
  /** Medio, quién cobró, nota y, si se anuló el cobro, quién y por qué. */
  detail: string;
  saleId: number | null;
  items: SaleItem[];
  /** Cobro anulado (dentro del período o antes del cierre). */
  voided: boolean;
  balanceAfter: number;
}

export interface FiadoReportTotals {
  opening: number;
  /** Deuda anterior cargada a mano en el período (deuda inicial o saldo traído). */
  loaded: number;
  /** Compras a fiado con sus correcciones, anulaciones y cambios de precio. */
  bought: number;
  /** Cobros, neto de los anulados. */
  paid: number;
  closing: number;
}

export interface FiadoReportCustomer {
  id: number;
  name: string;
  document: string;
  address: string;
  organization: string;
  moves: FiadoReportMove[];
  totals: FiadoReportTotals;
}

export interface FiadoReport {
  period: FiadoPeriod;
  organization: string;
  customers: FiadoReportCustomer[];
  totals: FiadoReportTotals;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function thisMonthPeriod(today = todayYmd()): FiadoPeriod {
  return { from: monthStart(today), to: today };
}

export function previousMonthPeriod(today = todayYmd()): FiadoPeriod {
  const lastDay = shiftYmd(monthStart(today), -1);
  return { from: monthStart(lastDay), to: lastDay };
}

function emptyTotals(): FiadoReportTotals {
  return { opening: 0, loaded: 0, bought: 0, paid: 0, closing: 0 };
}

function addTo(t: FiadoReportTotals, m: CustomerLedgerEntry): void {
  if (m.reason === "payment" || m.reason === "payment_void") t.paid -= m.delta;
  else if (m.reason === "opening_balance" || m.reason === "legacy_seed") t.loaded += m.delta;
  else t.bought += m.delta;
}

function roundTotals(t: FiadoReportTotals): FiadoReportTotals {
  return {
    opening: round2(t.opening),
    loaded: round2(t.loaded),
    bought: round2(t.bought),
    paid: round2(t.paid),
    closing: round2(t.closing),
  };
}

function moveDetail(m: CustomerLedgerEntry, voidedBy: CustomerLedgerEntry | undefined): string {
  return [
    (m.reason === "payment" || m.reason === "payment_void") && m.payment_method
      ? formatPaymentMethod(m.payment_method)
      : null,
    ...ledgerDetailParts(m),
    voidedBy
      ? `ANULADO por ${voidedBy.user_name?.trim() || "sin dato"} el ${formatDateShort(voidedBy.created_at)}${
          voidedBy.notes?.trim() ? ` (${voidedBy.notes.trim()})` : ""
        }`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Detalle de fiado del período, desde el libro de cuenta corriente (lo mismo que el historial del cliente):
 * saldo al inicio, cada movimiento con los productos de la venta, totales y saldo al final.
 * Entran los clientes con movimientos en el período o que ya debían (o tenían a favor) al empezar.
 */
export function buildFiadoReport(
  rows: FiadoLedgerRow[],
  period: FiadoPeriod,
  itemsBySale: Map<number, SaleItem[]>,
  organization = "",
): FiadoReport {
  const byCustomer = new Map<number, FiadoLedgerRow[]>();
  for (const r of rows) {
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push(r);
    byCustomer.set(r.customer_id, list);
  }

  const customers: FiadoReportCustomer[] = [];
  const grand = emptyTotals();
  for (const list of byCustomer.values()) {
    const first = list[0];
    const voids = paymentVoids(list);
    const totals = emptyTotals();
    let running = 0;
    const moves: FiadoReportMove[] = [];
    for (const m of list) {
      const day = m.created_at.slice(0, 10);
      if (day < period.from) {
        running += m.delta;
        continue;
      }
      if (moves.length === 0) totals.opening = round2(running);
      running += m.delta;
      addTo(totals, m);
      const saleId = ledgerSaleId(m);
      moves.push({
        m,
        concept: ledgerConcept(m),
        detail: moveDetail(m, m.reason === "payment" ? voids.get(m.id) : undefined),
        saleId,
        items: saleId != null ? (itemsBySale.get(saleId) ?? []) : [],
        voided: m.reason === "payment" && voids.has(m.id),
        balanceAfter: round2(running),
      });
    }
    if (moves.length === 0) totals.opening = round2(running);
    totals.closing = round2(running);
    if (moves.length === 0 && Math.abs(totals.opening) < 0.005) continue;
    for (const k of ["opening", "loaded", "bought", "paid", "closing"] as const) grand[k] += totals[k];
    customers.push({
      id: first.customer_id,
      name: first.customer_name?.trim() || "Sin nombre",
      document: first.customer_document?.trim() ?? "",
      address: first.customer_address?.trim() ?? "",
      organization: first.customer_organization?.trim() ?? "",
      moves,
      totals: roundTotals(totals),
    });
  }
  customers.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  return { period, organization: organization.trim(), customers, totals: roundTotals(grand) };
}

export async function loadFiadoReport(
  period: FiadoPeriod,
  filters: { organization?: string; customerId?: number | null } = {},
): Promise<FiadoReport> {
  const rows = await listFiadoLedgerUntil(period.to, filters);
  const saleIds = rows
    .filter((m) => m.created_at.slice(0, 10) >= period.from)
    .map((m) => ledgerSaleId(m))
    .filter((id): id is number => id != null);
  const items = await listSaleItemsForSales(saleIds);
  return buildFiadoReport(rows, period, items, filters.organization ?? "");
}

export function itemsLine(items: SaleItem[], money: (n: number) => string): string {
  return items.map((it) => `${formatQty(it.qty)} × ${it.name} = ${money(it.line_total)}`).join("; ");
}

/** Número para Excel en español: coma decimal, sin separador de miles. */
function csvNumber(n: number): string {
  return round2(n).toFixed(2).replace(".", ",");
}

function csvCell(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Una fila por movimiento con los datos del cliente repetidos, para filtrar en Excel. Separador «;». */
export function fiadoReportCsv(report: FiadoReport, businessName: string): string {
  const lines: string[][] = [
    ["WalQo - Detalle de fiado"],
    ["Comercio", businessName],
    ["Período", `${formatDateShort(report.period.from)} al ${formatDateShort(report.period.to)}`],
    ...(report.organization ? [["Organismo", report.organization]] : []),
    [],
    [
      "Cliente",
      "DNI / CUIT",
      "Domicilio",
      "Organismo",
      "Fecha",
      "Hora",
      "Concepto",
      "Venta Nº",
      "Productos",
      "Detalle",
      "Debe",
      "Pagó",
      "Saldo",
    ],
  ];
  const plainMoney = (n: number) => `$ ${csvNumber(n)}`;
  for (const c of report.customers) {
    const who = [c.name, c.document, c.address, c.organization];
    lines.push([
      ...who,
      formatDateShort(report.period.from),
      "",
      "Saldo al inicio del período",
      "",
      "",
      "",
      "",
      "",
      csvNumber(c.totals.opening),
    ]);
    for (const mv of c.moves) {
      lines.push([
        ...who,
        formatDateShort(mv.m.created_at),
        formatTime(mv.m.created_at),
        mv.concept,
        mv.saleId != null ? String(mv.saleId) : "",
        itemsLine(mv.items, plainMoney),
        mv.detail,
        mv.m.delta > 0 ? csvNumber(mv.m.delta) : "",
        mv.m.delta < 0 ? csvNumber(-mv.m.delta) : "",
        csvNumber(mv.balanceAfter),
      ]);
    }
  }
  const t = report.totals;
  lines.push(
    [],
    ["TOTALES"],
    ["Clientes", String(report.customers.length)],
    ["Saldo al inicio", csvNumber(t.opening)],
    ...(Math.abs(t.loaded) >= 0.005 ? [["Deuda anterior cargada", csvNumber(t.loaded)]] : []),
    ["Total comprado", csvNumber(t.bought)],
    ["Total pagado", csvNumber(t.paid)],
    ["Saldo al final", csvNumber(t.closing)],
  );
  return lines.map((cols) => cols.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
