import { formatDateShort, formatMoney, formatQty, formatTime } from "../format";
import { formatPaymentMethod } from "../paymentLabels";
import { escapeHtml, printHtml } from "../printHtml";
import {
  buildLedgerRows,
  groupLedgerBySale,
  ledgerConcept,
  ledgerDetailParts,
  ledgerSaleId,
  ledgerTotal,
  ledgerWithPricesInPurchases,
  paymentVoids,
  priceStepPlain,
  priceStepsForItem,
  priceStepsOf,
  priceStepsWithoutItem,
  priceStepText,
  summarizeLedger,
  type PriceStep,
} from "../customerLedger";
import type { CustomerLedgerEntry, SaleItem } from "../../types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Artículos de una compra para imprimir, cada uno con cuándo y cuánto aumentó (si se sumó a la compra). */
export function saleItemsHtml(items: SaleItem[], steps: PriceStep[], currency: string, sep: string): string {
  if (items.length === 0 && steps.length === 0) return "";
  const money = (n: number) => escapeHtml(formatMoney(n, currency));
  const stepHtml = (s: PriceStep, withName = false) =>
    `<div class="price-step">${escapeHtml(priceStepText(s, currency, withName))}</div>`;
  const lines = items.map(
    (it) =>
      `<div>${escapeHtml(formatQty(it.qty))} × ${escapeHtml(it.name)}${sep}${money(it.line_total)}</div>${priceStepsForItem(
        steps,
        it.name,
      )
        .map((s) => stepHtml(s))
        .join("")}`,
  );
  lines.push(...priceStepsWithoutItem(steps, items).map((s) => stepHtml(s, true)));
  return `<div class="items">${lines.join("")}</div>`;
}

export const PRICE_STEP_CSS = `.price-step { padding-left: 12px; font-size: 10.5px; color: #92400e; }`;

/** Detalle de la venta (quién retiró, para qué…) debajo del concepto. */
export function saleNoteHtml(note: string | null | undefined): string {
  return note ? `<div class="sale-note">Detalle: ${escapeHtml(note)}</div>` : "";
}

export const SALE_NOTE_CSS = `.sale-note { font-size: 11px; font-style: italic; color: #1e293b; overflow-wrap: anywhere; }`;

/** Estado de cuenta del cliente: todos los movimientos desde el primero, con el saldo de cada línea. */
export function printCustomerStatement(opts: {
  businessName: string;
  currency: string;
  customerName: string;
  ledger: CustomerLedgerEntry[];
  /** Saldo guardado en la ficha del cliente. */
  balance: number;
  itemsBySale: Map<number, SaleItem[]>;
  /** Cambios de precio sumados a cada compra en vez de renglón aparte. */
  pricesInPurchase: boolean;
  /** Detalle de cada venta (quién retiró, para qué…). */
  notesBySale?: Map<number, string>;
}): void {
  const { currency } = opts;
  const money = (n: number) => escapeHtml(formatMoney(n, currency));
  const ledger = opts.pricesInPurchase ? ledgerWithPricesInPurchases(opts.ledger, opts.itemsBySale) : opts.ledger;
  const voids = paymentVoids(ledger);
  const rows = buildLedgerRows(ledger)
    .map(({ m, balanceAfter }) => {
      const voidedBy = voids.get(m.id);
      const detail = [
        (m.reason === "payment" || m.reason === "payment_void") && m.payment_method
          ? formatPaymentMethod(m.payment_method)
          : null,
        ...ledgerDetailParts(m),
        voidedBy
          ? `ANULADO por ${voidedBy.user_name?.trim() || "sin dato"} el ${formatDateShort(voidedBy.created_at)} ${formatTime(
              voidedBy.created_at,
            )}${voidedBy.notes?.trim() ? ` (${voidedBy.notes.trim()})` : ""}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const saleId = ledgerSaleId(m);
      const items = saleId != null ? (opts.itemsBySale.get(saleId) ?? []) : [];
      const itemsHtml = saleItemsHtml(items, priceStepsOf([m]), currency, " — ");
      const saleNote = saleId != null && m.reason === "fiado" ? opts.notesBySale?.get(saleId) : undefined;
      return `<tr>
        <td class="nowrap">${escapeHtml(formatDateShort(m.created_at))} ${escapeHtml(formatTime(m.created_at))}</td>
        <td><strong${voidedBy ? ` style="text-decoration: line-through"` : ""}>${escapeHtml(ledgerConcept(m))}</strong>${saleNoteHtml(saleNote)}${detail ? `<div class="muted">${escapeHtml(detail)}</div>` : ""}${itemsHtml}</td>
        <td class="num">${m.delta > 0 ? money(m.delta) : ""}</td>
        <td class="num">${m.delta < 0 ? money(-m.delta) : ""}</td>
        <td class="num">${money(balanceAfter)}</td>
      </tr>`;
    })
    .join("");

  const total = ledgerTotal(ledger);
  const diff = Math.round((opts.balance - total) * 100) / 100;
  const summary = summarizeLedger(ledger)
    .map((g) => `<p>${escapeHtml(g.label)}: <strong>${money(g.amount)}</strong></p>`)
    .join("");
  const diffHtml =
    Math.abs(diff) >= 0.005
      ? `<p>Diferencia sin detalle: <strong>${money(diff)}</strong></p>`
      : "";

  const body = `
    <h1>${escapeHtml(opts.businessName)}</h1>
    <p class="muted">Estado de cuenta corriente · ${escapeHtml(opts.customerName)} · ${ledger.length} movimientos</p>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Concepto</th>
          <th class="num">Debe</th>
          <th class="num">Pagó</th>
          <th class="num">Saldo</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="5">Sin movimientos</td></tr>`}</tbody>
    </table>
    <div class="totals">
      ${summary}
      ${diffHtml}
      <p class="grand">Debe hoy: ${money(opts.balance)}</p>
    </div>
  `;
  printHtml(
    `Estado de cuenta · ${opts.customerName}`,
    body,
    `.nowrap { white-space: nowrap; } .items { margin-top: 4px; font-size: 11px; color: #475569; } ${PRICE_STEP_CSS} ${SALE_NOTE_CSS}`,
  );
}

export interface RecentStatementLine {
  key: string;
  date: string;
  label: string;
  amount: number;
  items: SaleItem[];
  /** Cambios de precio sumados a esta compra. */
  steps: PriceStep[];
  /** Detalle de la venta (quién retiró, para qué…). */
  note?: string;
}

export interface RecentStatement {
  /** Lo que ya debía antes de la primera línea (o a favor, si es negativo). */
  opening: number;
  lines: RecentStatementLine[];
  balance: number;
}

/**
 * Lo que forma la deuda de hoy, para mandar o imprimir en ticket: compras y pagos desde la última vez
 * que la cuenta quedó en cero (como mucho las últimas `maxLines`). Lo anterior va como saldo anterior,
 * así las líneas siempre suman lo que debe.
 */
export function buildRecentStatement(opts: {
  ledger: CustomerLedgerEntry[];
  itemsBySale: Map<number, SaleItem[]>;
  voidedSaleIds: Set<number>;
  balance: number;
  pricesInPurchase: boolean;
  maxLines?: number;
  notesBySale?: Map<number, string>;
}): RecentStatement {
  const ledger = opts.pricesInPurchase ? ledgerWithPricesInPurchases(opts.ledger, opts.itemsBySale) : opts.ledger;
  const views = groupLedgerBySale(ledger, opts.voidedSaleIds);
  let start = 0;
  views.forEach((v, i) => {
    if (v.balanceAfter <= 0.005) start = i + 1;
  });
  start = Math.max(start, views.length - (opts.maxLines ?? 30));
  const shown = views.slice(start);

  const voids = paymentVoids(ledger);
  const shownIds = new Set(shown.flatMap((v) => (v.kind === "move" ? [v.m.id] : [])));
  const skip = new Set<number>();
  for (const [paymentId, voidMove] of voids) {
    if (shownIds.has(paymentId) && shownIds.has(voidMove.id)) {
      skip.add(paymentId);
      skip.add(voidMove.id);
    }
  }

  const lines: RecentStatementLine[] = [];
  for (const v of shown) {
    if (v.kind === "sale") {
      if (Math.abs(v.amount) < 0.005) continue;
      lines.push({
        key: v.key,
        date: v.date,
        label: `Compra · Venta #${v.saleId}`,
        amount: v.amount,
        items: v.voided ? [] : (opts.itemsBySale.get(v.saleId) ?? []),
        steps: v.voided ? [] : priceStepsOf(v.moves),
        note: opts.notesBySale?.get(v.saleId),
      });
      continue;
    }
    const m = v.m;
    if (skip.has(m.id) || Math.abs(m.delta) < 0.005) continue;
    lines.push({
      key: v.key,
      date: m.created_at,
      label:
        m.reason === "payment"
          ? `Pago${m.payment_method ? ` (${formatPaymentMethod(m.payment_method)})` : ""}`
          : ledgerConcept(m),
      amount: m.delta,
      items: [],
      steps: [],
    });
  }
  const shownSum = lines.reduce((acc, l) => acc + l.amount, 0);
  return { opening: round2(opts.balance - shownSum), lines, balance: round2(opts.balance) };
}

function signedAmount(n: number, currency: string): string {
  return n < 0 ? `− ${formatMoney(-n, currency)}` : formatMoney(n, currency);
}

function balanceLabel(balance: number): string {
  return balance < -0.005 ? "A favor" : "Debe hoy";
}

/** Texto para mandar la cuenta por WhatsApp. */
export function customerStatementWhatsApp(
  s: RecentStatement,
  opts: { businessName: string; customerName: string; currency: string },
): string {
  const money = (n: number) => formatMoney(n, opts.currency);
  const out = [`*${opts.businessName.trim() || "Cuenta corriente"}*`, `Cuenta de ${opts.customerName}`, ""];
  if (Math.abs(s.opening) >= 0.005) out.push(`Saldo anterior: ${signedAmount(s.opening, opts.currency)}`, "");
  for (const l of s.lines) {
    out.push(`${formatDateShort(l.date)} · ${l.label}: ${signedAmount(l.amount, opts.currency)}`);
    if (l.note) out.push(`   Detalle: ${l.note}`);
    for (const it of l.items) {
      out.push(`   ${formatQty(it.qty)} × ${it.name}: ${money(it.line_total)}`);
      for (const st of priceStepsForItem(l.steps, it.name)) out.push(`      ${priceStepPlain(st, opts.currency)}`);
    }
    for (const st of priceStepsWithoutItem(l.steps, l.items)) out.push(`      ${priceStepPlain(st, opts.currency, true)}`);
  }
  if (s.lines.length === 0 && Math.abs(s.opening) < 0.005) out.push("Sin compras ni pagos pendientes.");
  out.push("", `*${balanceLabel(s.balance)}: ${money(Math.abs(s.balance))}*`);
  return out.join("\n");
}

/** La misma cuenta en papel de ticket (58 u 80 mm según la impresora configurada). */
export function printCustomerStatementTicket(
  s: RecentStatement,
  opts: { businessName: string; customerName: string; currency: string; widthChars: number },
): void {
  const paperMm = opts.widthChars <= 34 ? 58 : 80;
  const money = (n: number) => escapeHtml(formatMoney(n, opts.currency));
  const signed = (n: number) => escapeHtml(signedAmount(n, opts.currency));
  const row = (left: string, right: string, cls = "") =>
    `<div class="row ${cls}"><span>${left}</span><span class="num">${right}</span></div>`;
  const when = new Date().toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = s.lines
    .map((l) => {
      const step = (st: PriceStep, withName = false) =>
        `<p class="step">${escapeHtml(priceStepPlain(st, opts.currency, withName))}</p>`;
      const items = [
        ...l.items.map(
          (it) =>
            row(`${escapeHtml(formatQty(it.qty))} × ${escapeHtml(it.name)}`, money(it.line_total), "item") +
            priceStepsForItem(l.steps, it.name)
              .map((st) => step(st))
              .join(""),
        ),
        ...priceStepsWithoutItem(l.steps, l.items).map((st) => step(st, true)),
      ].join("");
      return `<div class="line">${row(
        `<strong>${escapeHtml(formatDateShort(l.date))} · ${escapeHtml(l.label)}</strong>`,
        `<strong>${signed(l.amount)}</strong>`,
      )}${l.note ? `<p class="note">Detalle: ${escapeHtml(l.note)}</p>` : ""}${items}</div>`;
    })
    .join("");

  const body = `
    <div class="receipt">
      <h1>${escapeHtml(opts.businessName)}</h1>
      <p class="center">ESTADO DE CUENTA</p>
      <p>${escapeHtml(opts.customerName)}</p>
      <p>${escapeHtml(when)}</p>
      <hr />
      ${Math.abs(s.opening) >= 0.005 ? `${row("Saldo anterior", signed(s.opening))}<hr />` : ""}
      ${lines || `<p>Sin compras ni pagos pendientes.</p>`}
      <hr />
      ${row(balanceLabel(s.balance).toUpperCase(), money(Math.abs(s.balance)), "total")}
    </div>
  `;

  const css = `
    @page { size: ${paperMm}mm auto; margin: 3mm; }
    body { padding: 0 !important; font-size: ${paperMm === 58 ? 11 : 12}px !important; }
    .receipt { width: 100%; }
    .receipt h1 { font-size: ${paperMm === 58 ? 14 : 16}px; margin: 0 0 2px; text-align: center; }
    .receipt p { margin: 1px 0; }
    .receipt .center { text-align: center; }
    .receipt hr { border: 0; border-top: 1px dashed #64748b; margin: 6px 0; }
    .receipt .line { margin: 0 0 5px; }
    .receipt .row { display: flex; justify-content: space-between; gap: 8px; }
    .receipt .row > span:first-child { min-width: 0; overflow-wrap: anywhere; }
    .receipt .row .num { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .receipt .item { padding-left: 8px; color: #334155; }
    .receipt .step { padding-left: 16px; font-size: 0.9em; }
    .receipt .note { padding-left: 8px; font-style: italic; overflow-wrap: anywhere; }
    .receipt .total { font-size: 1.25em; font-weight: 800; margin: 2px 0 4px; }
  `;

  printHtml(`Estado de cuenta · ${opts.customerName}`, body, css, { brandHeader: false });
}
