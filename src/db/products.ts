import type { Product, ProductInput } from "../types";
import { getDb } from "./index";
import { findProductByBarcode } from "./stock";

export interface ProductFilter {
  search?: string;
  categoryId?: number | null;
  brandId?: number | null;
  supplierId?: number | null;
  onlyLowStock?: boolean;
}

const PRODUCT_SELECT = `
  SELECT p.*,
         c.name AS category_name,
         b.name AS brand_name,
         s.name AS supplier_name
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN suppliers s ON s.id = p.supplier_id
`;

const MIN_FTS_LEN = 2;
const SEARCH_LIMIT = 200;

function buildFtsMatch(term: string): string | null {
  const tokens = term
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/["*]/g, "").trim())
    .filter((t) => t.length >= MIN_FTS_LEN);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}*`).join(" ");
}

async function productIdsFromFts(term: string): Promise<number[]> {
  const match = buildFtsMatch(term);
  if (!match) return [];
  const db = await getDb();
  try {
    const rows = await db.select<{ product_id: number }[]>(
      `SELECT rowid AS product_id FROM products_fts WHERE products_fts MATCH $1 LIMIT ${SEARCH_LIMIT}`,
      [match],
    );
    return rows.map((r) => r.product_id);
  } catch {
    return [];
  }
}

export async function listProducts(filter: ProductFilter = {}): Promise<Product[]> {
  const db = await getDb();
  const where: string[] = ["p.active = 1"];
  const params: unknown[] = [];

  const searchTerm = filter.search?.trim() ?? "";
  if (searchTerm) {
    const ftsIds = await productIdsFromFts(searchTerm);
    if (ftsIds.length > 0) {
      const placeholders = ftsIds.map((_, i) => `$${i + 1}`).join(",");
      where.push(`p.id IN (${placeholders})`);
      params.push(...ftsIds);
    } else if (searchTerm.length >= MIN_FTS_LEN) {
      params.push(`%${searchTerm}%`);
      const p = `$${params.length}`;
      where.push(
        `(p.barcode = ${p} OR p.sku = ${p}
          OR p.id IN (SELECT product_id FROM product_barcodes WHERE barcode = ${p}))`,
      );
    } else {
      return [];
    }
  }
  if (filter.categoryId != null && filter.categoryId > 0) {
    params.push(filter.categoryId);
    where.push(`p.category_id = $${params.length}`);
  }
  if (filter.brandId != null && filter.brandId > 0) {
    params.push(filter.brandId);
    where.push(`p.brand_id = $${params.length}`);
  }
  if (filter.supplierId != null && filter.supplierId > 0) {
    params.push(filter.supplierId);
    where.push(`p.supplier_id = $${params.length}`);
  }
  if (filter.onlyLowStock) {
    where.push("p.min_stock > 0 AND p.stock <= p.min_stock");
  }

  const sql = `${PRODUCT_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.name LIMIT ${SEARCH_LIMIT}`;
  return db.select<Product[]>(sql, params);
}

export async function findByBarcode(code: string): Promise<Product | null> {
  const lookup = await findProductByBarcode(code);
  if (!lookup) return null;
  return getProduct(lookup.product_id);
}

export async function getBarcodeQuantityFactor(code: string): Promise<number> {
  const lookup = await findProductByBarcode(code);
  return lookup?.quantity_factor ?? 1;
}

export async function getProduct(id: number): Promise<Product | null> {
  const db = await getDb();
  const rows = await db.select<Product[]>(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
  return rows.length ? rows[0] : null;
}

export async function createProduct(input: ProductInput): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    `INSERT INTO products
       (sku, barcode, name, description, category_id, brand_id, supplier_id,
        cost, price, stock, min_stock, unit, tax_rate, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      input.sku ?? null,
      input.barcode ?? null,
      input.name,
      input.description ?? null,
      input.category_id ?? null,
      input.brand_id ?? null,
      input.supplier_id ?? null,
      input.cost,
      input.price,
      input.stock,
      input.min_stock,
      input.unit,
      input.tax_rate,
      input.expires_at ?? null,
    ],
  );
  return res.lastInsertId as number;
}

export async function updateProduct(id: number, input: ProductInput): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE products SET
       sku=$1, barcode=$2, name=$3, description=$4, category_id=$5,
       brand_id=$6, supplier_id=$7,
       cost=$8, price=$9, stock=$10, min_stock=$11, unit=$12, tax_rate=$13,
       expires_at=$14,
       updated_at=datetime('now','localtime')
     WHERE id=$15`,
    [
      input.sku ?? null,
      input.barcode ?? null,
      input.name,
      input.description ?? null,
      input.category_id ?? null,
      input.brand_id ?? null,
      input.supplier_id ?? null,
      input.cost,
      input.price,
      input.stock,
      input.min_stock,
      input.unit,
      input.tax_rate,
      input.expires_at ?? null,
      id,
    ],
  );
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE products SET active = 0 WHERE id = $1", [id]);
}

export interface BulkPriceFilter {
  categoryId?: number | null;
  brandId?: number | null;
  supplierId?: number | null;
}

function idsPlaceholders(ids: number[], startAt = 1): { clause: string; params: number[] } {
  if (ids.length === 0) return { clause: "0", params: [] };
  const clause = ids.map((_, i) => `$${startAt + i}`).join(",");
  return { clause, params: ids };
}

export async function bulkDeleteProducts(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const { clause, params } = idsPlaceholders(ids);
  const res = await db.execute(
    `UPDATE products SET active = 0, updated_at=datetime('now','localtime') WHERE id IN (${clause})`,
    params,
  );
  return res.rowsAffected ?? 0;
}

export async function bulkAdjustPricesByIds(percent: number, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const factor = 1 + percent / 100;
  const { clause, params } = idsPlaceholders(ids, 2);
  const res = await db.execute(
    `UPDATE products SET price = ROUND(price * $1, 2), updated_at=datetime('now','localtime')
     WHERE active = 1 AND id IN (${clause})`,
    [factor, ...params],
  );
  return res.rowsAffected ?? 0;
}

export async function bulkAdjustCostsByIds(percent: number, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const factor = 1 + percent / 100;
  const { clause, params } = idsPlaceholders(ids, 2);
  const res = await db.execute(
    `UPDATE products SET cost = ROUND(cost * $1, 2), updated_at=datetime('now','localtime')
     WHERE active = 1 AND id IN (${clause})`,
    [factor, ...params],
  );
  return res.rowsAffected ?? 0;
}

/** Precio de venta = costo × (1 + margen%/100) */
export async function bulkApplyMarginByIds(marginPercent: number, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const factor = 1 + marginPercent / 100;
  const { clause, params } = idsPlaceholders(ids, 2);
  const res = await db.execute(
    `UPDATE products SET price = ROUND(cost * $1, 2), updated_at=datetime('now','localtime')
     WHERE active = 1 AND cost > 0 AND id IN (${clause})`,
    [factor, ...params],
  );
  return res.rowsAffected ?? 0;
}

export async function bulkAdjustStockByIds(
  ids: number[],
  mode: "add" | "set",
  value: number,
): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const { clause, params } = idsPlaceholders(ids, 2);
  const stockExpr = mode === "set" ? "$1" : `stock + $1`;
  const res = await db.execute(
    `UPDATE products SET stock = ${stockExpr}, updated_at=datetime('now','localtime')
     WHERE active = 1 AND id IN (${clause})`,
    [value, ...params],
  );
  return res.rowsAffected ?? 0;
}

export interface BulkFieldUpdate {
  category_id?: number | null;
  brand_id?: number | null;
  supplier_id?: number | null;
  unit?: string;
}

export async function bulkUpdateProductFieldsByIds(
  ids: number[],
  fields: BulkFieldUpdate,
): Promise<number> {
  if (ids.length === 0) return 0;
  const sets: string[] = [];
  const params: unknown[] = [];

  if ("category_id" in fields) {
    params.push(fields.category_id ?? null);
    sets.push(`category_id = $${params.length}`);
  }
  if ("brand_id" in fields) {
    params.push(fields.brand_id ?? null);
    sets.push(`brand_id = $${params.length}`);
  }
  if ("supplier_id" in fields) {
    params.push(fields.supplier_id ?? null);
    sets.push(`supplier_id = $${params.length}`);
  }
  if (fields.unit != null && fields.unit.trim() !== "") {
    params.push(fields.unit.trim());
    sets.push(`unit = $${params.length}`);
  }

  if (sets.length === 0) return 0;

  sets.push(`updated_at=datetime('now','localtime')`);
  const { clause, params: idParams } = idsPlaceholders(ids, params.length + 1);
  const db = await getDb();
  const res = await db.execute(
    `UPDATE products SET ${sets.join(", ")} WHERE active = 1 AND id IN (${clause})`,
    [...params, ...idParams],
  );
  return res.rowsAffected ?? 0;
}

export async function bulkAdjustPrices(
  percent: number,
  filter: BulkPriceFilter = {},
): Promise<number> {
  const db = await getDb();
  const factor = 1 + percent / 100;
  const where = ["active = 1"];
  const params: unknown[] = [factor];

  if (filter.categoryId != null && filter.categoryId > 0) {
    params.push(filter.categoryId);
    where.push(`category_id = $${params.length}`);
  }
  if (filter.brandId != null && filter.brandId > 0) {
    params.push(filter.brandId);
    where.push(`brand_id = $${params.length}`);
  }
  if (filter.supplierId != null && filter.supplierId > 0) {
    params.push(filter.supplierId);
    where.push(`supplier_id = $${params.length}`);
  }

  const res = await db.execute(
    `UPDATE products SET price = ROUND(price * $1, 2), updated_at=datetime('now','localtime')
     WHERE ${where.join(" AND ")}`,
    params,
  );
  return res.rowsAffected ?? 0;
}

export async function decrementStock(
  items: { id: number; qty: number }[],
): Promise<void> {
  const db = await getDb();
  for (const it of items) {
    await db.execute("UPDATE products SET stock = stock - $1 WHERE id = $2", [
      it.qty,
      it.id,
    ]);
  }
}

export interface ProductStats {
  total: number;
  lowStock: number;
  stockValue: number;
}

export async function getProductStats(): Promise<ProductStats> {
  const db = await getDb();
  const rows = await db.select<
    { total: number; low_stock: number; stock_value: number }[]
  >(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN min_stock > 0 AND stock <= min_stock THEN 1 ELSE 0 END) AS low_stock,
       COALESCE(SUM(stock * cost), 0) AS stock_value
     FROM products WHERE active = 1`,
  );
  const r = rows[0];
  return {
    total: r?.total ?? 0,
    lowStock: r?.low_stock ?? 0,
    stockValue: r?.stock_value ?? 0,
  };
}
