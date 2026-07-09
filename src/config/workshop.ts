import type { Rubro } from "../types";

/** Rubros que usan ficha de vehículo y flujo taller integrado. */
export function rubroUsesVehicles(rubro: Rubro): boolean {
  return rubro === "taller";
}

export function rubroUsesWorkshopFlow(rubro: Rubro): boolean {
  return rubro === "taller";
}

/** Taller y estética: catálogo de mecánicos / profesionales para turnos. */
export function rubroUsesAppointmentResources(rubro: Rubro): boolean {
  return rubro === "taller" || rubro === "estetica";
}
