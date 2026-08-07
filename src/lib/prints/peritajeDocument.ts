import type { VehicleInspection } from "../../types";
import { loadPrintBranding } from "../../config/printBranding";
import { formatDateShort } from "../format";
import { formatVehicleLabel } from "../vehicleFormat";
import { printHtml, escapeHtml } from "../printHtml";
import { buildPrintFooter, buildPrintHeader } from "./printLayout";

function field(label: string, value: string | null | undefined): string {
  const v = value?.trim();
  return `<p><strong>${escapeHtml(label)}:</strong> ${v ? escapeHtml(v) : "—"}</p>`;
}

export async function printPeritajeDocument(
  businessName: string,
  inspection: VehicleInspection,
): Promise<void> {
  const branding = await loadPrintBranding(businessName);
  const vehicle = formatVehicleLabel({
    plate: inspection.vehicle_plate ?? "—",
    brand: inspection.vehicle_brand,
    model: inspection.vehicle_model,
    year: inspection.vehicle_year,
  });

  const header = buildPrintHeader(branding, [
    `Peritaje de ingreso ${inspection.inspection_number}`,
    `Fecha: ${formatDateShort(inspection.created_at)}`,
  ]);

  const body = `
    ${header}
    <h2 style="margin:12px 0 8px;font-size:15px">Estado del vehículo al ingresar</h2>
    <p><strong>Cliente:</strong> ${escapeHtml(inspection.customer_name ?? "—")}</p>
    <p><strong>Vehículo:</strong> ${escapeHtml(vehicle)}</p>
    ${
      inspection.odometer_km != null
        ? `<p><strong>Kilometraje:</strong> ${inspection.odometer_km.toLocaleString("es-AR")} km</p>`
        : field("Kilometraje", null)
    }
    ${field("Nivel de combustible", inspection.fuel_level)}
    ${field("Estado exterior / daños visibles", inspection.exterior_condition)}
    ${field("Estado interior", inspection.interior_condition)}
    ${field("Objetos personales / pertenencias", inspection.belongings)}
    ${field("Problemas reportados por el cliente", inspection.customer_reported)}
    ${field("Observaciones del taller", inspection.notes)}
    ${field("Recibido por", inspection.received_by)}

    <div style="margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div style="border-top:1px solid #94a3b8;padding-top:8px;min-height:64px">
        <p class="muted" style="font-size:12px">Firma del cliente</p>
      </div>
      <div style="border-top:1px solid #94a3b8;padding-top:8px;min-height:64px">
        <p class="muted" style="font-size:12px">Firma del taller</p>
      </div>
    </div>
    <p class="muted" style="margin-top:18px;font-size:11px">
      Documento de ingreso. Conservar copia en el vehículo o entregar al cliente antes de iniciar el trabajo.
    </p>
    ${buildPrintFooter(branding)}
  `;

  printHtml(`Peritaje ${inspection.inspection_number}`, body);
}
