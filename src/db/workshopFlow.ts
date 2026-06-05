import { getAppointment } from "./appointments";
import {
  buildQuoteItem,
  createQuote,
  getQuote,
  getQuoteItems,
  type QuoteInput,
} from "./quotes";
import {
  buildServiceItem,
  createServiceOrder,
  getServiceOrder,
  type ServiceOrderInput,
} from "./serviceOrders";
import { getDb } from "./index";

export async function listQuotesForAppointment(appointmentId: number) {
  const db = await getDb();
  return db.select<{ id: number; quote_number: string; status: string }[]>(
    `SELECT id, quote_number, status FROM quotes WHERE appointment_id = $1 ORDER BY id DESC`,
    [appointmentId],
  );
}

export async function listOrdersForAppointment(appointmentId: number) {
  const db = await getDb();
  return db.select<{ id: number; order_number: string; status: string }[]>(
    `SELECT id, order_number, status FROM service_orders WHERE appointment_id = $1 ORDER BY id DESC`,
    [appointmentId],
  );
}

export async function getServiceOrderByQuoteId(quoteId: number) {
  const db = await getDb();
  const rows = await db.select<{ id: number; order_number: string; status: string }[]>(
    `SELECT id, order_number, status FROM service_orders WHERE quote_id = $1 ORDER BY id DESC LIMIT 1`,
    [quoteId],
  );
  return rows[0] ?? null;
}

export async function createQuoteFromAppointment(
  appointmentId: number,
  userId: number | null,
): Promise<number> {
  const a = await getAppointment(appointmentId);
  if (!a) throw new Error("Turno no encontrado.");

  const input: QuoteInput = {
    customer_id: a.customer_id,
    vehicle_id: a.vehicle_id,
    appointment_id: appointmentId,
    discount_pct: 0,
    notes: a.notes,
    items: [buildQuoteItem(a.title, 1, 0, 0, null, null)],
    user_id: userId,
  };
  return createQuote(input);
}

export async function createServiceOrderFromQuote(
  quoteId: number,
  userId: number | null,
): Promise<number> {
  const q = await getQuote(quoteId);
  if (!q) throw new Error("Presupuesto no encontrado.");
  if (q.status === "rejected" || q.status === "converted") {
    throw new Error("No se puede crear OT desde este presupuesto.");
  }

  const existing = await getServiceOrderByQuoteId(quoteId);
  if (existing) {
    throw new Error(`Ya existe la orden ${existing.order_number} para este presupuesto.`);
  }

  const lines = await getQuoteItems(quoteId);
  if (lines.length === 0) throw new Error("El presupuesto no tiene ítems.");

  const items = lines.map((it) =>
    buildServiceItem(
      it.name,
      it.qty,
      it.unit_price,
      it.discount_pct,
      it.product_id,
      it.product_id == null,
    ),
  );

  const title =
    lines.find((it) => it.product_id == null)?.name ??
    lines[0]?.name ??
    `Trabajo ${q.quote_number}`;

  const input: ServiceOrderInput = {
    customer_id: q.customer_id,
    vehicle_id: q.vehicle_id,
    appointment_id: q.appointment_id,
    quote_id: quoteId,
    title,
    subject_notes: null,
    discount_pct: q.discount_pct,
    notes: q.notes,
    items,
    user_id: userId,
  };
  return createServiceOrder(input);
}

export async function createServiceOrderFromAppointment(
  appointmentId: number,
  userId: number | null,
): Promise<number> {
  const a = await getAppointment(appointmentId);
  if (!a) throw new Error("Turno no encontrado.");

  const existing = await listOrdersForAppointment(appointmentId);
  if (existing.length > 0) {
    throw new Error(`Ya existe la orden ${existing[0].order_number} para este turno.`);
  }

  const input: ServiceOrderInput = {
    customer_id: a.customer_id,
    vehicle_id: a.vehicle_id,
    appointment_id: appointmentId,
    quote_id: null,
    title: a.title,
    subject_notes: a.subject_notes,
    discount_pct: 0,
    notes: a.notes,
    items: [buildServiceItem(a.title, 1, 0, 0, null, true)],
    user_id: userId,
  };
  return createServiceOrder(input);
}

export async function getQuotePrefillFromAppointment(appointmentId: number) {
  const a = await getAppointment(appointmentId);
  if (!a) return null;
  return {
    customer_id: a.customer_id,
    vehicle_id: a.vehicle_id,
    appointment_id: appointmentId,
    notes: a.notes,
    items: [buildQuoteItem(a.title, 1, 0, 0, null, null)],
  };
}

export async function getOrderPrefillFromQuote(quoteId: number) {
  const q = await getQuote(quoteId);
  if (!q) return null;
  const lines = await getQuoteItems(quoteId);
  const title =
    lines.find((it) => it.product_id == null)?.name ??
    lines[0]?.name ??
    `Trabajo ${q.quote_number}`;
  return {
    customer_id: q.customer_id,
    vehicle_id: q.vehicle_id,
    appointment_id: q.appointment_id,
    quote_id: quoteId,
    title,
    notes: q.notes,
    discount_pct: q.discount_pct,
    items: lines.map((it) =>
      buildServiceItem(
        it.name,
        it.qty,
        it.unit_price,
        it.discount_pct,
        it.product_id,
        it.product_id == null,
      ),
    ),
  };
}

export async function getOrderPrefillFromAppointment(appointmentId: number) {
  const a = await getAppointment(appointmentId);
  if (!a) return null;
  return {
    customer_id: a.customer_id,
    vehicle_id: a.vehicle_id,
    appointment_id: appointmentId,
    quote_id: null,
    title: a.title,
    subject_notes: a.subject_notes,
    notes: a.notes,
    items: [buildServiceItem(a.title, 1, 0, 0, null, true)],
  };
}

export async function getLinkedDocumentsForOrder(orderId: number) {
  const order = await getServiceOrder(orderId);
  if (!order) return { quote: null, appointment: null };
  const db = await getDb();
  const quote = order.quote_id
    ? (
        await db.select<{ id: number; quote_number: string }[]>(
          `SELECT id, quote_number FROM quotes WHERE id = $1`,
          [order.quote_id],
        )
      )[0] ?? null
    : null;
  const appointment = order.appointment_id
    ? (
        await db.select<{ id: number; title: string; starts_at: string }[]>(
          `SELECT id, title, starts_at FROM appointments WHERE id = $1`,
          [order.appointment_id],
        )
      )[0] ?? null
    : null;
  return { quote, appointment };
}
