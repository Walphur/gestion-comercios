/** Reglas puras para no duplicar clientes ni vehículos al tomar un turno. */

export function documentDigits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizePlate(value: string | null | undefined): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function sameDocument(stored: string | null | undefined, incoming: string): boolean {
  const left = documentDigits(stored);
  const right = documentDigits(incoming);
  return right.length >= 7 && left === right;
}

/** Si la patente ya existe: reutilizarla solo cuando es del mismo cliente o no tiene dueño. */
export function decideVehicleOwner(
  existingCustomerId: number | null | undefined,
  bookingCustomerId: number,
): "reuse" | "conflict" {
  if (existingCustomerId == null || existingCustomerId === bookingCustomerId) return "reuse";
  return "conflict";
}

export function keepPreviousKm(previous: number | null | undefined, next: number | null): string {
  if (next == null || previous == null || previous === next) return "";
  return `Km anterior ${previous}`;
}

export function appendUniqueLine(existing: string | null | undefined, extra: string): string {
  const base = (existing ?? "").trim();
  const next = extra.trim();
  if (!next) return base;
  if (base.split("\n").some((line) => line.trim() === next)) return base;
  return base ? `${base}\n${next}` : next;
}

export interface RepeatCustomer {
  id: number;
  document: string | null;
  phoneDigits: string;
}

export interface RepeatVehicle {
  id: number;
  customerId: number | null;
  plate: string;
}

export interface RepeatPlan {
  customer: "create" | "reuse";
  customerId: number | null;
  vehicle: "skip" | "create" | "reuse" | "conflict";
  vehicleId: number | null;
}

/**
 * Misma persona y misma patente: reutilizar.
 * Sin DNI, el teléfono normalizado identifica al cliente.
 * Patente de otro cliente: no reasignar ni crear otra.
 */
export function planRepeatBooking(input: {
  document: string;
  phoneDigits: string;
  plate: string;
  customers: RepeatCustomer[];
  vehicles: RepeatVehicle[];
}): RepeatPlan {
  const dni = documentDigits(input.document);
  const phone = input.phoneDigits.replace(/\D/g, "");
  const byDni = dni.length >= 7 ? input.customers.find((row) => sameDocument(row.document, dni)) : undefined;
  const byPhone =
    !byDni && phone.length >= 8
      ? input.customers.find((row) => row.phoneDigits.replace(/\D/g, "") === phone)
      : undefined;
  const customer = byDni ?? byPhone;
  const customerId = customer?.id ?? null;
  const plate = normalizePlate(input.plate);
  if (!plate) {
    return { customer: customer ? "reuse" : "create", customerId, vehicle: "skip", vehicleId: null };
  }
  const vehicle = input.vehicles.find((row) => normalizePlate(row.plate) === plate);
  if (!vehicle) {
    return { customer: customer ? "reuse" : "create", customerId, vehicle: "create", vehicleId: null };
  }
  const owner = vehicle.customerId;
  const otherOwner = owner != null && owner !== (customerId ?? -1);
  if (otherOwner) {
    return { customer: customer ? "reuse" : "create", customerId, vehicle: "conflict", vehicleId: null };
  }
  return {
    customer: customer ? "reuse" : "create",
    customerId,
    vehicle: "reuse",
    vehicleId: vehicle.id,
  };
}
