import type { ActionLogRow } from "../db/audit";

const ACTION_LABELS: Record<string, string> = {
  sale_completed: "Venta finalizada",
  sale_voided: "Venta anulada",
  sale_edited: "Venta editada",
  manual_discount: "Descuento manual",
  appointment_created: "Turno creado",
  appointment_updated: "Turno editado",
  service_order_created: "Orden de servicio creada",
  service_order_delivered: "Orden entregada al cliente",
  quote_created: "Presupuesto creado",
  quote_updated: "Presupuesto editado",
  quote_converted: "Presupuesto convertido en venta",
  delivery_note_created: "Remito creado",
  delivery_note_issued: "Remito emitido",
  cash_session_close_blind: "Cierre de caja",
};

const ENTITY_LABELS: Record<string, string> = {
  appointment: "Turno",
  service_order: "Orden de servicio",
  sale: "Venta",
  quote: "Presupuesto",
  delivery_note: "Remito",
  cash_session: "Turno de caja",
};

const APPOINTMENT_STATUS: Record<string, string> = {
  scheduled: "Programado",
  confirmed: "Confirmado",
  in_progress: "En curso",
  completed: "Finalizado",
  cancelled: "Cancelado",
  no_show: "No asistió",
};

const SERVICE_ORDER_STATUS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En reparación",
  waiting_parts: "Espera repuestos",
  ready: "Lista para entrega",
  delivered: "Entregada",
  cancelled: "Cancelada",
};

const QUOTE_STATUS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviado",
  approved: "Aprobado",
  rejected: "Rechazado",
  converted: "Convertido",
};

function titleCaseWords(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAmount(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatAuditAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];

  const appointment = action.match(/^appointment_(.+)$/);
  if (appointment) {
    const status = APPOINTMENT_STATUS[appointment[1]] ?? titleCaseWords(appointment[1]);
    return `Turno marcado como «${status}»`;
  }

  const order = action.match(/^service_order_(.+)$/);
  if (order) {
    if (order[1] === "delivered") return ACTION_LABELS.service_order_delivered;
    const status = SERVICE_ORDER_STATUS[order[1]] ?? titleCaseWords(order[1]);
    return `Orden de servicio: «${status}»`;
  }

  const quote = action.match(/^quote_(.+)$/);
  if (quote) {
    const status = QUOTE_STATUS[quote[1]] ?? titleCaseWords(quote[1]);
    return `Presupuesto marcado como «${status}»`;
  }

  return titleCaseWords(action);
}

export function formatAuditEntity(entityType: string | null, entityId: number | null): string {
  if (!entityType) return "";
  const label = ENTITY_LABELS[entityType] ?? titleCaseWords(entityType);
  if (entityId != null) return `${label} #${entityId}`;
  return label;
}

export function formatAuditDetails(details: string | null): string {
  if (!details?.trim()) return "";

  const parts = details.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      out.push(part);
      continue;
    }
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();

    switch (key) {
      case "total":
        out.push(`Total ${formatAmount(value)}`);
        break;
      case "sale":
        out.push(`Venta #${value}`);
        break;
      case "declared":
        out.push(`Efectivo contado ${formatAmount(value)}`);
        break;
      case "expected_hidden_until_admin":
        break;
      default:
        out.push(`${titleCaseWords(key)}: ${value}`);
    }
  }

  return out.join(" · ");
}

export function formatAuditReference(row: Pick<ActionLogRow, "entity_type" | "entity_id" | "details">): string {
  const entity = formatAuditEntity(row.entity_type, row.entity_id);
  const extra = formatAuditDetails(row.details);
  if (entity && extra) return `${entity} · ${extra}`;
  return entity || extra || "—";
}
