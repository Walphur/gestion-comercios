import type { ProductVariant, VariantDraft } from "../types";
import { getDb } from "./index";

interface VariantRow {
  id: number;
  product_id: number;
  attributes: string | null;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  stock: number;
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
  };
}

export async function listVariants(productId: number): Promise<ProductVariant[]> {
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
  const { withImmediateTransaction } = await import("./tx");
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await db.execute("DELETE FROM product_variants WHERE product_id = $1", [productId]);

    let totalStock = 0;
    for (const d of drafts) {
      totalStock += Number(d.stock) || 0;
      await db.execute(
        `INSERT INTO product_variants (product_id, attributes, sku, barcode, price, stock)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          productId,
          JSON.stringify(d.attributes ?? {}),
          d.sku || null,
          d.barcode || null,
          d.price === "" ? null : Number(d.price),
          Number(d.stock) || 0,
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
  const { withImmediateTransaction } = await import("./tx");
  await withImmediateTransaction(async () => {
    const db = await getDb();
    await db.execute("UPDATE product_variants SET stock = stock - $1 WHERE id = $2", [
      qty,
      variantId,
    ]);
    await db.execute("UPDATE products SET stock = stock - $1 WHERE id = $2", [qty, productId]);
  });
}
