import type { Product } from "../types";
import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";
import { getAllSettings } from "./settings";
import { recordSaleWithinTransaction, type SaleInput } from "./sales";
import { tnEnqueueStockPush } from "../lib/tiendaNube";
import { addMonthsYmd } from "../lib/imei";
import { todayYmd } from "../lib/format";
import { getLicenseStatus } from "../lib/license";
import { entitlementBlockedMessage, resolvePlanEntitlements } from "../config/planEntitlements";
import { FREE_MAX_PHONE_UNITS } from "../config/pricing";

export type UnitCondition = "nuevo" | "usado" | "reacondicionado";
export type UnitStatus = "in_stock" | "reserved" | "sold" | "returned" | "cancelled";
export type UnitSource = "purchase" | "trade_in";

export interface ProductUnit {
  id: number;
  product_id: number;
  product_name?: string | null;
  identifier: string;
  identifier_kind: "imei" | "serial";
  color: string | null;
  capacity: string | null;
  condition: UnitCondition;
  battery_pct: number | null;
  cost: number;
  price: number | null;
  status: UnitStatus;
  source: UnitSource;
  source_customer_id: number | null;
  source_customer_name?: string | null;
  source_sale_id: number | null;
  source_sale_doc?: string | null;
  supplier_id: number | null;
  supplier_name?: string | null;
  notes: string | null;
  sale_id: number | null;
  sale_doc?: string | null;
  sale_item_id: number | null;
  sold_at: string | null;
  sold_customer_id: number | null;
  sold_customer_name?: string | null;
  warranty_until: string | null;
  reserved_customer_id: number | null;
  reserved_customer_name?: string | null;
  reserved_deposit: number | null;
  reserved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductUnitEvent {
  id: number;
  unit_id: number;
  kind: string;
  detail: string | null;
  sale_id: number | null;
  customer_id: number | null;
  customer_name?: string | null;
  amount: number | null;
  user_name?: string | null;
  created_at: string;
}

export interface UnitInput {
  product_id: number;
  identifier: string;
  identifier_kind: "imei" | "serial";
  color?: string | null;
  capacity?: string | null;
  condition: UnitCondition;
  battery_pct?: number | null;
  cost: number;
  price?: number | null;
  supplier_id?: number | null;
  notes?: string | null;
}

export interface PhoneSettings {
  warrantyNewMonths: number;
  warrantyUsedMonths: number;
}

export interface UnitSaleLine {
  unitId: number;
  /** Posición del ítem en SaleInput.items. */
  itemIndex: number;
  warrantyMonths: number;
}

export interface TradeInInput {
  unit: UnitInput;
  value: number;
}

const UNIT_SELECT = `
  SELECT u.*,
         p.name AS product_name,
         sc.name AS source_customer_name,
         ss.doc_number AS source_sale_doc,
         sp.name AS supplier_name,
         s.doc_number AS sale_doc,
         bc.name AS sold_customer_name,
         rc.name AS reserved_customer_name
  FROM product_units u
  LEFT JOIN products p ON p.id = u.product_id
  LEFT JOIN customers sc ON sc.id = u.source_customer_id
  LEFT JOIN sales ss ON ss.id = u.source_sale_id
  LEFT JOIN suppliers sp ON sp.id = u.supplier_id
  LEFT JOIN sales s ON s.id = u.sale_id
  LEFT JOIN customers bc ON bc.id = u.sold_customer_id
  LEFT JOIN customers rc ON rc.id = u.reserved_customer_id
`;

function syncId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function getPhoneSettings(): Promise<PhoneSettings> {
  const s = await getAllSettings();
  const n = (v: string | undefined, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 && v !== undefined && v !== "" ? Math.round(x) : d;
  };
  return {
    warrantyNewMonths: n(s.phone_warranty_new_months, 12),
    warrantyUsedMonths: n(s.phone_warranty_used_months, 3),
  };
}

export function warrantyMonthsFor(
  product: Pick<Product, "warranty_months_new" | "warranty_months_used">,
  condition: UnitCondition,
  defaults: PhoneSettings,
): number {
  if (condition === "nuevo") return product.warranty_months_new ?? defaults.warrantyNewMonths;
  return product.warranty_months_used ?? defaults.warrantyUsedMonths;
}

export async function saveProductPhoneFields(
  productId: number,
  fields: {
    serialized: boolean;
    price_usd: number | null;
    warranty_months_new: number | null;
    warranty_months_used: number | null;
  },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE products SET serialized = $1, price_usd = $2, warranty_months_new = $3, warranty_months_used = $4
     WHERE id = $5`,
    [
      fields.serialized ? 1 : 0,
      fields.price_usd && fields.price_usd > 0 ? fields.price_usd : null,
      fields.warranty_months_new,
      fields.warranty_months_used,
      productId,
    ],
  );
}

async function logEvent(
  unitId: number,
  kind: string,
  extra: {
    detail?: string | null;
    sale_id?: number | null;
    customer_id?: number | null;
    amount?: number | null;
    user_id?: number | null;
  } = {},
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO product_unit_events (unit_id, kind, detail, sale_id, customer_id, amount, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      unitId,
      kind,
      extra.detail ?? null,
      extra.sale_id ?? null,
      extra.customer_id ?? null,
      extra.amount ?? null,
      extra.user_id ?? null,
    ],
  );
}

async function moveProductStock(
  productId: number,
  delta: number,
  referenceType: string,
  referenceId: number,
  userId: number | null,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE products SET stock = stock + $1 WHERE id = $2", [delta, productId]);
  await db.execute(
    `INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
     VALUES ($1, 'adjustment', $2, $3, $4, $5, $6)`,
    [productId, delta, referenceType, referenceId, userId, syncId()],
  );
  tnEnqueueStockPush(productId);
}

async function assertIdentifierFree(identifier: string, exceptUnitId?: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: number; product_name: string | null; status: string }[]>(
    `SELECT u.id, p.name AS product_name, u.status FROM product_units u
     LEFT JOIN products p ON p.id = u.product_id
     WHERE u.identifier = $1 AND u.status IN ('in_stock','reserved') AND u.id != $2 LIMIT 1`,
    [identifier, exceptUnitId ?? 0],
  );
  if (rows.length) {
    throw new Error(
      `Ese código ya está en stock${rows[0].product_name ? ` (${rows[0].product_name})` : ""}.`,
    );
  }
}

export interface PhoneUnitQuota {
  /** Gratis y Permanente: prueba con FREE_MAX_PHONE_UNITS equipos. */
  limited: boolean;
  used: number;
  max: number;
  left: number;
}

async function phoneUnitsLimited(): Promise<boolean> {
  const status = await getLicenseStatus().catch(() => null);
  return !resolvePlanEntitlements(status).phoneStore;
}

/** Todos los equipos cargados alguna vez: también vendidos, usados tomados y los quitados por error. */
async function countPhoneUnitsLoaded(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT (SELECT COUNT(*) FROM product_units)
          + (SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'product_unit_remove') AS n`,
  );
  return Number(rows[0]?.n ?? 0);
}

export async function getPhoneUnitQuota(): Promise<PhoneUnitQuota> {
  const limited = await phoneUnitsLimited();
  if (!limited) return { limited, used: 0, max: FREE_MAX_PHONE_UNITS, left: Number.POSITIVE_INFINITY };
  const used = await countPhoneUnitsLoaded();
  return { limited, used, max: FREE_MAX_PHONE_UNITS, left: Math.max(0, FREE_MAX_PHONE_UNITS - used) };
}

/** Corta antes de abrir la transacción (pide la licencia); el conteo se repite adentro. */
export async function assertCanAddPhoneUnit(limited?: boolean): Promise<void> {
  if (!(limited ?? (await phoneUnitsLimited()))) return;
  if ((await countPhoneUnitsLoaded()) >= FREE_MAX_PHONE_UNITS) {
    throw new Error(entitlementBlockedMessage("phoneStore"));
  }
}

async function insertUnitWithinTransaction(
  input: UnitInput,
  userId: number | null,
  limited: boolean,
  origin: { source: UnitSource; customerId?: number | null; saleId?: number | null } = {
    source: "purchase",
  },
): Promise<number> {
  const identifier = input.identifier.trim();
  if (!identifier) throw new Error("Falta el IMEI o número de serie.");
  await assertCanAddPhoneUnit(limited);
  await assertIdentifierFree(identifier);
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO product_units
       (product_id, identifier, identifier_kind, color, capacity, condition, battery_pct, cost, price,
        status, source, source_customer_id, source_sale_id, supplier_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'in_stock',$10,$11,$12,$13,$14,$15)`,
    [
      input.product_id,
      identifier,
      input.identifier_kind,
      input.color?.trim() || null,
      input.capacity?.trim() || null,
      input.condition,
      input.battery_pct ?? null,
      input.cost || 0,
      input.price && input.price > 0 ? input.price : null,
      origin.source,
      origin.customerId ?? null,
      origin.saleId ?? null,
      input.supplier_id ?? null,
      input.notes?.trim() || null,
      userId,
    ],
  );
  const unitId = res.lastInsertId as number;
  await moveProductStock(input.product_id, 1, origin.source === "trade_in" ? "trade_in" : "product_unit", unitId, userId);
  await logEvent(unitId, origin.source === "trade_in" ? "trade_in" : "entered", {
    sale_id: origin.saleId ?? null,
    customer_id: origin.customerId ?? null,
    amount: input.cost || 0,
    user_id: userId,
  });
  return unitId;
}

export async function addUnit(input: UnitInput, userId: number | null): Promise<number> {
  const limited = await phoneUnitsLimited();
  return withImmediateTransaction(() => insertUnitWithinTransaction(input, userId, limited));
}

export async function updateUnitDetails(
  unitId: number,
  input: Omit<UnitInput, "product_id">,
): Promise<void> {
  await withImmediateTransaction(async () => {
    const identifier = input.identifier.trim();
    if (!identifier) throw new Error("Falta el IMEI o número de serie.");
    const db = await getDb();
    const rows = await db.select<{ status: string }[]>("SELECT status FROM product_units WHERE id = $1", [unitId]);
    if (!rows.length) throw new Error("Unidad no encontrada.");
    if (rows[0].status === "in_stock" || rows[0].status === "reserved") {
      await assertIdentifierFree(identifier, unitId);
    }
    await db.execute(
      `UPDATE product_units SET identifier=$1, identifier_kind=$2, color=$3, capacity=$4, condition=$5,
         battery_pct=$6, cost=$7, price=$8, supplier_id=$9, notes=$10, updated_at=datetime('now','localtime')
       WHERE id=$11`,
      [
        identifier,
        input.identifier_kind,
        input.color?.trim() || null,
        input.capacity?.trim() || null,
        input.condition,
        input.battery_pct ?? null,
        input.cost || 0,
        input.price && input.price > 0 ? input.price : null,
        input.supplier_id ?? null,
        input.notes?.trim() || null,
        unitId,
      ],
    );
  });
}

/** Quita una unidad cargada por error (nunca vendida). Baja el stock en 1. */
export async function removeUnit(unitId: number, userId: number | null): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ product_id: number; status: string; source: string }[]>(
      "SELECT product_id, status, source FROM product_units WHERE id = $1",
      [unitId],
    );
    const u = rows[0];
    if (!u) throw new Error("Unidad no encontrada.");
    if (u.status !== "in_stock") throw new Error("Solo se puede quitar una unidad que está en stock.");
    if (u.source === "trade_in") {
      throw new Error("Esta unidad entró como parte de pago de una venta. Para sacarla, anulá esa venta.");
    }
    await moveProductStock(u.product_id, -1, "product_unit_remove", unitId, userId);
    await db.execute("DELETE FROM product_unit_events WHERE unit_id = $1", [unitId]);
    await db.execute("DELETE FROM product_units WHERE id = $1", [unitId]);
  });
}

export async function reserveUnit(
  unitId: number,
  customerId: number,
  deposit: number,
  userId: number | null,
): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ status: string }[]>("SELECT status FROM product_units WHERE id = $1", [unitId]);
    if (rows[0]?.status !== "in_stock") throw new Error("Solo se reserva una unidad que está en stock.");
    await db.execute(
      `UPDATE product_units SET status='reserved', reserved_customer_id=$1, reserved_deposit=$2,
         reserved_at=datetime('now','localtime'), updated_at=datetime('now','localtime')
       WHERE id=$3`,
      [customerId, deposit > 0 ? deposit : null, unitId],
    );
    await logEvent(unitId, "reserved", { customer_id: customerId, amount: deposit > 0 ? deposit : null, user_id: userId });
  });
}

export async function releaseReservation(unitId: number, userId: number | null): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ status: string; reserved_customer_id: number | null }[]>(
      "SELECT status, reserved_customer_id FROM product_units WHERE id = $1",
      [unitId],
    );
    if (rows[0]?.status !== "reserved") throw new Error("La unidad no está reservada.");
    await db.execute(
      `UPDATE product_units SET status='in_stock', reserved_customer_id=NULL, reserved_deposit=NULL,
         reserved_at=NULL, updated_at=datetime('now','localtime')
       WHERE id=$1`,
      [unitId],
    );
    await logEvent(unitId, "reservation_released", { customer_id: rows[0].reserved_customer_id, user_id: userId });
  });
}

/** El cliente la trae por garantía o la devuelve: queda fuera del stock. */
export async function markUnitReturned(unitId: number, note: string, userId: number | null): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ status: string; sold_customer_id: number | null }[]>(
      "SELECT status, sold_customer_id FROM product_units WHERE id = $1",
      [unitId],
    );
    if (rows[0]?.status !== "sold") throw new Error("Solo se marca como devuelta una unidad vendida.");
    await db.execute(
      "UPDATE product_units SET status='returned', updated_at=datetime('now','localtime') WHERE id=$1",
      [unitId],
    );
    await logEvent(unitId, "returned", { detail: note.trim() || null, customer_id: rows[0].sold_customer_id, user_id: userId });
  });
}

/** Una unidad devuelta vuelve a estar a la venta (suma 1 al stock). */
export async function returnUnitToStock(unitId: number, userId: number | null): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ status: string; product_id: number; identifier: string }[]>(
      "SELECT status, product_id, identifier FROM product_units WHERE id = $1",
      [unitId],
    );
    const u = rows[0];
    if (u?.status !== "returned") throw new Error("Solo vuelve a stock una unidad devuelta.");
    await assertIdentifierFree(u.identifier, unitId);
    await db.execute(
      "UPDATE product_units SET status='in_stock', updated_at=datetime('now','localtime') WHERE id=$1",
      [unitId],
    );
    await moveProductStock(u.product_id, 1, "product_unit_restock", unitId, userId);
    await logEvent(unitId, "restocked", { user_id: userId });
  });
}

export async function listAvailableUnits(productId: number): Promise<ProductUnit[]> {
  const db = await getDb();
  return db.select<ProductUnit[]>(
    `${UNIT_SELECT} WHERE u.product_id = $1 AND u.status IN ('in_stock','reserved')
     ORDER BY u.status = 'reserved', u.id`,
    [productId],
  );
}

export interface UnitListFilter {
  status?: UnitStatus | "";
  search?: string;
  limit?: number;
}

export async function listUnits(filter: UnitListFilter = {}): Promise<ProductUnit[]> {
  const db = await getDb();
  const search = (filter.search ?? "").trim();
  return db.select<ProductUnit[]>(
    `${UNIT_SELECT}
     WHERE ($1 = '' OR u.status = $1)
       AND ($2 = '' OR u.identifier LIKE $3 OR p.name LIKE $3)
     ORDER BY u.updated_at DESC, u.id DESC
     LIMIT $4`,
    [filter.status ?? "", search, `%${search}%`, filter.limit ?? 300],
  );
}

export async function findUnitsByIdentifier(code: string): Promise<ProductUnit[]> {
  const trimmed = code.trim();
  if (!trimmed) return [];
  const db = await getDb();
  return db.select<ProductUnit[]>(
    `${UNIT_SELECT} WHERE u.identifier = $1 COLLATE NOCASE OR (length($1) >= 6 AND u.identifier LIKE $2)
     ORDER BY u.id DESC LIMIT 50`,
    [trimmed, `%${trimmed}`],
  );
}

/** Unidad a la venta con ese código exacto (para el escáner del punto de venta). */
export async function findSellableUnit(
  code: string,
): Promise<{ unit: ProductUnit; product: Product } | null> {
  const trimmed = code.trim();
  if (trimmed.length < 4) return null;
  const db = await getDb();
  const rows = await db.select<ProductUnit[]>(
    `${UNIT_SELECT} WHERE u.identifier = $1 COLLATE NOCASE AND u.status IN ('in_stock','reserved') LIMIT 1`,
    [trimmed],
  );
  if (!rows.length) return null;
  const { getProduct } = await import("./products");
  const product = await getProduct(rows[0].product_id);
  return product && product.active ? { unit: rows[0], product } : null;
}

/** Último estado de un código que no está a la venta (para avisar en el escáner). */
export async function findUnitStatusByCode(code: string): Promise<ProductUnit | null> {
  const trimmed = code.trim();
  if (trimmed.length < 4) return null;
  const db = await getDb();
  const rows = await db.select<ProductUnit[]>(
    `${UNIT_SELECT} WHERE u.identifier = $1 COLLATE NOCASE ORDER BY u.id DESC LIMIT 1`,
    [trimmed],
  );
  return rows[0] ?? null;
}

export async function listUnitEvents(unitIds: number[]): Promise<ProductUnitEvent[]> {
  if (unitIds.length === 0) return [];
  const db = await getDb();
  const ph = unitIds.map((_, i) => `$${i + 1}`).join(",");
  return db.select<ProductUnitEvent[]>(
    `SELECT e.*, c.name AS customer_name, us.display_name AS user_name
     FROM product_unit_events e
     LEFT JOIN customers c ON c.id = e.customer_id
     LEFT JOIN users us ON us.id = e.user_id
     WHERE e.unit_id IN (${ph})
     ORDER BY e.id ASC`,
    unitIds,
  );
}

export interface SerializedStockGap {
  product_id: number;
  name: string;
  stock: number;
  units: number;
}

/** Productos por IMEI cuyo stock no coincide con las unidades cargadas. */
export async function listSerializedStockGaps(): Promise<SerializedStockGap[]> {
  const db = await getDb();
  return db.select<SerializedStockGap[]>(
    `SELECT p.id AS product_id, p.name, p.stock,
            (SELECT COUNT(*) FROM product_units u
             WHERE u.product_id = p.id AND u.status IN ('in_stock','reserved')) AS units
     FROM products p
     WHERE p.active = 1 AND COALESCE(p.serialized, 0) = 1
       AND ABS(p.stock - (SELECT COUNT(*) FROM product_units u
                          WHERE u.product_id = p.id AND u.status IN ('in_stock','reserved'))) > 0.0001
     ORDER BY p.name`,
  );
}

export async function matchStockToUnits(productId: number, userId: number | null): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const rows = await db.select<{ stock: number; units: number }[]>(
      `SELECT p.stock,
              (SELECT COUNT(*) FROM product_units u
               WHERE u.product_id = p.id AND u.status IN ('in_stock','reserved')) AS units
       FROM products p WHERE p.id = $1`,
      [productId],
    );
    const r = rows[0];
    if (!r) return;
    const delta = r.units - r.stock;
    if (Math.abs(delta) < 1e-9) return;
    await moveProductStock(productId, delta, "product_unit_match", productId, userId);
  });
}

export async function listSerializedProducts(): Promise<Product[]> {
  const db = await getDb();
  return db.select<Product[]>(
    `SELECT p.* FROM products p WHERE p.active = 1 AND COALESCE(p.serialized, 0) = 1 ORDER BY p.name`,
  );
}

async function sellUnitsWithinTransaction(
  saleId: number,
  lines: UnitSaleLine[],
  customerId: number | null,
  userId: number | null,
): Promise<void> {
  if (lines.length === 0) return;
  const db = await getDb();
  const itemIds = (
    await db.select<{ id: number }[]>("SELECT id FROM sale_items WHERE sale_id = $1 ORDER BY id", [saleId])
  ).map((r) => r.id);
  const today = todayYmd();
  for (const line of lines) {
    const rows = await db.select<{ status: string; identifier: string }[]>(
      "SELECT status, identifier FROM product_units WHERE id = $1",
      [line.unitId],
    );
    const u = rows[0];
    if (!u || (u.status !== "in_stock" && u.status !== "reserved")) {
      throw new Error(`La unidad ${u?.identifier ?? `#${line.unitId}`} ya no está a la venta. Sacala del carrito.`);
    }
    const warrantyUntil = line.warrantyMonths > 0 ? addMonthsYmd(today, line.warrantyMonths) : null;
    await db.execute(
      `UPDATE product_units SET status='sold', sale_id=$1, sale_item_id=$2, sold_at=datetime('now','localtime'),
         sold_customer_id=$3, warranty_until=$4, updated_at=datetime('now','localtime')
       WHERE id=$5`,
      [saleId, itemIds[line.itemIndex] ?? null, customerId, warrantyUntil, line.unitId],
    );
    await logEvent(line.unitId, "sold", {
      sale_id: saleId,
      customer_id: customerId,
      detail: warrantyUntil ? `Garantía hasta ${warrantyUntil}` : "Sin garantía",
      user_id: userId,
    });
  }
}

/** Venta con unidades por IMEI y/o un usado tomado como parte de pago, todo en una transacción. */
export async function recordSaleWithPhoneUnits(
  sale: SaleInput,
  unitLines: UnitSaleLine[],
  tradeIn: TradeInInput | null,
): Promise<number> {
  const limited = tradeIn ? await phoneUnitsLimited() : false;
  if (tradeIn) await assertCanAddPhoneUnit(limited);
  return withImmediateTransaction(async () => {
    const saleId = await recordSaleWithinTransaction(sale);
    await sellUnitsWithinTransaction(saleId, unitLines, sale.customer_id ?? null, sale.user_id ?? null);
    if (tradeIn) {
      await insertUnitWithinTransaction({ ...tradeIn.unit, cost: tradeIn.value }, sale.user_id ?? null, limited, {
        source: "trade_in",
        customerId: sale.customer_id ?? null,
        saleId,
      });
    }
    return saleId;
  });
}

/** Anular venta: las vendidas vuelven a stock y el usado tomado sale. Corre dentro de la TX de voidSale. */
export async function revertPhoneUnitsForVoidedSale(saleId: number, userId: number | null): Promise<void> {
  const db = await getDb();
  const taken = await db.select<{ id: number; product_id: number; status: string; identifier: string }[]>(
    "SELECT id, product_id, status, identifier FROM product_units WHERE source_sale_id = $1 AND status != 'cancelled'",
    [saleId],
  );
  for (const u of taken) {
    if (u.status !== "in_stock") {
      throw new Error(
        `El usado ${u.identifier} que entró en esta venta ya no está en stock (vendido o reservado). No se puede anular.`,
      );
    }
    await db.execute(
      "UPDATE product_units SET status='cancelled', updated_at=datetime('now','localtime') WHERE id=$1",
      [u.id],
    );
    await moveProductStock(u.product_id, -1, "trade_in_void", saleId, userId);
    await logEvent(u.id, "trade_in_voided", { sale_id: saleId, user_id: userId });
  }
  const sold = await db.select<{ id: number }[]>(
    "SELECT id FROM product_units WHERE sale_id = $1 AND status IN ('sold','returned')",
    [saleId],
  );
  for (const u of sold) {
    await db.execute(
      `UPDATE product_units SET status='in_stock', sale_id=NULL, sale_item_id=NULL, sold_at=NULL,
         sold_customer_id=NULL, warranty_until=NULL, reserved_customer_id=NULL, reserved_deposit=NULL,
         reserved_at=NULL, updated_at=datetime('now','localtime')
       WHERE id=$1`,
      [u.id],
    );
    await logEvent(u.id, "sale_voided", { sale_id: saleId, user_id: userId });
  }
}

/** Al corregir una venta y quitar la línea de una unidad, la unidad vuelve a stock (el stock ya lo repone updateSale). */
export async function revertPhoneUnitsForRemovedItems(
  saleId: number,
  itemIds: number[],
  userId: number | null,
): Promise<void> {
  if (itemIds.length === 0) return;
  const db = await getDb();
  const ph = itemIds.map((_, i) => `$${i + 2}`).join(",");
  const rows = await db.select<{ id: number }[]>(
    `SELECT id FROM product_units WHERE sale_id = $1 AND sale_item_id IN (${ph}) AND status = 'sold'`,
    [saleId, ...itemIds],
  );
  for (const u of rows) {
    await db.execute(
      `UPDATE product_units SET status='in_stock', sale_id=NULL, sale_item_id=NULL, sold_at=NULL,
         sold_customer_id=NULL, warranty_until=NULL, updated_at=datetime('now','localtime')
       WHERE id=$1`,
      [u.id],
    );
    await logEvent(u.id, "sale_item_removed", { sale_id: saleId, user_id: userId });
  }
}
