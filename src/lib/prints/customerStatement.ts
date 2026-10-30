import { formatDateShort, formatMoney, formatQty, formatTime } from "../format";
import { formatPaymentMethod } from "../paymentLabels";
import { escapeHtml, printHtml } from "../printHtml";
import {
  buildLedgerRows,
  ledgerConcept,
  ledgerDetailParts,
  ledgerSaleId,
  ledgerTotal,
  paymentVoids,
  summarizeLedger,
} from "../customerLedger";
import type { CustomerLedgerEntry, SaleItem } from "../../types";

/** Estado de cuenta del cliente: todos los movimientos desde el primero, con el saldo de cada línea. */
export function printCustomerStatement(opts: {
  businessName: string;
  currency: string;
  customerName: string;
  ledger: CustomerLedgerEntry[];
  /** Saldo guardado en la ficha del cliente. */
  balance: number;
  itemsBySale: Map<number, SaleItem[]>;
}): void {
  const { currency } = opts;
  const money = (n: number) => escapeHtml(formatMoney(n, currency));
  const voids = paymentVoids(opts.ledger);
  const rows = buildLedgerRows(opts.ledger)
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
      const itemsHtml = items.length
        ? `<div class="items">${items
            .map(
              (it) =>
                `${escapeHtml(formatQty(it.qty))} × ${escapeHtml(it.name)} — ${money(it.line_total)}`,
            )
            .join("<br/>")}</div>`
        : "";
      return `<tr>
        <td class="nowrap">${escapeHtml(formatDateShort(m.created_at))} ${escapeHtml(formatTime(m.created_at))}</td>
        <td><strong${voidedBy ? ` style="text-decoration: line-through"` : ""}>${escapeHtml(ledgerConcept(m))}</strong>${detail ? `<div class="muted">${escapeHtml(detail)}</div>` : ""}${itemsHtml}</td>
        <td class="num">${m.delta > 0 ? money(m.delta) : ""}</td>
        <td class="num">${m.delta < 0 ? money(-m.delta) : ""}</td>
        <td class="num">${money(balanceAfter)}</td>
      </tr>`;
    })
    .join("");

  const total = ledgerTotal(opts.ledger);
  const diff = Math.round((opts.balance - total) * 100) / 100;
  const summary = summarizeLedger(opts.ledger)
    .map((g) => `<p>${escapeHtml(g.label)}: <strong>${money(g.amount)}</strong></p>`)
    .join("");
  const diffHtml =
    Math.abs(diff) >= 0.005
      ? `<p>Diferencia sin detalle: <strong>${money(diff)}</strong></p>`
      : "";

  const body = `
    <h1>${escapeHtml(opts.businessName)}</h1>
    <p class="muted">Estado de cuenta corriente · ${escapeHtml(opts.customerName)} · ${opts.ledger.length} movimientos</p>
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
    `.nowrap { white-space: nowrap; } .items { margin-top: 4px; font-size: 11px; color: #475569; }`,
  );
}
