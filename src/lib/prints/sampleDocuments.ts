import { loadPrintBranding } from "../../config/printBranding";
import { formatMoney } from "../format";
import { printHtml, escapeHtml } from "../printHtml";
import { buildPrintFooter, buildPrintHeader } from "./printLayout";

/** Abre una vista de ejemplo de presupuesto / remito con la info de impresión cargada. */
export async function previewSamplePrintDocuments(
  businessName: string,
  currency: string,
): Promise<void> {
  const branding = await loadPrintBranding(businessName);
  const headerQuote = buildPrintHeader(branding, [
    "Presupuesto PREV-DEMO · Ejemplo",
    "Fecha: hoy · Válido 15 días",
  ]);
  const headerRemito = buildPrintHeader(branding, [
    "Remito R-DEMO · Ejemplo",
    "Fecha: hoy · Sin factura inmediata",
  ]);
  const footer = buildPrintFooter(branding);

  const quoteRows = [
    ["Servicio / producto de ejemplo", "1", formatMoney(15000, currency), "—", formatMoney(15000, currency)],
    ["Insumo / repuesto demo", "2", formatMoney(2500, currency), "10%", formatMoney(4500, currency)],
  ]
    .map(
      ([name, qty, price, disc, total]) => `<tr>
      <td>${escapeHtml(name)}</td>
      <td class="num">${escapeHtml(qty)}</td>
      <td class="num">${escapeHtml(price)}</td>
      <td class="num">${escapeHtml(disc)}</td>
      <td class="num">${escapeHtml(total)}</td>
    </tr>`,
    )
    .join("");

  const remitoRows = [
    ["Producto demo A", "3", "u."],
    ["Producto demo B", "1", "u."],
  ]
    .map(
      ([name, qty, unit]) => `<tr>
      <td>${escapeHtml(name)}</td>
      <td class="num">${escapeHtml(qty)}</td>
      <td>${escapeHtml(unit)}</td>
    </tr>`,
    )
    .join("");

  const body = `
    <section style="margin-bottom:32px">
      ${headerQuote}
      <p><strong>Cliente:</strong> Cliente de ejemplo</p>
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
        <tbody>${quoteRows}</tbody>
      </table>
      <div class="totals">
        <p>Subtotal: ${formatMoney(19500, currency)}</p>
        <p class="grand">Total: ${formatMoney(19500, currency)}</p>
      </div>
      ${footer}
    </section>
    <hr style="border:none;border-top:2px dashed #cbd5e1;margin:28px 0" />
    <section>
      ${headerRemito}
      <p><strong>Destinatario:</strong> Cliente de ejemplo</p>
      <table>
        <thead>
          <tr>
            <th>Artículo</th>
            <th class="num">Cant.</th>
            <th>Unidad</th>
          </tr>
        </thead>
        <tbody>${remitoRows}</tbody>
      </table>
      <p class="muted" style="margin-top:16px">Documento de demostración — no es un remito real.</p>
      ${footer}
    </section>
  `;

  printHtml("Ejemplo PDF — presupuesto y remito", body);
}
