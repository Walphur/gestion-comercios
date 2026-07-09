import type { Quote, QuoteItem } from "../../types";
import { loadPrintBranding } from "../../config/printBranding";
import { formatDateShort, formatMoney, formatQty } from "../format";
import { formatVehicleLabel } from "../vehicleFormat";
import { escapeHtml, printHtml } from "../printHtml";
import { buildPrintFooter, buildPrintHeader } from "./printLayout";

const STATUS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviado",
  approved: "Aprobado",
  rejected: "Rechazado",
  converted: "Convertido",
};

export async function printQuoteDocument(
  businessName: string,
  currency: string,
  quote: Quote,
  items: QuoteItem[],
): Promise<void> {
  const branding = await loadPrintBranding(businessName);
  const vehicle =
    quote.vehicle_plate != null
      ? formatVehicleLabel({
          plate: quote.vehicle_plate,
          brand: quote.vehicle_brand,
          model: quote.vehicle_model,
        })
      : null;

  const rows = items
    .map(
      (it) => `<tr>
        <td>${escapeHtml(it.name)}</td>
        <td class="num">${formatQty(it.qty)}</td>
        <td class="num">${formatMoney(it.unit_price, currency)}</td>
        <td class="num">${it.discount_pct > 0 ? `${it.discount_pct}%` : "—"}</td>
        <td class="num">${formatMoney(it.line_total, currency)}</td>
      </tr>`,
    )
    .join("");

  const discountLine =
    quote.discount_pct > 0
      ? `<p>Descuento global: ${quote.discount_pct}%</p>`
      : "";

  const validLine = quote.valid_until
    ? ` · Válido hasta ${formatDateShort(quote.valid_until)}`
    : "";

  const header = buildPrintHeader(branding, [
    `Presupuesto ${quote.quote_number} · ${STATUS[quote.status] ?? quote.status}`,
    `Fecha: ${formatDateShort(quote.created_at)}${validLine}`,
  ]);

  const body = `
    ${header}
    <p><strong>Cliente:</strong> ${escapeHtml(quote.customer_name ?? "—")}</p>
    ${vehicle ? `<p><strong>Vehículo:</strong> ${escapeHtml(vehicle)}</p>` : ""}
    <table>
      <thead>
        <tr>
          <th>Descripción</th>
          <th class="num">Cant.</th>
          <th class="num">Precio</th>
          <th class="num">Desc.</th>
          <th class="num">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <p>Subtotal: ${formatMoney(quote.subtotal, currency)}</p>
      ${discountLine}
      <p class="grand">Total: ${formatMoney(quote.total, currency)}</p>
    </div>
    ${
      quote.notes
        ? `<div class="notes"><strong>Notas / condiciones</strong><br/>${escapeHtml(quote.notes)}</div>`
        : ""
    }
    ${buildPrintFooter(branding)}
  `;

  printHtml(`Presupuesto ${quote.quote_number}`, body);
}
