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
  /** Reemplaza «Pedido #n» (p. ej. «Mesa 4 · Ronda 2»). */
  label?: string;
  /** Nombre de estación (Cocina, Barra…). */
  stationName?: string;
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

  const station = opts.stationName?.trim();
  const eyebrow = station ? station.toUpperCase() : "COCINA / BARRA";
  const titleLabel = opts.label
    ? station
      ? `${opts.label} · ${station}`
      : opts.label
    : station
      ? `Pedido #${opts.saleId} · ${station}`
      : undefined;

  const body = `
    <div class="kitchen">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h1>${escapeHtml(opts.businessName)}</h1>
      <p class="meta">${titleLabel ? `<strong class="label">${escapeHtml(titleLabel)}</strong><br />` : `Pedido #${opts.saleId} · `}${escapeHtml(when)}</p>
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
    body { padding: 4px 0 !important; font-size: 13px !important; }
    .print-when, .print-chrome-hint, .print-header, .print-footer { display: none !important; }
    .kitchen {
      max-width: 72mm;
      width: 72mm;
      margin: 0 auto;
      box-sizing: border-box;
      padding: 6px 8px;
    }
    .kitchen h1 {
      font-size: 17px;
      margin: 0 0 4px;
      text-align: center;
    }
    .eyebrow {
      margin: 0 0 4px;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    .meta {
      margin: 0 0 10px;
      text-align: center;
      font-size: 11px;
      color: #334155;
    }
    .meta .label { font-size: 18px; color: #0f172a; }
    .kitchen table {
      width: 100%;
      border-collapse: collapse;
    }
    .kitchen th, .kitchen td {
      padding: 5px 2px;
      border-bottom: 1px dashed #94a3b8;
      vertical-align: top;
    }
    .kitchen th { font-size: 10px; text-transform: uppercase; color: #64748b; }
    .kitchen .qty {
      width: 2.6rem;
      font-weight: 800;
      font-size: 16px;
      text-align: center;
    }
    .kitchen .name {
      font-size: 15px;
      font-weight: 600;
      line-height: 1.25;
    }
    .notes {
      margin-top: 10px;
      padding: 8px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 12px;
    }
  `;

  printHtml(
    titleLabel ? `Cocina · ${titleLabel}` : station ? `Cocina · ${station} #${opts.saleId}` : `Cocina #${opts.saleId}`,
    body,
    css,
    { brandHeader: false },
  );
}

const PRINT_STATION_GAP_MS = 450;

/** Imprime una comanda por estación (misma impresora, varios tickets). */
export async function printKitchenTicketsByStation(opts: {
  businessName: string;
  saleId: number;
  labelBase?: string;
  notes?: string;
  groups: { stationName: string; items: KitchenTicketItem[] }[];
}): Promise<void> {
  const groups = opts.groups.filter((g) => g.items.length > 0);
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (i > 0) await new Promise((r) => setTimeout(r, PRINT_STATION_GAP_MS));
    printKitchenTicket({
      businessName: opts.businessName,
      saleId: opts.saleId,
      items: g.items,
      notes: opts.notes,
      label: opts.labelBase,
      stationName: g.stationName,
    });
  }
}
