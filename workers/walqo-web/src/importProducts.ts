/**
 * Guarda los productos de una planilla con las reglas de flush_batch en
 * src-tauri/src/import_products.rs. El navegador lee el archivo (src/lib/productImport.ts)
 * y manda las filas de a tandas; cada tanda es una transacción, como en la PC.
 */
import { getDb } from "../../../src/db/index";
import { withImmediateTransaction } from "../../../src/db/tx";
import { permanentMaxProducts } from "../../../src/config/planEntitlements";
import { freePlanLimits } from "../../../src/config/pricing";
import type { ImportRow } from "../../../src/lib/productImport";
import { currentLicenseStatus, type LicenseStatus } from "./license";

export interface ImportBatchResult {
  inserted: number;
  updated: number;
  skipped: number;
  notes: string[];
}

interface PlanLimit {
  max: number;
  label: string;
  planName: string;
  count: number;
}

/** Misma regla que is_permanent_plan en license.rs. */
function isPermanentPlan(status: LicenseStatus): boolean {
  if (!status.active || status.is_trial || status.billing === "trial" || status.plan === "trial") return false;
  if (status.plan === "free" || status.billing === "free") return false;
  if (status.billing === "perpetual") return true;
  if (status.billing === "monthly") return false;
  return status.plan === "basic" && !status.pro_enabled;
}

const thousands = (n: number) => n.toLocaleString("es-AR");

async function freePlanProductCount(): Promise<number> {
  const db = await getDb();
  const [row] = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM products WHERE active = 1 AND COALESCE(catalog_source, '') <> 'demo'",
  );
  return Number(row?.n ?? 0);
}

async function planLimit(): Promise<PlanLimit | null> {
  const status = currentLicenseStatus();
  const permanentMax = status.plan !== "free" && isPermanentPlan(status) ? permanentMaxProducts(status.max_products) : null;
  if (status.plan !== "free" && permanentMax == null) return null;
  const count = await freePlanProductCount();
  if (permanentMax != null) {
    return { max: permanentMax, label: "productos", planName: "La licencia Permanente", count };
  }
  const db = await getDb();
  const [rubro] = await db.select<{ value: string | null }[]>("SELECT value FROM settings WHERE key = 'rubro'");
  const limits = freePlanLimits(rubro?.value ?? null);
  return { max: limits.maxProducts, label: limits.itemsLabel, planName: "El plan gratis", count };
}

async function lookupOrCreate(table: "categories" | "brands" | "suppliers", name: string): Promise<number> {
  const db = await getDb();
  await db.execute(`INSERT OR IGNORE INTO ${table} (name) VALUES (?1)`, [name]);
  const [row] = await db.select<{ id: number }[]>(`SELECT id FROM ${table} WHERE name = ?1`, [name]);
  return row.id;
}

async function findExistingId(barcode: string | null, sku: string | null): Promise<number | null> {
  const db = await getDb();
  if (barcode) {
    // Primero el activo; si no, el desactivado, para reactivarlo al reimportar.
    const [row] = await db.select<{ id: number }[]>(
      `SELECT p.id FROM products p
       LEFT JOIN product_barcodes pb ON pb.product_id = p.id
       WHERE pb.barcode = ?1 OR p.barcode = ?1
       ORDER BY p.active DESC, p.id DESC LIMIT 1`,
      [barcode],
    );
    if (row) return row.id;
  }
  if (sku) {
    const [row] = await db.select<{ id: number }[]>(
      "SELECT id FROM products WHERE sku = ?1 ORDER BY active DESC, id DESC LIMIT 1",
      [sku],
    );
    if (row) return row.id;
  }
  return null;
}

async function syncFts(ids: number[]) {
  const db = await getDb();
  for (const id of ids) {
    await db.execute("DELETE FROM products_fts WHERE rowid = ?1", [id]);
    await db.execute(
      `INSERT INTO products_fts(rowid, name, barcode, sku)
       SELECT id, name, COALESCE(barcode, ''), COALESCE(sku, '') FROM products WHERE id = ?1 AND active = 1`,
      [id],
    );
  }
}

export async function importProductBatch(
  rows: ImportRow[],
  opts: { updateExisting: boolean; catalogSource: string | null; first: boolean },
): Promise<ImportBatchResult> {
  const result: ImportBatchResult = { inserted: 0, updated: 0, skipped: 0, notes: [] };
  return withImmediateTransaction(async () => {
    const db = await getDb();
    const limit = await planLimit();
    if (limit && opts.first && limit.count >= limit.max) {
      result.notes.push(
        `${limit.planName} ya alcanzó el límite de ${thousands(limit.max)} ${limit.label} y no se pueden agregar más nuevos.`,
      );
    }
    const touched: number[] = [];

    for (const row of rows) {
      const catId = row.category ? await lookupOrCreate("categories", row.category) : null;
      const brandId = row.brand ? await lookupOrCreate("brands", row.brand) : null;
      const supplierId = row.supplier ? await lookupOrCreate("suppliers", row.supplier) : null;

      const existing = await findExistingId(row.barcode, row.sku);
      if (existing != null) {
        if (!opts.updateExisting) {
          result.skipped += 1;
          continue;
        }
        // El stock no se pisa: las listas de precios suelen traer celdas no numéricas.
        await db.execute(
          `UPDATE products SET name=?1, description=?2, cost=?3, price=?4,
           min_stock=?5, category_id=COALESCE(?6, category_id), brand_id=COALESCE(?7, brand_id),
           supplier_id=COALESCE(?8, supplier_id), unit=?9, tax_rate=?10,
           sku=COALESCE(?11, sku), barcode=COALESCE(?12, barcode),
           catalog_source=COALESCE(?13, catalog_source),
           active=1, updated_at=datetime('now','localtime')
           WHERE id=?14`,
          [
            row.name, row.description, row.cost, row.price, row.min_stock, catId, brandId, supplierId,
            row.unit, row.tax_rate, row.sku, row.barcode, opts.catalogSource, existing,
          ],
        );
        touched.push(existing);
        result.updated += 1;
        continue;
      }

      if (limit && limit.count >= limit.max) {
        const note = `${limit.planName} solo permite ${thousands(limit.max)} ${limit.label}. Los adicionales no se importaron.`;
        if (!result.notes.includes(note)) result.notes.push(note);
        result.skipped += 1;
        continue;
      }

      const inserted = await db.execute(
        `INSERT INTO products (sku, barcode, name, description, category_id, brand_id, supplier_id,
         cost, price, stock, min_stock, unit, tax_rate, catalog_source, sync_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14, lower(hex(randomblob(16))))`,
        [
          row.sku, row.barcode, row.name, row.description, catId, brandId, supplierId,
          row.cost, row.price, row.stock, row.min_stock, row.unit, row.tax_rate, opts.catalogSource,
        ],
      );
      const pid = Number(inserted.lastInsertId);
      if (Math.abs(row.stock) > 1e-9) {
        await db.execute(
          `INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, sync_id)
           VALUES (?1, 'adjustment', ?2, 'product_import', ?1, lower(hex(randomblob(16))))`,
          [pid, row.stock],
        );
      }
      if (row.barcode) {
        await db.execute(
          `INSERT OR IGNORE INTO product_barcodes (product_id, barcode, label, quantity_factor, is_primary)
           VALUES (?1,?2,'Principal',1,1)`,
          [pid, row.barcode],
        );
      }
      touched.push(pid);
      result.inserted += 1;
      if (limit) limit.count += 1;
    }

    await syncFts(touched);
    return result;
  });
}
