import type { ServiceOrder, ServiceOrderItem, ServiceOrderStatus } from "../types";
import { syncCashSessionStorage } from "./cash";
import { recordSaleWithinTransaction, type SaleItemInput } from "./sales";
import { deductStockForReference, restoreStockForReference } from "./stock";
import { notifyWorkshopSync } from "../lib/workshopSync";
import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

export interface ServiceOrderItemInput {
  product_id: number | null;
  variant_id: number | null;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  is_labor: boolean;
}

export interface ServiceOrderInput {
  customer_id: number | null;
  vehicle_id?: number | null;
  appointment_id?: number | null;
  quote_id?: number | null;
  odometer_km?: number | null;
  title: string;
  subject_notes?: string | null;
  discount_pct: number;
  notes?: string | null;
  items: ServiceOrderItemInput[];
  user_id?: number | null;
}

const ORDER_SELECT = `o.*,
            c.name AS customer_name,
            u.display_name AS seller_name,
            v.plate AS vehicle_plate,
            v.brand AS vehicle_brand,
            v.model AS vehicle_model`;

const ORDER_FROM = `FROM service_orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN users u ON u.id = o.user_id
     LEFT JOIN vehicles v ON v.id = o.vehicle_id`;

function calcTotals(items: ServiceOrderItemInput[], discountPct: number) {
  const subtotal = items.reduce((a, i) => a + i.line_total, 0);
  return { subtotal, total: subtotal * (1 - discountPct / 100) };
}

async function nextOrderNumber(): Promise<string> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM service_orders");
  const seq = (rows[0]?.n ?? 0) + 1;
  return `OT-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;
}

export function buildServiceItem(
  name: string,
  qty: number,
  unitPrice: number,
  discountPct: number,
  productId: number | null = null,
  isLabor = false,
): ServiceOrderItemInput {
  return {
    product_id: productId,
    variant_id: null,
    name,
    qty,
    unit_price: unitPrice,
    discount_pct: discountPct,
    line_total: qty * unitPrice * (1 - discountPct / 100),
    is_labor: isLabor,
  };
}

export async function listServiceOrders(limit = 200): Promise<ServiceOrder[]> {
  const db = await getDb();
  return db.select<ServiceOrder[]>(
    `SELECT ${ORDER_SELECT}
     ${ORDER_FROM}
     ORDER BY o.id DESC LIMIT $1`,
    [limit],
  );
}

export async function getServiceOrder(id: number): Promise<ServiceOrder | null> {
  const db = await getDb();
  const rows = await db.select<ServiceOrder[]>(
    `SELECT ${ORDER_SELECT}
     ${ORDER_FROM}
     WHERE o.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getServiceOrderItems(orderId: number): Promise<ServiceOrderItem[]> {
  const db = await getDb();
  return db.select<ServiceOrderItem[]>(
    `SELECT * FROM service_order_items WHERE order_id = $1 ORDER BY sort_order, id`,
    [orderId],
  );
}

async function replaceItems(orderId: number, items: ServiceOrderItemInput[]): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM service_order_items WHERE order_id = $1", [orderId]);
  let order = 0;
  for (const it of items) {
    await db.execute(
      `INSERT INTO service_order_items
         (order_id, product_id, variant_id, name, qty, unit_price, discount_pct, line_total, is_labor, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        orderId,
        it.product_id,
        it.variant_id,
        it.name,
        it.qty,
        it.unit_price,
        it.discount_pct,
        it.line_total,
        it.is_labor ? 1 : 0,
        order++,
      ],
    );
  }
}

export async function createServiceOrder(input: ServiceOrderInput): Promise<number> {
  if (!input.title.trim()) throw new Error("Indicá el título del trabajo.");
  if (input.items.length === 0) throw new Error("Agregá repuestos o mano de obra.");
  const { withImmediateTransaction } = await import("./tx");
  const orderId = await withImmediateTransaction(async () => {
    const db = await getDb();
    const number = await nextOrderNumber();
    const { subtotal, total } = calcTotals(input.items, input.discount_pct);
    const res = await db.execute(
      `INSERT INTO service_orders
         (order_number, customer_id, vehicle_id, appointment_id, quote_id, odometer_km,
          title, subject_notes, subtotal, discount_pct, total, notes, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        number,
        input.customer_id,
        input.vehicle_id ?? null,
        input.appointment_id ?? null,
        input.quote_id ?? null,
        input.odometer_km ?? null,
        input.title.trim(),
        input.subject_notes?.trim() || null,
        subtotal,
        input.discount_pct,
        total,
        input.notes?.trim() || null,
        input.user_id ?? null,
      ],
    );
    const id = res.lastInsertId as number;
    await replaceItems(id, input.items);
    return id;
  });
  void notifyWorkshopSync("service_order", orderId);
  return orderId;
}

export async function updateServiceOrder(id: number, input: ServiceOrderInput): Promise<void> {
  const order = await getServiceOrder(id);
  if (!order) throw new Error("Orden no encontrada.");
  if (!["pending", "waiting_parts"].includes(order.status)) {
    throw new Error("No se puede editar una orden en curso o finalizada.");
  }
  const { withImmediateTransaction } = await import("./tx");
  await withImmediateTransaction(async () => {
    const { subtotal, total } = calcTotals(input.items, input.discount_pct);
    const db = await getDb();
    await db.execute(
      `UPDATE service_orders SET
         customer_id=$1, vehicle_id=$2, appointment_id=$3, quote_id=$4, odometer_km=$5,
         title=$6, subject_notes=$7, subtotal=$8, discount_pct=$9,
         total=$10, notes=$11, updated_at=datetime('now','localtime')
       WHERE id=$12`,
      [
        input.customer_id,
        input.vehicle_id ?? null,
        input.appointment_id ?? null,
        input.quote_id ?? null,
        input.odometer_km ?? null,
        input.title.trim(),
        input.subject_notes?.trim() || null,
        subtotal,
        input.discount_pct,
        total,
        input.notes?.trim() || null,
        id,
      ],
    );
    await replaceItems(id, input.items);
  });
  void notifyWorkshopSync("service_order", id);
}

async function applyPartsStock(orderId: number, userId: number | null): Promise<void> {
  const items = await getServiceOrderItems(orderId);
  for (const it of items) {
    if (!it.is_labor && it.product_id != null && it.qty > 0) {
      await deductStockForReference(
        it.product_id,
        it.qty,
        "service_order",
        "service_order",
        orderId,
        userId,
      );
    }
  }
}

async function revertPartsStock(orderId: number, userId: number | null): Promise<void> {
  const items = await getServiceOrderItems(orderId);
  for (const it of items) {
    if (!it.is_labor && it.product_id != null && it.qty > 0) {
      await restoreStockForReference(
        it.product_id,
        it.qty,
        "service_order_void",
        "service_order_void",
        orderId,
        userId,
      );
    }
  }
}

export async function setServiceOrderStatus(
  id: number,
  status: ServiceOrderStatus,
  userId: number | null,
): Promise<void> {
  const order = await getServiceOrder(id);
  if (!order) throw new Error("Orden no encontrada.");
  if (order.status === "delivered" || order.status === "cancelled") {
    throw new Error("La orden ya está cerrada.");
  }

  const needsStockApply = status === "in_progress" && !order.stock_applied;
  const needsStockRevert = status === "cancelled" && order.stock_applied;

  // Cambios simples (p.ej. «Marcar lista para entrega») NO usan BEGIN IMMEDIATE:
  // evita pelear con sync/licencia y con transacciones huérfanas de la conexión JS.
  if (!needsStockApply && !needsStockRevert) {
    const db = await getDb();
    await db.execute(
      `UPDATE service_orders SET status=$1, updated_at=datetime('now','localtime') WHERE id=$2`,
      [status, id],
    );
    void notifyWorkshopSync("service_order", id);
    return;
  }

  const { withImmediateTransaction } = await import("./tx");
  await withImmediateTransaction(async () => {
    const db = await getDb();

    if (needsStockApply) {
      await applyPartsStock(id, userId);
      await db.execute(
        `UPDATE service_orders SET status=$1, stock_applied=1, updated_at=datetime('now','localtime') WHERE id=$2`,
        [status, id],
      );
      return;
    }

    await revertPartsStock(id, userId);
    await db.execute(
      `UPDATE service_orders SET status='cancelled', stock_applied=0, updated_at=datetime('now','localtime') WHERE id=$1`,
      [id],
    );
  });
  void notifyWorkshopSync("service_order", id);
}

export async function deliverServiceOrder(
  id: number,
  paymentMethod: string,
  paid: number | null,
  userId: number | null,
): Promise<number> {
  const order = await getServiceOrder(id);
  if (!order) throw new Error("Orden no encontrada.");
  if (order.status !== "ready") throw new Error("Marcá la orden como «Lista» antes de entregar.");
  if (order.sale_id) throw new Error("Ya se registró la venta de esta orden.");

  const cashSessionId = await syncCashSessionStorage();
  if (cashSessionId == null) throw new Error("Abrí el turno de caja para cobrar la entrega.");

  const items = await getServiceOrderItems(id);
  const saleItems: SaleItemInput[] = items.map((it) => ({
    product_id: it.product_id,
    variant_id: it.variant_id,
    name: it.name,
    qty: it.qty,
    unit_price: it.unit_price,
    discount_pct: it.discount_pct,
    line_total: it.line_total,
    stock_qty: it.is_labor ? 0 : it.qty,
  }));

  const change = paid != null && paid >= order.total ? paid - order.total : null;

  return withImmediateTransaction(async () => {
    const saleId = await recordSaleWithinTransaction({
      subtotal: order.subtotal,
      discount_pct: order.discount_pct,
      total: order.total,
      payment_method: paymentMethod,
      paid,
      change_due: change,
      user_id: userId,
      cash_session_id: cashSessionId,
      customer_id: order.customer_id,
      items: saleItems.map((it) => ({
        ...it,
        stock_qty: order.stock_applied && it.product_id ? 0 : it.stock_qty,
      })),
    });

    const db = await getDb();
    await db.execute(
      `UPDATE service_orders SET status='delivered', sale_id=$1, updated_at=datetime('now','localtime') WHERE id=$2`,
      [saleId, id],
    );
    return saleId;
  });
}

export async function deleteServiceOrder(id: number): Promise<void> {
  const order = await getServiceOrder(id);
  if (!order) return;
  if (order.status !== "pending") throw new Error("Solo se pueden eliminar órdenes pendientes.");
  const db = await getDb();
  await db.execute("DELETE FROM service_orders WHERE id = $1", [id]);
}
