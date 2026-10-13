import { invoke } from "@tauri-apps/api/core";
import { getAppointment, setAppointmentStatus } from "../db/appointments";
import { applyWebBooking, type BookingProfile } from "../db/bookingLink";
import { getDb } from "../db";
import type { AppointmentStatus } from "../types";

const STATUSES = new Set<AppointmentStatus>([
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);

type WebBooking = {
  id: string;
  local_id?: number | null;
  resource_id?: number | null;
  resource_name?: string;
  service_name?: string;
  service_price?: number;
  customer_name?: string;
  customer_phone?: string;
  starts_at?: string;
  ends_at?: string;
  status?: string;
  status_seq?: number;
  details?: BookingProfile;
};

type StatusOp = {
  id: string;
  local_id: number;
  status: string;
};

function asStatus(value: string | undefined): AppointmentStatus {
  if (value && STATUSES.has(value as AppointmentStatus)) return value as AppointmentStatus;
  return "scheduled";
}

let busy = false;
let started = false;

export function startPhoneBookingBridge() {
  if (started) return;
  started = true;
  const tick = () => {
    void drainBookings();
  };
  tick();
  window.setInterval(tick, 12000);
}

async function drainBookings() {
  if (busy) return;
  busy = true;
  try {
    const bookings = await invoke<WebBooking[]>("catalog_mobile_take_bookings");
    for (const booking of bookings ?? []) {
      try {
        await applyBooking(booking);
      } catch {
        /* Queda en el servidor y se reintenta. */
      }
    }
    const ops = await invoke<StatusOp[]>("catalog_mobile_take_booking_status_ops");
    for (const op of ops ?? []) {
      try {
        await applyStatusOp(op);
      } catch {
        /* Queda pendiente hasta que la agenda local lo pueda tomar. */
      }
    }
  } catch {
    /* Fuera de la app de escritorio, o el celular todavía no está vinculado. */
  } finally {
    busy = false;
  }
}

async function resourceStillThere(id: number | null | undefined) {
  if (!id) return null;
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM workshop_resources WHERE id = $1",
    [id],
  );
  return rows[0] ? id : null;
}

async function applyBooking(booking: WebBooking) {
  const status = asStatus(booking.status);
  const seq = Number(booking.status_seq) || 1;
  let localId = Number(booking.local_id) || 0;
  if (localId) {
    const existing = await getAppointment(localId);
    if (!existing) localId = 0;
    else if (existing.status !== status) await setAppointmentStatus(localId, status);
  }
  if (!localId) {
    const note = `Reservado desde la web ${booking.id}`;
    const db = await getDb();
    const already = await db.select<{ id: number }[]>(
      "SELECT id FROM appointments WHERE notes = $1 LIMIT 1",
      [note],
    );
    localId = already[0]?.id ?? 0;
    if (localId) {
      const existing = await getAppointment(localId);
      if (existing && existing.status !== status) await setAppointmentStatus(localId, status);
    }
  }
  if (!localId) {
    const phone = (booking.customer_phone || "").trim();
    const name = (booking.customer_name || "").trim() || "Cliente web";
    const price = Number(booking.service_price) || 0;
    localId = await applyWebBooking({
      webId: booking.id,
      name,
      phone,
      profile: booking.details ?? {},
      price,
      appointment: {
        title: (booking.service_name || "").trim() || "Turno web",
        resource_id: await resourceStillThere(booking.resource_id),
        resource_name: booking.resource_name?.trim() || null,
        starts_at: booking.starts_at || "",
        ends_at: booking.ends_at || "",
      },
    });
    if (status !== "scheduled") await setAppointmentStatus(localId, status);
  }
  await invoke("catalog_mobile_mark_booking", { id: booking.id, localId });
  await invoke("catalog_mobile_finish_booking", {
    id: booking.id,
    localId,
    statusSeq: seq,
  });
}

async function applyStatusOp(op: StatusOp) {
  const existing = await getAppointment(op.local_id);
  if (existing && existing.status !== asStatus(op.status)) {
    await setAppointmentStatus(op.local_id, asStatus(op.status));
  }
  await invoke("catalog_mobile_finish_booking_status_op", { id: op.id });
}
