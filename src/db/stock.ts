import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

export interface BarcodeLookup {
  product_id: number;
  quantity_factor: number;
}

/** Busca producto por cualquier código de barras registrado. */
export async function findProductByBarcode(code: string): Promise<BarcodeLookup | null> {
  const db = await getDb();
  const trimmed = code.trim();

  const fromBarcodes = await db.select<{ product_id: number; quantity_factor: number }[]>(
    `SELECT product_id, quantity_factor FROM product_barcodes WHERE barcode = $1 LIMIT 1`,
    [trimmed],
  );
  if (fromBarcodes.length) {
    return {
      product_id: fromBarcodes[0].product_id,
      quantity_factor: fromBarcodes[0].quantity_factor,
    };
  }

  const legacy = await db.select<{ id: number }[]>(
    `SELECT id FROM products WHERE (barcode = $1 OR sku = $1) AND active = 1 LIMIT 1`,
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
  const db = await getDb();
  const kits = await db.select<{ kit_id: number }[]>(
    "SELECT id AS kit_id FROM product_kits WHERE kit_product_id = $1",
    [productId],
  );
  const ref: StockRef = { movementType, referenceType, referenceId };
  if (kits.length) {
    const items = await db.select<{ component_product_id: number; qty: number }[]>(
      "SELECT component_product_id, qty FROM kit_items WHERE kit_id = $1",
      [kits[0].kit_id],
    );
    for (const it of items) {
      await deductSingleProduct(it.component_product_id, it.qty * qty, ref, userId);
    }
    return;
  }
  await deductSingleProduct(productId, qty, ref, userId);
}

export async function restoreStockForReference(
  productId: number,
  qty: number,
  movementType: string,
  referenceType: string,
  referenceId: number,
  userId: number | null,
): Promise<void> {
  const db = await getDb();
  const kits = await db.select<{ kit_id: number }[]>(
    "SELECT id AS kit_id FROM product_kits WHERE kit_product_id = $1",
    [productId],
  );
  const ref: StockRef = { movementType, referenceType, referenceId };
  if (kits.length) {
    const items = await db.select<{ component_product_id: number; qty: number }[]>(
      "SELECT component_product_id, qty FROM kit_items WHERE kit_id = $1",
      [kits[0].kit_id],
    );
    for (const it of items) {
      await restoreSingleProduct(it.component_product_id, it.qty * qty, ref, userId);
    }
    return;
  }
  await restoreSingleProduct(productId, qty, ref, userId);
}

async function deductSingleProduct(
  productId: number,
  qty: number,
  ref: StockRef,
  userId: number | null,
): Promise<void> {
  const db = await getDb();

  const track = await db.select<{ track_batches: number; batch_policy: string | null }[]>(
    "SELECT track_batches, batch_policy FROM products WHERE id = $1",
    [productId],
  );
  const p = track[0];

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
        `INSERT INTO stock_movements (product_id, batch_id, movement_type, qty, reference_type, reference_id, user_id)
         VALUES ($1,$2,$3,-$4,$5,$6,$7)`,
        [productId, b.id, ref.movementType, take, ref.referenceType, ref.referenceId, userId],
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
      `INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, user_id)
       VALUES ($1,$2,-$3,$4,$5,$6)`,
      [productId, ref.movementType, qty, ref.referenceType, ref.referenceId, userId],
    );
  }
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

/** Devuelve stock al anular una venta (inverso de deductStockForSale). */
export async function restoreStockForSale(
  productId: number,
  qty: number,
  saleId: number,
  userId: number | null,
): Promise<void> {
  const db = await getDb();

  const kits = await db.select<{ kit_id: number }[]>(
    "SELECT id AS kit_id FROM product_kits WHERE kit_product_id = $1",
    [productId],
  );

  if (kits.length) {
    const items = await db.select<{ component_product_id: number; qty: number }[]>(
      "SELECT component_product_id, qty FROM kit_items WHERE kit_id = $1",
      [kits[0].kit_id],
    );
    for (const it of items) {
      await restoreSingleProduct(it.component_product_id, it.qty * qty, {
        movementType: "void",
        referenceType: "sale_void",
        referenceId: saleId,
      }, userId);
    }
    return;
  }

  await restoreSingleProduct(productId, qty, {
    movementType: "void",
    referenceType: "sale_void",
    referenceId: saleId,
  }, userId);
}

async function restoreSingleProduct(
  productId: number,
  qty: number,
  ref: StockRef,
  userId: number | null,
): Promise<void> {
  const db = await getDb();

  const track = await db.select<{ track_batches: number }[]>(
    "SELECT track_batches FROM products WHERE id = $1",
    [productId],
  );

  if (track[0]?.track_batches) {
    await db.execute("UPDATE products SET stock = stock + $1 WHERE id = $2", [qty, productId]);
  } else {
    await db.execute("UPDATE products SET stock = stock + $1 WHERE id = $2", [qty, productId]);
  }

  await db.execute(
    `INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, user_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [productId, ref.movementType, qty, ref.referenceType, ref.referenceId, userId],
  );
}

/** Ajuste manual de stock (+/-) con registro en movimientos — TX atómica. */
export async function adjustStock(
  productId: number,
  qtyDelta: number,
  userId: number | null,
  note?: string,
): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await db.execute("UPDATE products SET stock = stock + $1 WHERE id = $2", [qtyDelta, productId]);
    await db.execute(
      `INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, user_id)
       VALUES ($1, 'adjustment', $2, $3, $4)`,
      [productId, qtyDelta, note ?? "manual", userId],
    );
  });
}
