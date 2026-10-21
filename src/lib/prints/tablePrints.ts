import QRCode from "qrcode";
import { escapeHtml, printHtml } from "../printHtml";
import { formatMoney, formatQty } from "../format";

/** Pre-cuenta para llevar a la mesa: lo consumido con precios, sin cobrar. */
export function printPreBill(opts: {
  businessName: string;
  tableLabel: string;
  guests: number | null;
  waiter: string | null;
  currency: string;
  items: { name: string; qty: number; total: number }[];
  total: number;
}): void {
  const rows = opts.items
    .map(
      (it) => `<tr>
        <td class="qty">${escapeHtml(formatQty(it.qty))}</td>
        <td class="name">${escapeHtml(it.name)}</td>
        <td class="amt">${escapeHtml(formatMoney(it.total, opts.currency))}</td>
      </tr>`,
    )
    .join("");
  const meta = [
    opts.guests ? `${opts.guests} ${opts.guests === 1 ? "comensal" : "comensales"}` : "",
    opts.waiter ? `Mozo: ${opts.waiter}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const body = `
    <div class="bill">
      <h1>${escapeHtml(opts.businessName)}</h1>
      <p class="eyebrow">PRE-CUENTA · ${escapeHtml(opts.tableLabel)}</p>
      ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
      <table><tbody>${rows}</tbody></table>
      <p class="total"><span>Total</span><strong>${escapeHtml(formatMoney(opts.total, opts.currency))}</strong></p>
      <p class="foot">No válido como factura. La propina no está incluida.</p>
    </div>
  `;
  const css = `
    @page { size: 80mm auto; margin: 4mm; }
    body { padding: 8px 10px !important; font-size: 13px !important; }
    .print-when, .print-chrome-hint { display: none !important; }
    .bill h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
    .bill .eyebrow { text-align: center; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; margin: 0 0 4px; }
    .bill .meta { text-align: center; font-size: 11px; color: #334155; margin: 0 0 8px; }
    .bill table { width: 100%; border: none; border-radius: 0; margin: 8px 0; }
    .bill td { padding: 5px 2px; border-bottom: 1px dashed #94a3b8; background: none !important; vertical-align: top; }
    .bill .qty { width: 2.2rem; font-weight: 700; text-align: center; }
    .bill .amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .bill .total { display: flex; justify-content: space-between; font-size: 17px; margin: 10px 0 6px; }
    .bill .foot { text-align: center; font-size: 10px; color: #64748b; margin-top: 10px; }
  `;
  printHtml(`Pre-cuenta · ${opts.tableLabel}`, body, css);
}

/** Hoja A4 con un QR por mesa para recortar y dejar en cada mesa. */
export async function printTableQrSheet(opts: {
  businessName: string;
  tables: { label: string; url: string }[];
}): Promise<void> {
  const cards = await Promise.all(
    opts.tables.map(async (t) => {
      const src = await QRCode.toDataURL(t.url, { width: 360, margin: 1, errorCorrectionLevel: "M" });
      return `<div class="qr-card">
        <p class="biz">${escapeHtml(opts.businessName)}</p>
        <p class="table">${escapeHtml(t.label)}</p>
        <img src="${src}" alt="" />
        <p class="hint">Escaneá para ver la carta, pedir, llamar al mozo o pedir la cuenta</p>
      </div>`;
    }),
  );
  const css = `
    @page { size: A4; margin: 10mm; }
    .print-when, .print-chrome-hint { display: none !important; }
    body { padding: 0 !important; }
    .qr-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8mm; }
    .qr-card { border: 1px dashed #94a3b8; border-radius: 10px; padding: 5mm 4mm; text-align: center; break-inside: avoid; }
    .qr-card .biz { margin: 0; font-size: 11px; color: #475569; font-weight: 600; }
    .qr-card .table { margin: 1mm 0 2mm; font-size: 22px; font-weight: 800; color: #0f172a; }
    .qr-card img { width: 100%; max-width: 46mm; height: auto; }
    .qr-card .hint { margin: 2mm 0 0; font-size: 10px; color: #334155; line-height: 1.3; }
  `;
  printHtml(`QR de mesas · ${opts.businessName}`, `<div class="qr-grid">${cards.join("")}</div>`, css);
}
