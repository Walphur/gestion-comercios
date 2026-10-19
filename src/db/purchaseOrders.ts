import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

export interface ReorderSuggestion {
  product_id: number;
  name: string;
  unit: string | null;
  stock: number;
  min_stock: number;
  cost: number;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_phone: string | null;
  sold_30d: number;
  /** Pedido pendiente que ya incluye este producto. */
  pending_order_id: number | null;
  /** Hasta el doble del mínimo; sin mínimo, lo vendido en 30 días. */
  suggested_qty: number;
}

export interface PurchaseOrderItemInput {
  productId: number | null;
  name: string;
  qty: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_phone: string | null;
  status: "pending" | "received" | "cancelled";
  note: string | null;
  created_at: string;
  closed_at: string | null;
  item_count: number;
  total_cost: number;
}

export interface PurchaseOrderItem {
  id: number;
  order_id: number;
  product_id: number | null;
  name: string;
  qty: number;
  unit_cost: number;
  barcode: string | null;
  price: number | null;
}

const SERVICE_UNITS_SQL = `lower(COALESCE(p.unit, '')) IN ('servicio', 'práctica', 'practica', 'sesión', 'sesion')`;

/** Con unidades enteras redondea para arriba; con kg / litro deja un decimal. */
export function suggestQty(stock: number, minStock: number, sold30d: number, unit: string | null): number {
  const missing = minStock > 0 ? minStock * 2 - stock : sold30d - stock;
  const u = (unit ?? "").toLowerCase();
  const fractional = u === "kg" || u === "litro" || u === "metro" || u === "g";
  if (fractional) return Math.max(Math.ceil(missing * 10) / 10, 0.1);
  return Math.max(Math.ceil(missing), 1);
}

/**
 * Productos para reponer: bajo el mínimo configurado, o agotados que se vendieron
 * en los últimos 30 días. Sin servicios ni productos que no llevan stock.
 */
export async function listReorderSuggestions(): Promise<ReorderSuggestion[]> {
  const db = await getDb();
  const rows = await db.select<Omit<ReorderSuggestion, "suggested_qty">[]>(
    `SELECT p.id AS product_id, p.name, p.unit, p.stock, p.min_stock, p.cost,
            p.supplier_id, s.name AS supplier_name, s.phone AS supplier_phone,
            COALESCE(sold.qty, 0) AS sold_30d,
            (SELECT MAX(o.id) FROM purchase_order_items i
               JOIN purchase_orders o ON o.id = i.order_id
             WHERE i.product_id = p.id AND o.status = 'pending') AS pending_order_id
     FROM products p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN (
       SELECT si.product_id, SUM(si.qty) AS qty
       FROM sale_items si
       JOIN sales sa ON sa.id = si.sale_id
       WHERE sa.voided = 0 AND sa.created_at >= datetime('now','localtime','-30 days')
       GROUP BY si.product_id
     ) sold ON sold.product_id = p.id
     WHERE p.active = 1
       AND COALESCE(p.track_stock, 1) = 1
       AND NOT (${SERVICE_UNITS_SQL})
       AND (
         (p.min_stock > 0 AND p.stock <= p.min_stock)
         OR (p.stock <= 0 AND COALESCE(sold.qty, 0) > 0)
       )
     ORDER BY s.name IS NULL, s.name COLLATE NOCASE, p.name COLLATE NOCASE
     LIMIT 500`,
  );
  return rows.map((r) => ({
    ...r,
    suggested_qty: suggestQty(r.stock, r.min_stock, r.sold_30d, r.unit),
  }));
}

export async function createPurchaseOrder(input: {
  supplierId: number | null;
  items: PurchaseOrderItemInput[];
  note?: string;
  userId: number | null;
}): Promise<number> {
  const items = input.items.filter((i) => i.qty > 0 && i.name.trim());
  if (items.length === 0) throw new Error("Elegí al menos un producto con cantidad.");
  return withImmediateTransaction(async () => {
    const db = await getDb();
    const res = await db.execute(
      "INSERT INTO purchase_orders (supplier_id, note, user_id) VALUES ($1, $2, $3)",
      [input.supplierId, input.note?.trim() || null, input.userId],
    );
    const orderId = res.lastInsertId as number;
    for (const it of items) {
      await db.execute(
        `INSERT INTO purchase_order_items (order_id, product_id, name, qty, unit_cost)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, it.productId, it.name.trim(), it.qty, Math.max(it.unitCost, 0)],
      );
    }
    return orderId;
  });
}

export async function listPurchaseOrders(
  status: PurchaseOrder["status"] | "all" = "all",
): Promise<PurchaseOrder[]> {
  const db = await getDb();
  const where = status === "all" ? "" : "WHERE o.status = $1";
  return db.select<PurchaseOrder[]>(
    `SELECT o.id, o.supplier_id, s.name AS supplier_name, s.phone AS supplier_phone,
            o.status, o.note, o.created_at, o.closed_at,
            COUNT(i.id) AS item_count,
            COALESCE(SUM(i.qty * i.unit_cost), 0) AS total_cost
     FROM purchase_orders o
     LEFT JOIN suppliers s ON s.id = o.supplier_id
     LEFT JOIN purchase_order_items i ON i.order_id = o.id
     ${where}
     GROUP BY o.id
     ORDER BY CASE o.status WHEN 'pending' THEN 0 ELSE 1 END, o.created_at DESC
     LIMIT 100`,
    status === "all" ? [] : [status],
  );
}

export async function listPurchaseOrderItems(orderId: number): Promise<PurchaseOrderItem[]> {
  const db = await getDb();
  return db.select<PurchaseOrderItem[]>(
    `SELECT i.*, p.barcode, p.price
     FROM purchase_order_items i
     LEFT JOIN products p ON p.id = i.product_id
     WHERE i.order_id = $1
     ORDER BY i.id`,
    [orderId],
  );
}

export async function closePurchaseOrder(
  orderId: number,
  status: "received" | "cancelled",
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE purchase_orders SET status = $1, closed_at = datetime('now','localtime')
     WHERE id = $2 AND status = 'pending'`,
    [status, orderId],
  );
}

/** Mensaje de pedido para mandar por WhatsApp al proveedor. */
export function buildPurchaseOrderMessage(input: {
  businessName: string;
  supplierName: string | null;
  items: { name: string; qty: number; unit?: string | null }[];
  note?: string;
}): string {
  const hello = input.supplierName ? `Hola ${input.supplierName}!` : "Hola!";
  const from = input.businessName.trim() ? ` Te escribo de ${input.businessName.trim()}.` : "";
  const lines = input.items.map((i) => {
    const qty = Number.isInteger(i.qty) ? String(i.qty) : i.qty.toLocaleString("es-AR");
    const unit = i.unit && i.unit !== "unidad" ? ` ${i.unit}` : "";
    return `• ${qty}${unit} x ${i.name}`;
  });
  const note = input.note?.trim() ? `\n${input.note.trim()}` : "";
  return `${hello}${from} Te paso el pedido:\n\n${lines.join("\n")}${note}\n\n¿Me confirmás disponibilidad y precio? Gracias!`;
}
