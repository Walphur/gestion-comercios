import { getDb } from "./index";

export interface WorkshopPortalOrderItem {
  name: string;
  qty: number;
  is_labor: boolean;
}

export interface WorkshopPortalOrder {
  order_number: string;
  date: string;
  title: string;
  status: string;
  odometer_km?: number | null;
  items: WorkshopPortalOrderItem[];
}

export interface WorkshopPortalVehicle {
  plate: string;
  plate_norm: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  document_norm?: string | null;
  orders: WorkshopPortalOrder[];
}

function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeDocument(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

interface OrderRow {
  id: number;
  order_number: string;
  title: string;
  status: string;
  odometer_km: number | null;
  created_at: string;
  vehicle_id: number;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  customer_document: string | null;
}

interface ItemRow {
  order_id: number;
  name: string;
  qty: number;
  is_labor: number;
}

/** Arma el snapshot para subir al portal web del cliente del taller. */
export async function buildWorkshopPortalVehicles(): Promise<WorkshopPortalVehicle[]> {
  const db = await getDb();
  const orders = await db.select<OrderRow[]>(
    `SELECT o.id, o.order_number, o.title, o.status, o.odometer_km, o.created_at,
            v.id AS vehicle_id, v.plate, v.brand, v.model, v.year,
            c.document AS customer_document
     FROM service_orders o
     INNER JOIN vehicles v ON v.id = o.vehicle_id
     LEFT JOIN customers c ON c.id = COALESCE(v.customer_id, o.customer_id)
     WHERE o.status != 'cancelled' AND v.plate IS NOT NULL AND TRIM(v.plate) != ''
     ORDER BY o.id DESC
     LIMIT 3000`,
  );
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const placeholders = orderIds.map((_, i) => `$${i + 1}`).join(",");
  const items = await db.select<ItemRow[]>(
    `SELECT order_id, name, qty, is_labor
     FROM service_order_items
     WHERE order_id IN (${placeholders})
     ORDER BY sort_order, id`,
    orderIds,
  );

  const itemsByOrder = new Map<number, WorkshopPortalOrderItem[]>();
  for (const it of items) {
    const list = itemsByOrder.get(it.order_id) ?? [];
    list.push({
      name: it.name,
      qty: it.qty,
      is_labor: it.is_labor === 1,
    });
    itemsByOrder.set(it.order_id, list);
  }

  const byVehicle = new Map<number, WorkshopPortalVehicle>();

  for (const o of orders) {
    let vehicle = byVehicle.get(o.vehicle_id);
    if (!vehicle) {
      const plateNorm = normalizePlate(o.plate);
      if (!plateNorm) continue;
      const docNorm = normalizeDocument(o.customer_document);
      vehicle = {
        plate: o.plate.trim(),
        plate_norm: plateNorm,
        brand: o.brand,
        model: o.model,
        year: o.year,
        document_norm: docNorm || null,
        orders: [],
      };
      byVehicle.set(o.vehicle_id, vehicle);
    } else if (!vehicle.document_norm) {
      const docNorm = normalizeDocument(o.customer_document);
      if (docNorm) vehicle.document_norm = docNorm;
    }

    if (vehicle.orders.length >= 80) continue;

    vehicle.orders.push({
      order_number: o.order_number,
      date: o.created_at,
      title: o.title,
      status: o.status,
      odometer_km: o.odometer_km,
      items: itemsByOrder.get(o.id) ?? [],
    });
  }

  return Array.from(byVehicle.values());
}

export function workshopSlugify(raw: string): string {
  const base = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "taller";
}
