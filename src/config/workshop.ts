import type { Rubro } from "../types";

/** Rubros que usan ficha de vehículo y flujo taller integrado. */
export function rubroUsesVehicles(rubro: Rubro): boolean {
  return rubro === "taller";
}

export function rubroUsesWorkshopFlow(rubro: Rubro): boolean {
  return rubro === "taller";
}

/** Rubros con catálogo de personal para turnos (taller, estética, clínica, pet shop). */
export function rubroUsesAppointmentResources(rubro: Rubro): boolean {
  return rubro === "taller" || rubro === "estetica" || rubro === "clinica" || rubro === "petshop";
}
