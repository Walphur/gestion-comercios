import type { PrintBranding } from "../../config/printBranding";
import type { FiadoReport, FiadoReportTotals } from "../fiadoReport";
import { formatDateShort, formatMoney, formatQty, formatTime } from "../format";
import { escapeHtml, printHtml } from "../printHtml";
import { buildPrintFooter, buildPrintHeader } from "./printLayout";

function totalsLines(t: FiadoReportTotals, money: (n: number) => string): string {
  return [
    `<p>Saldo al inicio: <strong>${money(t.opening)}</strong></p>`,
    Math.abs(t.loaded) >= 0.005 ? `<p>Deuda anterior cargada: <strong>${money(t.loaded)}</strong></p>` : "",
    `<p>Total comprado: <strong>${money(t.bought)}</strong></p>`,
    `<p>Total pagado: <strong>${money(t.paid)}</strong></p>`,
  ].join("");
}

/** Detalle de fiado por cliente para presentar (organismo, empleador): datos del cliente, movimientos y saldos. */
export function printFiadoDetail(opts: {
  branding: PrintBranding;
  businessCuit: string | null;
  currency: string;
  report: FiadoReport;
}): void {
  const { report, currency } = opts;
  const money = (n: number) => escapeHtml(formatMoney(n, currency));
  const period = `${formatDateShort(report.period.from)} al ${formatDateShort(report.period.to)}`;

  const sections = report.customers
    .map((c) => {
      const who = [
        c.document ? `DNI / CUIT: ${escapeHtml(c.document)}` : "DNI / CUIT: —",
        c.address ? `Domicilio: ${escapeHtml(c.address)}` : "Domicilio: —",
        c.organization ? `Organismo: ${escapeHtml(c.organization)}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const rows = c.moves
        .map((mv) => {
          const items = mv.items.length
            ? `<div class="items">${mv.items
                .map((it) => `${escapeHtml(formatQty(it.qty))} × ${escapeHtml(it.name)} = ${money(it.line_total)}`)
                .join("<br/>")}</div>`
            : "";
          return `<tr>
            <td class="nowrap">${escapeHtml(formatDateShort(mv.m.created_at))} ${escapeHtml(formatTime(mv.m.created_at))}</td>
            <td><strong${mv.voided ? ` style="text-decoration: line-through"` : ""}>${escapeHtml(mv.concept)}</strong>${
              mv.detail ? `<div class="muted">${escapeHtml(mv.detail)}</div>` : ""
            }${items}</td>
            <td class="num">${mv.m.delta > 0 ? money(mv.m.delta) : ""}</td>
            <td class="num">${mv.m.delta < 0 ? money(-mv.m.delta) : ""}</td>
            <td class="num">${money(mv.balanceAfter)}</td>
          </tr>`;
        })
        .join("");
      return `<section class="customer">
        <h2>${escapeHtml(c.name)}</h2>
        <p class="who">${who}</p>
        <table>
          <thead><tr>
            <th>Fecha</th><th>Concepto</th><th class="num">Debe</th><th class="num">Pagó</th><th class="num">Saldo</th>
          </tr></thead>
          <tbody>
            <tr><td class="nowrap">${escapeHtml(formatDateShort(report.period.from))}</td><td><strong>Saldo al inicio del período</strong></td><td></td><td></td><td class="num">${money(c.totals.opening)}</td></tr>
            ${rows || `<tr><td colspan="5" class="muted">Sin compras ni pagos en el período</td></tr>`}
          </tbody>
        </table>
        <div class="sub">
          ${totalsLines(c.totals, money)}
          <p class="grand-sm">Saldo al ${escapeHtml(formatDateShort(report.period.to))}: ${money(c.totals.closing)}</p>
        </div>
      </section>`;
    })
    .join("");

  const meta = [
    `Detalle de fiado (cuenta corriente) · ${period}`,
    ...(opts.businessCuit ? [`CUIT del comercio: ${opts.businessCuit}`] : []),
    ...(report.organization ? [`Organismo: ${report.organization}`] : []),
    `${report.customers.length} ${report.customers.length === 1 ? "cliente" : "clientes"}`,
  ];

  const body = `
    ${buildPrintHeader(opts.branding, meta)}
    ${sections || `<p class="muted">No hay clientes con fiado en el período.</p>`}
    <div class="totals">
      <p><strong>Totales del período</strong></p>
      ${totalsLines(report.totals, money)}
      <p class="grand">Saldo al ${escapeHtml(formatDateShort(report.period.to))}: ${money(report.totals.closing)}</p>
    </div>
    ${buildPrintFooter(opts.branding)}
  `;
  printHtml(
    `Detalle de fiado · ${period}`,
    body,
    `.nowrap { white-space: nowrap; }
     .items { margin-top: 4px; font-size: 11px; color: #475569; }
     .customer { break-inside: avoid-page; margin-top: 18px; }
     .customer h2 { font-size: 14px; margin: 0; }
     .customer .who { margin: 2px 0 0; font-size: 11px; color: #334155; }
     .customer table { margin-top: 8px; }
     .sub { text-align: right; font-size: 11px; }
     .sub p { margin: 2px 0; }
     .grand-sm { font-weight: 700; font-size: 13px; }`,
  );
}
