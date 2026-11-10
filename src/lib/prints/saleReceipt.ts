import { escapeHtml, printHtml } from "../printHtml";
import { formatMoney, formatQty } from "../format";

export interface SaleReceiptData {
  businessName: string;
  saleId: number;
  createdAt: string;
  paymentMethod: string;
  total: number;
  paid: number | null;
  changeDue: number | null;
  /** Detalle libre de la venta (quién retiró, para qué…). */
  note?: string | null;
  items: { name: string; qty: number; unitPrice: number; lineTotal: number }[];
  /** Equipos vendidos con IMEI o serie. */
  warranties: { name: string; code: string; kind: string; until: string | null }[];
}

function dmy(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : ymd;
}

function when(createdAt: string): string {
  return createdAt.length >= 16 ? `${dmy(createdAt)} ${createdAt.slice(11, 16)}` : createdAt;
}

const row = (left: string, right: string, cls = "") =>
  `<div class="row ${cls}"><span>${left}</span><span class="num">${right}</span></div>`;

export function printTestReceipt(widthChars: number): void {
  printSaleReceipt(
    {
      businessName: "WalQo",
      saleId: 0,
      createdAt: "",
      paymentMethod: "—",
      total: 0,
      paid: null,
      changeDue: null,
      items: [{ name: "Prueba de impresora OK", qty: 1, unitPrice: 0, lineTotal: 0 }],
      warranties: [],
    },
    widthChars,
    "Prueba de impresora",
  );
}

/**
 * Mismo ticket que arma receipt.rs para la impresora térmica, en HTML para imprimir desde el
 * navegador. Con 34 caracteres o menos se usa el rollo de 58 mm; si no, el de 80 mm.
 */
export function printSaleReceipt(data: SaleReceiptData, widthChars: number, title = "Ticket de venta"): void {
  const paperMm = widthChars <= 34 ? 58 : 80;
  const items = data.items
    .map(
      (it) => `<p class="item">${escapeHtml(it.name)}</p>
        ${row(`${escapeHtml(formatQty(it.qty))} × ${escapeHtml(formatMoney(it.unitPrice))}`, escapeHtml(formatMoney(it.lineTotal)))}`,
    )
    .join("");

  const payment = [
    row("Pago", escapeHtml(data.paymentMethod)),
    data.paid != null ? row("Recibido", escapeHtml(formatMoney(data.paid))) : "",
    data.changeDue != null && data.changeDue > 0.001 ? row("Vuelto", escapeHtml(formatMoney(data.changeDue))) : "",
    data.note ? `<p class="note">Detalle: ${escapeHtml(data.note)}</p>` : "",
  ].join("");

  const warranties = data.warranties.length
    ? `<hr /><p class="section">GARANTÍA</p>${data.warranties
        .map(
          (w) => `${w.name ? `<p class="item">${escapeHtml(w.name)}</p>` : ""}
            <p>${w.kind === "imei" ? "IMEI" : "Serie"}: ${escapeHtml(w.code)}</p>
            <p>${w.until ? `Garantía hasta ${escapeHtml(dmy(w.until))}` : "Sin garantía"}</p>`,
        )
        .join("")}`
    : "";

  const body = `
    <div class="receipt">
      <h1>${escapeHtml(data.businessName)}</h1>
      <p class="center">${escapeHtml(title.toUpperCase())}</p>
      <p>Venta #${data.saleId}</p>
      <p>${escapeHtml(when(data.createdAt))}</p>
      <hr />
      ${items}
      <hr />
      ${row("TOTAL", escapeHtml(formatMoney(data.total)), "total")}
      ${payment}
      ${warranties}
      <p class="center thanks">Gracias por su compra</p>
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
    .receipt .item { font-weight: 600; overflow-wrap: anywhere; }
    .receipt .row { display: flex; justify-content: space-between; gap: 8px; }
    .receipt .row .num { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .receipt .total { font-size: 1.25em; font-weight: 800; margin: 2px 0 4px; }
    .receipt .section { font-weight: 700; }
    .receipt .note { margin-top: 4px; overflow-wrap: anywhere; }
    .receipt .thanks { margin-top: 10px; }
  `;

  printHtml(`${title} #${data.saleId}`, body, css, { brandHeader: false });
}
