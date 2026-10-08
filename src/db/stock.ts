import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";
import { tnEnqueueStockPush } from "../lib/tiendaNube";
import { expandStockDeductions, ingredientsForProduction, mergeDeductions, type StockExpandNode } from "../lib/recipeMath";
import { getProductRecipe, getRecipeQtyPerUnit } from "./recipes";

function notifyTnStock(productId: number) {
  tnEnqueueStockPush(productId);
}

async function loadExpandNode(productId: number): Promise<StockExpandNode | undefined> {
  const db = await getDb();
  const rows = await db.select<
    { is_kit: number; track_stock: number | null }[]
  >("SELECT is_kit, track_stock FROM products WHERE id = $1", [productId]);
  if (!rows.length) return undefined;
  const p = rows[0];
  const node: StockExpandNode = {
    id: productId,
    isKit: p.is_kit === 1,
    trackStock: p.track_stock !== 0,
  };
  if (node.isKit) {
    const kits = await db.select<{ kit_id: number }[]>(
      "SELECT id AS kit_id FROM product_kits WHERE kit_product_id = $1",
      [productId],
    );
    if (kits.length) {
      const items = await db.select<{ component_product_id: number; qty: number }[]>(
        "SELECT component_product_id, qty FROM kit_items WHERE kit_id = $1",
        [kits[0].kit_id],
      );
      node.kitItems = items.map((it) => ({
        productId: it.component_product_id,
        qty: it.qty,
      }));
    }
  } else if (!node.trackStock) {
    const recipe = await getRecipeQtyPerUnit(productId);
    if (recipe.length) {
      node.recipeItems = recipe.map((it) => ({
        productId: it.ingredient_product_id,
        qty: it.qty,
      }));
    }
  }
  return node;
}

export interface BarcodeLookup {
  product_id: number;
  quantity_factor: number;
}

/** Busca producto por cualquier código de barras / SKU / ref. proveedor (sin distinguir mayúsculas). */
export async function findProductByBarcode(code: string): Promise<BarcodeLookup | null> {
  const db = await getDb();
  const trimmed = code.trim();
  if (!trimmed) return null;

  const fromBarcodes = await db.select<{ product_id: number; quantity_factor: number }[]>(
    `SELECT product_id, quantity_factor FROM product_barcodes WHERE barcode = $1 COLLATE NOCASE LIMIT 1`,
    [trimmed],
  );
  if (fromBarcodes.length) {
    return {
      product_id: fromBarcodes[0].product_id,
      quantity_factor: fromBarcodes[0].quantity_factor,
    };
  }

  const legacy = await db.select<{ id: number }[]>(
    `SELECT id FROM products WHERE (barcode = $1 COLLATE NOCASE OR sku = $1 COLLATE NOCASE) AND active = 1 LIMIT 1`,
    [trimmed],
  );
  if (legacy.length) {
    return { product_id: legacy[0].id, quantity_factor: 1 };
  }
  return null;
}

interface StockRef {
  movementType: string;
  referenceType: string;
  referenceId: number;
}

/** Descuenta stock: kits expanden componentes; lotes usan FIFO por defecto. */
export async function deductStockForSale(
  productId: number,
  qty: number,
  saleId: number,
  userId: number | null,
): Promise<void> {
  await deductStockForReference(productId, qty, "sale", "sale", saleId, userId);
}

export async function deductStockForReference(
  productId: number,
  qty: number,
  movementType: string,
  referenceType: string,
  referenceId: number,
  userId: number | null,
): Promise<void> {
  const cache = new Map<number, StockExpandNode | undefined>();
  const resolve = (id: number) => {
    if (!cache.has(id)) {
      // sync placeholder — filled below via pre-walk
      return cache.get(id);
    }
    return cache.get(id);
  };
  // Precargar árbol (kits + recetas on-demand) de forma async.
  async function ensure(id: number): Promise<void> {
    if (cache.has(id)) return;
    const node = await loadExpandNode(id);
    cache.set(id, node);
    if (!node) return;
    for (const it of node.kitItems ?? []) await ensure(it.productId);
    for (const it of node.recipeItems ?? []) await ensure(it.productId);
  }
  await ensure(productId);
  const deductions = expandStockDeductions(productId, qty, resolve);
  const ref: StockRef = { movementType, referenceType, referenceId };
  for (const d of deductions) {
    await applyProductStockDelta(d.productId, -d.qty, ref, userId);
  }
}

export async function restoreStockForReference(
  productId: number,
  qty: number,
  movementType: string,
  referenceType: string,
  referenceId: number,
  userId: number | null,
): Promise<void> {
  const cache = new Map<number, StockExpandNode | undefined>();
  const resolve = (id: number) => cache.get(id);
  async function ensure(id: number): Promise<void> {
    if (cache.has(id)) return;
    const node = await loadExpandNode(id);
    cache.set(id, node);
    if (!node) return;
    for (const it of node.kitItems ?? []) await ensure(it.productId);
    for (const it of node.recipeItems ?? []) await ensure(it.productId);
  }
  await ensure(productId);
  const deductions = expandStockDeductions(productId, qty, resolve);
  const ref: StockRef = { movementType, referenceType, referenceId };
  const sourceType = referenceType.endsWith("_void")
    ? referenceType.replace(/_void$/, "")
    : referenceType;
  for (const d of deductions) {
    await restoreSingleProduct(d.productId, d.qty, ref, userId, sourceType);
  }
}

/**
 * Produce unidades de un elaborado con receta (prepare_mode=batch):
 * descuenta insumos y suma stock del producto terminado.
 */
export async function produceProduct(
  productId: number,
  qty: number,
  userId: number | null,
  notes?: string,
): Promise<{ productionId: number }> {
  if (qty <= 0) throw new Error("La cantidad a producir debe ser mayor a 0.");
  return withImmediateTransaction(async () => {
    const db = await getDb();
    const prod = await db.select<
      { product_kind: string | null; prepare_mode: string | null; track_stock: number | null; is_kit: number }[]
    >("SELECT product_kind, prepare_mode, track_stock, is_kit FROM products WHERE id = $1", [
      productId,
    ]);
    if (!prod.length) throw new Error("Producto no encontrado.");
    if (prod[0].is_kit === 1) throw new Error("Un combo no se produce: usá sus componentes.");
    if (prod[0].prepare_mode === "on_demand") {
      throw new Error("Este producto se prepara al momento: no acumula stock de producción.");
    }
    const recipe = await getProductRecipe(productId);
    if (!recipe || recipe.items.length === 0) {
      throw new Error("Definí una receta con insumos antes de producir.");
    }
    const rawNeeds = ingredientsForProduction(
      recipe.items.map((i) => ({ productId: i.ingredient_product_id, qtyPerYield: i.qty })),
      recipe.yield_qty,
      qty,
    );
    // Si un componente de la receta es «al momento», expandir a sus insumos
    // (ej. hamburguesa → medallón on_demand → carne molida).
    const cache = new Map<number, StockExpandNode | undefined>();
    const resolve = (id: number) => cache.get(id);
    async function ensure(id: number): Promise<void> {
      if (cache.has(id)) return;
      const node = await loadExpandNode(id);
      cache.set(id, node);
      if (!node) return;
      for (const it of node.kitItems ?? []) await ensure(it.productId);
      for (const it of node.recipeItems ?? []) await ensure(it.productId);
    }
    for (const n of rawNeeds) await ensure(n.productId);
    const needs = mergeDeductions(
      rawNeeds.flatMap((n) => expandStockDeductions(n.productId, n.qty, resolve)),
    );
    if (needs.length === 0) {
      throw new Error("La receta no descuenta stock. Revisá que los componentes lleven inventario.");
    }
    for (const n of needs) {
      const stockRows = await db.select<{ stock: number; name: string }[]>(
        "SELECT stock, name FROM products WHERE id = $1",
        [n.productId],
      );
      const avail = stockRows[0]?.stock ?? 0;
      if (avail + 1e-9 < n.qty) {
        throw new Error(
          `Stock insuficiente de «${stockRows[0]?.name ?? n.productId}»: hay ${avail}, se necesitan ${Number(n.qty.toFixed(4))}.`,
        );
      }
    }

    const syncId = crypto.randomUUID().replace(/-/g, "");
    const run = await db.execute(
      `INSERT INTO production_runs (product_id, qty, user_id, notes, sync_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [productId, qty, userId, notes ?? null, syncId],
    );
    const productionId = run.lastInsertId as number;
    const refUse: StockRef = {
      movementType: "production_use",
      referenceType: "production",
      referenceId: productionId,
    };
    for (const n of needs) {
      await applyProductStockDelta(n.productId, -n.qty, refUse, userId);
    }
    const refOut: StockRef = {
      movementType: "production",
      referenceType: "production",
      referenceId: productionId,
    };
    await applyProductStockDelta(productId, qty, refOut, userId);
    return { productionId };
  });
}

/** Aplica delta de stock a un producto hoja (ya expandido kit/receta). delta>0 suma, delta<0 resta. */
async function applyProductStockDelta(
  productId: number,
  delta: number,
  ref: StockRef,
  userId: number | null,
): Promise<void> {
  if (Math.abs(delta) <= 1e-12) return;
  if (delta < 0) {
    await deductSingleProduct(productId, -delta, ref, userId);
  } else {
    await restoreSingleProduct(productId, delta, ref, userId);
  }
}

async function deductSingleProduct(
  productId: number,
  qty: number,
  ref: StockRef,
  userId: number | null,
): Promise<void> {
  const db = await getDb();

  const track = await db.select<
    { track_batches: number; batch_policy: string | null; track_stock: number | null }[]
  >("SELECT track_batches, batch_policy, track_stock FROM products WHERE id = $1", [productId]);
  const p = track[0];
  // Hoja sin inventario (solo si quedó como no-op tras expansión).
  if (p && p.track_stock === 0) return;

  if (p?.track_batches) {
    const order = p.batch_policy === "LIFO" ? "DESC" : "ASC";
    let remaining = qty;
    const batches = await db.select<{ id: number; qty: number }[]>(
      `SELECT id, qty FROM product_batches WHERE product_id = $1 AND qty > 0
       ORDER BY CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at ${order}`,
      [productId],
    );
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, b.qty);
      await db.execute("UPDATE product_batches SET qty = qty - $1 WHERE id = $2", [take, b.id]);
      await db.execute(
        `INSERT INTO stock_movements (product_id, batch_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
         VALUES ($1,$2,$3,-$4,$5,$6,$7,$8)`,
        [
          productId,
          b.id,
          ref.movementType,
          take,
          ref.referenceType,
          ref.referenceId,
          userId,
          crypto.randomUUID().replace(/-/g, ""),
        ],
      );
      remaining -= take;
    }
    if (remaining > 0) {
      await db.execute("UPDATE products SET stock = stock - $1 WHERE id = $2", [remaining, productId]);
    } else {
      await db.execute(
        `UPDATE products SET stock = (SELECT COALESCE(SUM(qty),0) FROM product_batches WHERE product_id = $1) WHERE id = $1`,
        [productId],
      );
    }
  } else {
    await db.execute("UPDATE products SET stock = stock - $1 WHERE id = $2", [qty, productId]);
    await db.execute(
      `INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
       VALUES ($1,$2,-$3,$4,$5,$6,$7)`,
      [
        productId,
        ref.movementType,
        qty,
        ref.referenceType,
        ref.referenceId,
        userId,
        crypto.randomUUID().replace(/-/g, ""),
      ],
    );
  }
  notifyTnStock(productId);
}

export interface StockMovementRow {
  id: number;
  product_id: number;
  product_name: string;
  movement_type: string;
  qty: number;
  created_at: string;
}

export async function listStockMovements(limit = 80): Promise<StockMovementRow[]> {
  const db = await getDb();
  return db.select<StockMovementRow[]>(
    `SELECT m.id, m.product_id, p.name AS product_name, m.movement_type, m.qty, m.created_at
     FROM stock_movements m
     JOIN products p ON p.id = m.product_id
     ORDER BY m.id DESC LIMIT $1`,
    [limit],
  );
}

export async function listStockMovementsForProduct(
  productId: number,
  limit = 40,
): Promise<StockMovementRow[]> {
  const db = await getDb();
  return db.select<StockMovementRow[]>(
    `SELECT m.id, m.product_id, p.name AS product_name, m.movement_type, m.qty, m.created_at
     FROM stock_movements m
     JOIN products p ON p.id = m.product_id
     WHERE m.product_id = $1
     ORDER BY m.id DESC LIMIT $2`,
    [productId, limit],
  );
}

/** Devuelve stock al anular una venta (inverso de deductStockForSale). */
export async function restoreStockForSale(
  productId: number,
  qty: number,
  saleId: number,
  userId: number | null,
): Promise<void> {
  await restoreStockForReference(productId, qty, "void", "sale_void", saleId, userId);
}

async function restoreSingleProduct(
  productId: number,
  qty: number,
  ref: StockRef,
  userId: number | null,
  /** Tipo de referencia de la deducción original (p.ej. 'sale') para restaurar lotes. */
  sourceReferenceType?: string,
): Promise<void> {
  const db = await getDb();

  const flags = await db.select<{ track_batches: number; track_stock: number | null }[]>(
    "SELECT track_batches, track_stock FROM products WHERE id = $1",
    [productId],
  );
  if (flags[0] && flags[0].track_stock === 0) return;

  if (flags[0]?.track_batches) {
    const lookType =
      sourceReferenceType ??
      (ref.referenceType.endsWith("_void")
        ? ref.referenceType.replace(/_void$/, "")
        : ref.referenceType);

    const deductions = await db.select<{ batch_id: number; qty: number }[]>(
      `SELECT batch_id, ABS(qty) AS qty FROM stock_movements
       WHERE product_id = $1
         AND reference_type = $2
         AND reference_id = $3
         AND batch_id IS NOT NULL
         AND qty < 0
       ORDER BY id ASC`,
      [productId, lookType, ref.referenceId],
    );

    let restored = 0;
    for (const d of deductions) {
      if (restored >= qty) break;
      const give = Math.min(qty - restored, d.qty);
      await db.execute("UPDATE product_batches SET qty = qty + $1 WHERE id = $2", [
        give,
        d.batch_id,
      ]);
      await db.execute(
        `INSERT INTO stock_movements (product_id, batch_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          productId,
          d.batch_id,
          ref.movementType,
          give,
          ref.referenceType,
          ref.referenceId,
          userId,
          crypto.randomUUID().replace(/-/g, ""),
        ],
      );
      restored += give;
    }

    if (restored < qty) {
      const rem = qty - restored;
      await db.execute(
        `INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          productId,
          ref.movementType,
          rem,
          ref.referenceType,
          ref.referenceId,
          userId,
          crypto.randomUUID().replace(/-/g, ""),
        ],
      );
    }

    await db.execute(
      `UPDATE products SET stock = (SELECT COALESCE(SUM(qty),0) FROM product_batches WHERE product_id = $1) WHERE id = $1`,
      [productId],
    );
    notifyTnStock(productId);
    return;
  }

  await db.execute("UPDATE products SET stock = stock + $1 WHERE id = $2", [qty, productId]);
  await db.execute(
    `INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      productId,
      ref.movementType,
      qty,
      ref.referenceType,
      ref.referenceId,
      userId,
      crypto.randomUUID().replace(/-/g, ""),
    ],
  );
  notifyTnStock(productId);
}

/** Ajuste de una variante: mueve su stock y el total del producto. */
export async function adjustVariantStock(
  productId: number,
  variantId: number,
  qtyDelta: number,
  userId: number | null,
): Promise<void> {
  if (Math.abs(qtyDelta) <= 1e-9) return;
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const syncId = crypto.randomUUID().replace(/-/g, "");
    await db.execute("UPDATE product_variants SET stock = stock + $1 WHERE id = $2", [
      qtyDelta,
      variantId,
    ]);
    await db.execute("UPDATE products SET stock = stock + $1 WHERE id = $2", [qtyDelta, productId]);
    await db.execute(
      `INSERT INTO stock_movements
         (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
       VALUES ($1, 'adjustment', $2, 'variant', $3, $4, $5)`,
      [productId, qtyDelta, variantId, userId, syncId],
    );
  });
  notifyTnStock(productId);
}

/** Ajuste manual de stock (+/-) con registro en movimientos — TX atómica. */
export async function adjustStock(
  productId: number,
  qtyDelta: number,
  userId: number | null,
  note?: string,
): Promise<void> {
  if (Math.abs(qtyDelta) <= 1e-9) return;
  await withImmediateTransaction(async () => {
    const db = await getDb();
    const syncId = crypto.randomUUID().replace(/-/g, "");
    await db.execute("UPDATE products SET stock = stock + $1 WHERE id = $2", [qtyDelta, productId]);
    await db.execute(
      `INSERT INTO stock_movements
         (product_id, movement_type, qty, reference_type, user_id, sync_id)
       VALUES ($1, 'adjustment', $2, $3, $4, $5)`,
      [productId, qtyDelta, note ?? "manual", userId, syncId],
    );
  });
  notifyTnStock(productId);
}
