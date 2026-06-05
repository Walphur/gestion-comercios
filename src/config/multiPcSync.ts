import type { Rubro } from "../types";
import type { ProModulesState } from "./modules";
import { activeProModuleLabels, proModuleEnabled } from "./modules";
import { rubroUsesVehicles } from "./workshop";
import type { WorkshopSyncEntity } from "../lib/workshopSync";

/** Etiquetas genéricas (sirve para kiosco, farmacia, taller, etc.). */
export const MULTI_PC_ROLE_LABELS = {
  off: "Desactivada",
  workshop: "PC secundaria (envía módulos Pro; recibe clientes)",
  counter: "PC principal (envía clientes; recibe módulos Pro)",
} as const;

export function getMultiPcSyncIntro(): string {
  return "Para negocios con más de una PC. Usá una carpeta de Google Drive para escritorio (gratis) compartida entre las máquinas. No se copia el archivo de la base: solo los datos que elijan tus módulos Pro activos, más clientes en ambas direcciones.";
}

export function getMultiPcSyncDataSummary(
  rubro: Rubro,
  proPlan: boolean,
  modules: ProModulesState,
): string {
  const parts = ["Clientes (ambas PCs)"];

  if (proModuleEnabled(proPlan, modules, "quotes")) {
    parts.push("presupuestos");
  }
  if (proModuleEnabled(proPlan, modules, "appointments")) {
    parts.push("turnos");
  }
  if (proModuleEnabled(proPlan, modules, "service_orders")) {
    parts.push("órdenes de servicio");
  }
  if (rubroUsesVehicles(rubro) && proPlan) {
    parts.push("vehículos");
  }

  if (parts.length === 1) {
    return "Con el plan actual solo se sincronizan clientes. Activá módulos Pro para compartir presupuestos, turnos u órdenes.";
  }

  return `Se sincronizan: ${parts.join(", ")}.`;
}

export function entityAllowedForSync(
  entity: WorkshopSyncEntity,
  rubro: Rubro,
  proPlan: boolean,
  modules: ProModulesState,
): boolean {
  switch (entity) {
    case "customer":
      return true;
    case "vehicle":
      return rubroUsesVehicles(rubro) && proPlan;
    case "quote":
      return proModuleEnabled(proPlan, modules, "quotes");
    case "appointment":
      return proModuleEnabled(proPlan, modules, "appointments");
    case "service_order":
      return proModuleEnabled(proPlan, modules, "service_orders");
    default:
      return false;
  }
}

export function getMultiPcSetupSteps(
  _rubro: Rubro,
  proPlan: boolean,
  modules: ProModulesState,
): string[] {
  const proHint =
    activeProModuleLabels(proPlan, modules).length > 0
      ? ` (${activeProModuleLabels(proPlan, modules).join(", ")})`
      : "";

  return [
    "Instalá Google Drive para escritorio en todas las PCs.",
    "Creá la carpeta «GestionComercios-Sync» en Drive (misma cuenta o carpeta compartida).",
    "PC donde cargás presupuestos/turnos/OT → rol «PC secundaria» + esa carpeta.",
    "PC de ventas / caja → rol «PC principal» + la misma carpeta.",
    `Cada negocio sincroniza según sus módulos Pro${proHint}. Se actualiza solo cada ~2 min.`,
  ];
}

/** Mensaje corto para WhatsApp. */
export function getMultiPcWhatsAppBlurb(): string {
  return [
    "Gestión Comercios — 2 PCs:",
    "1) App v0.1.36+ y Google Drive en ambas.",
    "2) Carpeta «GestionComercios-Sync» en Drive.",
    "3) Secundaria = rol «PC secundaria»; principal = «PC principal»; misma carpeta.",
    "4) Clientes van y vienen; presupuestos/turnos/OT solo si tenés Pro activo (taller, estética, etc.).",
    "Login: cajero / 0000",
  ].join("\n");
}
