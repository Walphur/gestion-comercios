import type { Vehicle } from "../types";

export function formatVehicleLabel(v: {
  plate: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
}): string {
  const details = [v.brand, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ");
  return details ? `${v.plate} · ${details}` : v.plate;
}

export function vehicleFromAppointmentFields(
  plateOrNotes: string,
  customerId: number | null,
): { plate: string; customer_id: number | null } | null {
  const plate = plateOrNotes.trim().toUpperCase();
  if (!plate) return null;
  return { plate, customer_id: customerId };
}

export function matchVehicleToSubject(
  vehicles: Vehicle[],
  subjectNotes: string | null | undefined,
): number | "" {
  if (!subjectNotes?.trim()) return "";
  const needle = subjectNotes.trim().toUpperCase();
  const hit = vehicles.find(
    (v) =>
      v.plate.toUpperCase() === needle ||
      needle.includes(v.plate.toUpperCase()) ||
      formatVehicleLabel(v).toUpperCase().includes(needle),
  );
  return hit?.id ?? "";
}
