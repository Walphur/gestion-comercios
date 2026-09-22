import { escapeHtml, printHtml } from "../printHtml";
import { formatQty } from "../format";

export interface KitchenTicketItem {
  name: string;
  qty: number;
}

/** Comanda simple para cocina/barra: cantidad + nombre, sin precios. */
export function printKitchenTicket(opts: {
  businessName: string;
  saleId: number;
  items: KitchenTicketItem[];
  notes?: string;
}): void {
  const when = new Date().toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const rows = opts.items
    .map(
      (it) => `<tr>
        <td class="qty">${escapeHtml(formatQty(it.qty))}</td>
        <td class="name">${escapeHtml(it.name)}</td>
      </tr>`,
    )
    .join("");

  const notes = opts.notes?.trim()
    ? `<p class="notes"><strong>Nota:</strong> ${escapeHtml(opts.notes.trim())}</p>`
    : "";

  const body = `
    <div class="kitchen">
      <p class="eyebrow">COCINA / BARRA</p>
      <h1>${escapeHtml(opts.businessName)}</h1>
      <p class="meta">Pedido #${opts.saleId} · ${escapeHtml(when)}</p>
      <table>
        <thead>
          <tr><th class="qty">Cant.</th><th>Ítem</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${notes}
    </div>
  `;

  const css = `
    @page { size: 80mm auto; margin: 4mm; }
    body { padding: 8px 10px !important; font-size: 13px !important; }
    .print-when, .print-chrome-hint, .print-header, .print-footer { display: none !important; }
    .kitchen h1 {
      font-size: 16px;
      margin: 0 0 4px;
      text-align: center;
    }
    .eyebrow {
      margin: 0 0 6px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    .meta {
      margin: 0 0 12px;
      text-align: center;
      font-size: 11px;
      color: #334155;
    }
    .kitchen table {
      width: 100%;
      border-collapse: collapse;
    }
    .kitchen th, .kitchen td {
      padding: 6px 2px;
      border-bottom: 1px dashed #94a3b8;
      vertical-align: top;
    }
    .kitchen th { font-size: 10px; text-transform: uppercase; color: #64748b; }
    .kitchen .qty {
      width: 2.6rem;
      font-weight: 800;
      font-size: 15px;
      text-align: center;
    }
    .kitchen .name {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.25;
    }
    .notes {
      margin-top: 12px;
      padding: 8px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 12px;
    }
  `;

  printHtml(`Cocina #${opts.saleId}`, body, css);
}
