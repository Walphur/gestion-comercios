import type { Appointment, Rubro } from "../types";
import { formatDateShort, formatTime } from "./format";
import { formatVehicleLabel } from "./vehicleFormat";

export type AppointmentNotifyKind = "reminder" | "confirmed" | "ready" | "cancelled";

export interface AppointmentNotifyInput {
  businessName: string;
  rubro: Rubro;
  appointment: Appointment;
  linkedOrderReady?: boolean;
}

const KIND_LABEL: Record<AppointmentNotifyKind, string> = {
  reminder: "Recordatorio de turno",
  confirmed: "Turno confirmado",
  ready: "Listo para retirar",
  cancelled: "Turno cancelado",
};

export function getNotifyKindLabel(kind: AppointmentNotifyKind): string {
  return KIND_LABEL[kind];
}

export function suggestNotifyKind(
  appointment: Appointment,
  linkedOrders: { status: string }[] = [],
): AppointmentNotifyKind {
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    return "cancelled";
  }
  if (
    appointment.status === "completed" ||
    linkedOrders.some((o) => o.status === "ready")
  ) {
    return "ready";
  }
  if (appointment.status === "confirmed") return "confirmed";
  return "reminder";
}

function vehicleLine(appointment: Appointment, rubro: Rubro): string | null {
  if (appointment.vehicle_plate) {
    return formatVehicleLabel({
      plate: appointment.vehicle_plate,
      brand: appointment.vehicle_brand,
      model: appointment.vehicle_model,
    });
  }
  if (appointment.subject_notes?.trim()) return appointment.subject_notes.trim();
  if (rubro === "taller") return null;
  return null;
}

function subjectWord(rubro: Rubro): string {
  if (rubro === "taller") return "vehículo";
  if (rubro === "petshop") return "mascota";
  if (rubro === "clinica") return "consulta";
  return "turno";
}

export function buildAppointmentMessage(
  kind: AppointmentNotifyKind,
  input: AppointmentNotifyInput,
): { subject: string; body: string } {
  const { businessName, rubro, appointment } = input;
  const name = appointment.customer_name?.trim() || "cliente";
  const date = formatDateShort(appointment.starts_at);
  const time = formatTime(appointment.starts_at);
  const endTime = formatTime(appointment.ends_at);
  const vehicle = vehicleLine(appointment, rubro);
  const resource = appointment.resource_name?.trim();
  const subj = subjectWord(rubro);

  const lines: string[] = [];

  switch (kind) {
    case "reminder":
      lines.push(`Hola ${name}! 👋`);
      lines.push(`Te recordamos tu turno en *${businessName}*:`);
      lines.push("");
      lines.push(`📅 *${date}* de ${time} a ${endTime}`);
      lines.push(`📋 ${appointment.title}`);
      if (vehicle) lines.push(`🚗 ${vehicle}`);
      if (resource) lines.push(`👤 Con: ${resource}`);
      lines.push("");
      lines.push("Si necesitás reprogramar, respondé este mensaje.");
      return {
        subject: `Recordatorio de turno — ${businessName}`,
        body: lines.join("\n"),
      };

    case "confirmed":
      lines.push(`Hola ${name}!`);
      lines.push(`Tu turno en *${businessName}* quedó *confirmado*:`);
      lines.push("");
      lines.push(`📅 ${date} · ${time} hs`);
      lines.push(`📋 ${appointment.title}`);
      if (vehicle) lines.push(`🚗 ${vehicle}`);
      if (resource) lines.push(`Atendido por: ${resource}`);
      lines.push("");
      lines.push("Te esperamos. ¡Gracias!");
      return {
        subject: `Turno confirmado — ${businessName}`,
        body: lines.join("\n"),
      };

    case "ready":
      lines.push(`Hola ${name}! ✅`);
      if (rubro === "taller" && vehicle) {
        lines.push(`Tu *${subj}* (${vehicle}) ya está *listo para retirar* en *${businessName}*.`);
      } else {
        lines.push(`Tu ${subj} ya está *listo* en *${businessName}*.`);
      }
      lines.push("");
      lines.push(`📋 Trabajo: ${appointment.title}`);
      if (vehicle && rubro !== "taller") lines.push(`Detalle: ${vehicle}`);
      lines.push("");
      lines.push("Podés pasar en nuestro horario de atención.");
      lines.push("Cualquier consulta, escribinos por acá.");
      return {
        subject: `Listo para retirar — ${businessName}`,
        body: lines.join("\n"),
      };

    case "cancelled":
      lines.push(`Hola ${name}.`);
      lines.push(`Te informamos que el turno del *${date}* (${time} hs) en *${businessName}* fue *cancelado*.`);
      if (appointment.title) lines.push(`Servicio: ${appointment.title}`);
      lines.push("");
      lines.push("Para reagendar, contactanos cuando quieras.");
      return {
        subject: `Turno cancelado — ${businessName}`,
        body: lines.join("\n"),
      };
  }
}

export const NOTIFY_KINDS: AppointmentNotifyKind[] = [
  "reminder",
  "confirmed",
  "ready",
  "cancelled",
];
