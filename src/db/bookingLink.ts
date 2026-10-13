import type { Customer } from "../types";
import { createAppointment, type AppointmentInput } from "./appointments";
import {
  createCustomer,
  findCustomerByDocument,
  findCustomerByPhone,
  updateCustomer,
} from "./customers";
import { createVehicle, findVehicleByPlate, updateVehicle } from "./vehicles";
import { appendUniqueLine, decideVehicleOwner, documentDigits, keepPreviousKm } from "../lib/bookingMatch";
import { withImmediateTransaction } from "./tx";

export interface BookingProfile {
  document?: string;
  email?: string;
  birth_date?: string;
  gender?: string;
  insurance?: string;
  affiliate?: string;
  reason?: string;
  vehicle?: {
    kind?: string;
    brand?: string;
    model?: string;
    year?: number | null;
    plate?: string;
    km?: number | null;
    notes?: string;
  };
}

function filled(value: string | null | undefined, incoming: string | undefined): string {
  const next = (incoming ?? "").trim();
  if (next) return next;
  return (value ?? "").trim();
}

async function saveCustomer(
  existing: Customer | null,
  name: string,
  phone: string,
  profile: BookingProfile,
): Promise<number> {
  const document = documentDigits(profile.document);
  if (!existing) {
    return createCustomer({
      name,
      phone: phone || undefined,
      document: document || undefined,
      email: profile.email?.trim() || undefined,
      birth_date: profile.birth_date?.trim() || undefined,
      gender: profile.gender?.trim() || undefined,
      insurance: profile.insurance?.trim() || undefined,
      affiliate_number: profile.affiliate?.trim() || undefined,
      credit_limit: 0,
      notes: "Reserva desde la web",
    });
  }
  await updateCustomer(existing.id, {
    name: name || existing.name,
    phone: phone || existing.phone || "",
    document: filled(existing.document, document),
    email: filled(existing.email, profile.email),
    address: existing.address ?? "",
    birth_date: filled(existing.birth_date, profile.birth_date),
    gender: filled(existing.gender, profile.gender),
    insurance: filled(existing.insurance, profile.insurance),
    affiliate_number: filled(existing.affiliate_number, profile.affiliate),
    credit_limit: existing.credit_limit,
    notes: existing.notes ?? "",
  });
  return existing.id;
}

export async function applyWebBooking(input: {
  webId: string;
  name: string;
  phone: string;
  profile: BookingProfile;
  appointment: Omit<AppointmentInput, "customer_id" | "vehicle_id" | "notes" | "subject_notes">;
  price: number;
  statusNote?: string | null;
}): Promise<number> {
  return withImmediateTransaction(async () => {
    const document = documentDigits(input.profile.document);
    const byDocument = document ? await findCustomerByDocument(document) : null;
    const byPhone = !byDocument && input.phone ? await findCustomerByPhone(input.phone) : null;
    const customerId = await saveCustomer(byDocument ?? byPhone, input.name, input.phone, input.profile);

    let vehicleId: number | null = null;
    const vehicle = input.profile.vehicle;
    const plate = vehicle?.plate?.trim() || "";
    let vehicleWarning = "";
    if (plate) {
      const found = await findVehicleByPlate(plate);
      if (found && decideVehicleOwner(found.customer_id, customerId) === "conflict") {
        vehicleWarning = "No se vinculó el vehículo: esa patente ya está en otro cliente.";
      } else if (found) {
        const km = vehicle?.km ?? null;
        const previous = keepPreviousKm(found.odometer_km, km);
        const notes = appendUniqueLine(appendUniqueLine(found.notes, vehicle?.notes ?? ""), previous);
        await updateVehicle(found.id, {
          customer_id: customerId,
          plate: found.plate,
          kind: vehicle?.kind?.trim() || found.kind,
          brand: vehicle?.brand?.trim() || found.brand,
          model: vehicle?.model?.trim() || found.model,
          year: vehicle?.year ?? found.year,
          odometer_km: km ?? found.odometer_km,
          notes: notes || null,
        });
        vehicleId = found.id;
      } else {
        vehicleId = await createVehicle({
          customer_id: customerId,
          plate,
          kind: vehicle?.kind?.trim() || null,
          brand: vehicle?.brand?.trim() || null,
          model: vehicle?.model?.trim() || null,
          year: vehicle?.year ?? null,
          odometer_km: vehicle?.km ?? null,
          notes: vehicle?.notes?.trim() || null,
        });
      }
    }

    const bits = [
      input.price > 0 ? `Precio publicado $${Math.round(input.price)}` : "",
      input.profile.reason?.trim() || "",
      vehicle?.km != null ? `Km ${vehicle.km}` : "",
      vehicleWarning,
    ].filter(Boolean);

    return createAppointment({
      ...input.appointment,
      customer_id: customerId,
      vehicle_id: vehicleId,
      notes: `Reservado desde la web ${input.webId}`,
      subject_notes: bits.join(" · ") || null,
    });
  });
}
