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

export interface WorkshopPortalQuoteItem {
  name: string;
  qty: number;
}

export interface WorkshopPortalQuote {
  quote_number: string;
  date: string;
  status: string;
  valid_until?: string | null;
  total?: number;
  items: WorkshopPortalQuoteItem[];
}

export interface WorkshopPortalInspection {
  inspection_number: string;
  date: string;
  order_number?: string | null;
  odometer_km?: number | null;
  fuel_level?: string | null;
  exterior_condition?: string | null;
  interior_condition?: string | null;
  belongings?: string | null;
  customer_reported?: string | null;
  notes?: string | null;
  received_by?: string | null;
}

export interface WorkshopPortalVehicle {
  plate: string;
  plate_norm: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  document_norm?: string | null;
  orders: WorkshopPortalOrder[];
  quotes: WorkshopPortalQuote[];
  inspections: WorkshopPortalInspection[];
}

function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeDocument(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

interface VehicleRow {
  id: number;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  customer_document: string | null;
}

interface OrderRow {
  id: number;
  order_number: string;
  title: string;
  status: string;
  odometer_km: number | null;
  created_at: string;
  vehicle_id: number;
}

interface QuoteRow {
  id: number;
  quote_number: string;
  status: string;
  total: number;
  valid_until: string | null;
  created_at: string;
  vehicle_id: number;
}

interface InspectionRow {
  id: number;
  inspection_number: string;
  created_at: string;
  vehicle_id: number;
  odometer_km: number | null;
  fuel_level: string | null;
  exterior_condition: string | null;
  interior_condition: string | null;
  belongings: string | null;
  customer_reported: string | null;
  notes: string | null;
  received_by: string | null;
  service_order_id: number | null;
  order_number: string | null;
}

interface ItemRow {
  parent_id: number;
  name: string;
  qty: number;
  is_labor?: number;
}

function ensureVehicle(
  map: Map<number, WorkshopPortalVehicle>,
  row: VehicleRow,
): WorkshopPortalVehicle | null {
  const plateNorm = normalizePlate(row.plate);
  if (!plateNorm) return null;
  let vehicle = map.get(row.id);
  if (!vehicle) {
    vehicle = {
      plate: row.plate.trim(),
      plate_norm: plateNorm,
      brand: row.brand,
      model: row.model,
      year: row.year,
      document_norm: normalizeDocument(row.customer_document) || null,
      orders: [],
      quotes: [],
      inspections: [],
    };
    map.set(row.id, vehicle);
  } else if (!vehicle.document_norm) {
    const docNorm = normalizeDocument(row.customer_document);
    if (docNorm) vehicle.document_norm = docNorm;
  }
  return vehicle;
}

/** Arma el snapshot para subir al portal web del cliente del taller. */
export async function buildWorkshopPortalVehicles(): Promise<WorkshopPortalVehicle[]> {
  const db = await getDb();
  const vehicles = await db.select<VehicleRow[]>(
    `SELECT DISTINCT v.id, v.plate, v.brand, v.model, v.year, c.document AS customer_document
     FROM vehicles v
     LEFT JOIN customers c ON c.id = v.customer_id
     WHERE v.id IN (
       SELECT vehicle_id FROM service_orders
         WHERE vehicle_id IS NOT NULL AND status != 'cancelled'
       UNION
       SELECT vehicle_id FROM quotes
         WHERE vehicle_id IS NOT NULL AND status NOT IN ('draft', 'rejected')
       UNION
       SELECT vehicle_id FROM vehicle_inspections
         WHERE vehicle_id IS NOT NULL
     )
       AND v.plate IS NOT NULL AND TRIM(v.plate) != ''`,
  );
  if (vehicles.length === 0) return [];

  const vehicleIds = vehicles.map((v) => v.id);
  const placeholders = vehicleIds.map((_, i) => `$${i + 1}`).join(",");

  const [orders, quotes, inspections, orderItems, quoteItems] = await Promise.all([
    db.select<OrderRow[]>(
      `SELECT o.id, o.order_number, o.title, o.status, o.odometer_km, o.created_at, o.vehicle_id
       FROM service_orders o
       WHERE o.vehicle_id IN (${placeholders}) AND o.status != 'cancelled'
       ORDER BY o.id DESC
       LIMIT 3000`,
      vehicleIds,
    ),
    db.select<QuoteRow[]>(
      `SELECT q.id, q.quote_number, q.status, q.total, q.valid_until, q.created_at, q.vehicle_id
       FROM quotes q
       WHERE q.vehicle_id IN (${placeholders}) AND q.status NOT IN ('draft', 'rejected')
       ORDER BY q.id DESC
       LIMIT 1500`,
      vehicleIds,
    ),
    db.select<InspectionRow[]>(
      `SELECT i.id, i.inspection_number, i.created_at, i.vehicle_id, i.odometer_km,
              i.fuel_level, i.exterior_condition, i.interior_condition, i.belongings,
              i.customer_reported, i.notes, i.received_by, i.service_order_id,
              o.order_number
       FROM vehicle_inspections i
       LEFT JOIN service_orders o ON o.id = i.service_order_id
       WHERE i.vehicle_id IN (${placeholders})
       ORDER BY i.id DESC
       LIMIT 1500`,
      vehicleIds,
    ),
    db.select<ItemRow[]>(
      `SELECT order_id AS parent_id, name, qty, is_labor
       FROM service_order_items
       WHERE order_id IN (
         SELECT id FROM service_orders
         WHERE vehicle_id IN (${placeholders}) AND status != 'cancelled'
       )
       ORDER BY sort_order, id`,
      vehicleIds,
    ),
    db.select<ItemRow[]>(
      `SELECT quote_id AS parent_id, name, qty
       FROM quote_items
       WHERE quote_id IN (
         SELECT id FROM quotes
         WHERE vehicle_id IN (${placeholders}) AND status NOT IN ('draft', 'rejected')
       )
       ORDER BY sort_order, id`,
      vehicleIds,
    ),
  ]);

  const orderItemsById = new Map<number, WorkshopPortalOrderItem[]>();
  for (const it of orderItems) {
    const list = orderItemsById.get(it.parent_id) ?? [];
    list.push({
      name: it.name,
      qty: it.qty,
      is_labor: it.is_labor === 1,
    });
    orderItemsById.set(it.parent_id, list);
  }

  const quoteItemsById = new Map<number, WorkshopPortalQuoteItem[]>();
  for (const it of quoteItems) {
    const list = quoteItemsById.get(it.parent_id) ?? [];
    list.push({ name: it.name, qty: it.qty });
    quoteItemsById.set(it.parent_id, list);
  }

  const byVehicle = new Map<number, WorkshopPortalVehicle>();
  for (const v of vehicles) ensureVehicle(byVehicle, v);

  for (const o of orders) {
    const vehicle = byVehicle.get(o.vehicle_id);
    if (!vehicle || vehicle.orders.length >= 80) continue;
    vehicle.orders.push({
      order_number: o.order_number,
      date: o.created_at,
      title: o.title,
      status: o.status,
      odometer_km: o.odometer_km,
      items: orderItemsById.get(o.id) ?? [],
    });
  }

  for (const q of quotes) {
    const vehicle = byVehicle.get(q.vehicle_id);
    if (!vehicle || vehicle.quotes.length >= 40) continue;
    vehicle.quotes.push({
      quote_number: q.quote_number,
      date: q.created_at,
      status: q.status,
      valid_until: q.valid_until,
      total: q.total,
      items: quoteItemsById.get(q.id) ?? [],
    });
  }

  for (const ins of inspections) {
    const vehicle = byVehicle.get(ins.vehicle_id);
    if (!vehicle || vehicle.inspections.length >= 30) continue;
    vehicle.inspections.push({
      inspection_number: ins.inspection_number,
      date: ins.created_at,
      order_number: ins.order_number,
      odometer_km: ins.odometer_km,
      fuel_level: ins.fuel_level,
      exterior_condition: ins.exterior_condition,
      interior_condition: ins.interior_condition,
      belongings: ins.belongings,
      customer_reported: ins.customer_reported,
      notes: ins.notes,
      received_by: ins.received_by,
    });
  }

  return Array.from(byVehicle.values()).filter(
    (v) => v.orders.length > 0 || v.quotes.length > 0 || v.inspections.length > 0,
  );
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
