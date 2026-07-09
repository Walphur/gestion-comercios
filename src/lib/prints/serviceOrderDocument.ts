import type { ServiceOrder, ServiceOrderItem } from "../../types";
import { loadPrintBranding } from "../../config/printBranding";
import { formatDateShort, formatMoney, formatQty } from "../format";
import { formatVehicleLabel } from "../vehicleFormat";
import { printHtml, escapeHtml } from "../printHtml";
import { buildPrintFooter, buildPrintHeader } from "./printLayout";

const STATUS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En reparación",
  waiting_parts: "Espera repuestos",
  ready: "Lista",
  delivered: "Entregada",
  cancelled: "Cancelada",
};

export async function printServiceOrderDocument(
  businessName: string,
  currency: string,
  order: ServiceOrder,
  items: ServiceOrderItem[],
): Promise<void> {
  const branding = await loadPrintBranding(businessName);
  const vehicle =
    order.vehicle_plate != null
      ? formatVehicleLabel({
          plate: order.vehicle_plate,
          brand: order.vehicle_brand,
          model: order.vehicle_model,
        })
      : order.subject_notes;

  const rows = items
    .map((it) => {
      const label = it.is_labor ? `${it.name} (mano de obra)` : it.name;
      return `<tr>
        <td>${escapeHtml(label)}</td>
        <td class="num">${formatQty(it.qty)}</td>
        <td class="num">${formatMoney(it.unit_price, currency)}</td>
        <td class="num">${formatMoney(it.line_total, currency)}</td>
      </tr>`;
    })
    .join("");

  const discountLine =
    order.discount_pct > 0 ? `<p>Descuento global: ${order.discount_pct}%</p>` : "";

  const header = buildPrintHeader(branding, [
    `Orden de servicio ${order.order_number} · ${STATUS[order.status] ?? order.status}`,
    `Fecha: ${formatDateShort(order.created_at)}`,
  ]);

  const body = `
    ${header}
    <p><strong>Trabajo:</strong> ${escapeHtml(order.title)}</p>
    <p><strong>Cliente:</strong> ${escapeHtml(order.customer_name ?? "—")}</p>
    ${vehicle ? `<p><strong>Vehículo:</strong> ${escapeHtml(vehicle)}</p>` : ""}
    ${
      order.odometer_km != null
        ? `<p><strong>Kilometraje:</strong> ${order.odometer_km.toLocaleString("es-AR")} km</p>`
        : ""
    }
    ${
      order.subject_notes?.trim() && order.vehicle_id != null
        ? `<p><strong>Detalle / pericia:</strong> ${escapeHtml(order.subject_notes.trim())}</p>`
        : ""
    }
    <table>
      <thead>
        <tr>
          <th>Ítem</th>
          <th class="num">Cant.</th>
          <th class="num">Precio</th>
          <th class="num">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <p>Subtotal: ${formatMoney(order.subtotal, currency)}</p>
      ${discountLine}
      <p class="grand">Total: ${formatMoney(order.total, currency)}</p>
    </div>
    ${
      order.notes
        ? `<div class="notes"><strong>Observaciones</strong><br/>${escapeHtml(order.notes)}</div>`
        : ""
    }
    ${buildPrintFooter(branding)}
  `;

  printHtml(`OT ${order.order_number}`, body);
}
