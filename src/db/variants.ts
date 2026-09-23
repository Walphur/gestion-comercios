import type { ProductVariant, VariantDraft } from "../types";
import { getDb } from "./index";
import { withImmediateTransaction } from "./tx";

let minStockColumnReady: Promise<void> | null = null;

/** Defensa si la migración 0043 aún no corrió en esta instalación. */
async function ensureVariantMinStockColumn(): Promise<void> {
  if (!minStockColumnReady) {
    minStockColumnReady = (async () => {
      const db = await getDb();
      const cols = await db.select<{ name: string }[]>("PRAGMA table_info(product_variants)");
      if (!cols.some((c) => c.name === "min_stock")) {
        await db.execute(
          "ALTER TABLE product_variants ADD COLUMN min_stock REAL NOT NULL DEFAULT 0",
        );
      }
    })().catch((err) => {
      minStockColumnReady = null;
      throw err;
    });
  }
  await minStockColumnReady;
}

interface VariantRow {
  id: number;
  product_id: number;
  attributes: string | null;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  stock: number;
  min_stock?: number | null;
}

function parseRow(r: VariantRow): ProductVariant {
  let attrs: Record<string, string> = {};
  try {
    attrs = r.attributes ? JSON.parse(r.attributes) : {};
  } catch {
    attrs = {};
  }
  return {
    id: r.id,
    product_id: r.product_id,
    attributes: attrs,
    sku: r.sku,
    barcode: r.barcode,
    price: r.price,
    stock: r.stock,
    min_stock: Number(r.min_stock) || 0,
  };
}

export async function listVariants(productId: number): Promise<ProductVariant[]> {
  await ensureVariantMinStockColumn();
  const db = await getDb();
  const rows = await db.select<VariantRow[]>(
    "SELECT * FROM product_variants WHERE product_id = $1 ORDER BY id",
    [productId],
  );
  return rows.map(parseRow);
}

/**
 * Reemplaza todas las variantes de un producto y actualiza el flag has_variants
 * y el stock total del producto (suma de las variantes).
 */
export async function saveProductVariants(
  productId: number,
  drafts: VariantDraft[],
): Promise<void> {
  await ensureVariantMinStockColumn();
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await db.execute("DELETE FROM product_variants WHERE product_id = $1", [productId]);

    let totalStock = 0;
    for (const d of drafts) {
      totalStock += Number(d.stock) || 0;
      await db.execute(
        `INSERT INTO product_variants (product_id, attributes, sku, barcode, price, stock, min_stock)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          productId,
          JSON.stringify(d.attributes ?? {}),
          d.sku || null,
          d.barcode || null,
          d.price === "" ? null : Number(d.price),
          Number(d.stock) || 0,
          Number(d.min_stock) || 0,
        ],
      );
    }

    const hasVariants = drafts.length > 0 ? 1 : 0;
    if (hasVariants) {
      await db.execute(
        "UPDATE products SET has_variants = 1, stock = $1, updated_at = datetime('now','localtime') WHERE id = $2",
        [totalStock, productId],
      );
    } else {
      await db.execute("UPDATE products SET has_variants = 0 WHERE id = $1", [productId]);
    }
  });
}

/** Descuenta stock de una variante y reajusta el stock total del producto. */
export async function decrementVariantStock(
  variantId: number,
  productId: number,
  qty: number,
): Promise<void> {
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await db.execute("UPDATE product_variants SET stock = stock - $1 WHERE id = $2", [
      qty,
      variantId,
    ]);
    await db.execute("UPDATE products SET stock = stock - $1 WHERE id = $2", [qty, productId]);
  });
}

/** Elimina una variante y recalcula stock / flag has_variants del producto. */
export async function deleteProductVariant(
  productId: number,
  variantId: number,
): Promise<void> {
  const all = await listVariants(productId);
  const remaining: VariantDraft[] = all
    .filter((v) => v.id !== variantId)
    .map((v) => ({
      id: v.id,
      attributes: v.attributes,
      sku: v.sku ?? "",
      barcode: v.barcode ?? "",
      price: v.price ?? "",
      stock: v.stock,
      min_stock: v.min_stock,
    }));
  await saveProductVariants(productId, remaining);
}
