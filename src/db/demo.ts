import { ensureBrand } from "./brands";
import { createCategory } from "./categories";
import { DEMO_BARCODES, demoCatalogFor, type DemoItem } from "./demoCatalogs";
import { getDb } from "./index";
import { createProduct } from "./products";
import { getSetting } from "./settings";
import { ensureSupplier } from "./suppliers";
import { saveProductVariants } from "./variants";
import { freePlanLimits } from "../config/pricing";
import { removeDemoCatalogProducts } from "../lib/tauri";
import { withRustDb } from "../lib/rustDb";

export { DEMO_BARCODES, demoCatalogFor };

export interface DemoSeedResult {
  added: number;
  skipped: number;
  /** No entraron porque ya hay tantos ejemplos como el tope del rubro. */
  cut: number;
}

/** Todos los rubros tienen ejemplos propios. */
export function rubroHasDemoCatalog(rubro: string): boolean {
  return demoCatalogFor(rubro).items.length > 0;
}

/** Cuántos ejemplos se cargan: nunca más que el tope del plan gratis del rubro (aunque no ocupen ese lugar). */
export function demoCatalogSize(rubro: string): number {
  return Math.min(demoCatalogFor(rubro).items.length, freePlanLimits(rubro).maxProducts);
}

async function categoryId(name: string): Promise<number> {
  await createCategory(name);
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>("SELECT id FROM categories WHERE name = $1", [
    name,
  ]);
  return rows[0].id;
}

async function demoItemExists(item: DemoItem): Promise<boolean> {
  const db = await getDb();
  const rows = item.barcode
    ? await db.select<{ id: number }[]>(
        "SELECT id FROM products WHERE barcode = $1 AND active = 1",
        [item.barcode],
      )
    : await db.select<{ id: number }[]>(
        "SELECT id FROM products WHERE name = $1 COLLATE NOCASE AND active = 1",
        [item.name],
      );
  return rows.length > 0;
}

/** Ejemplos activos a la vez: hasta el tope del plan gratis del rubro. No ocupan lugar del comercio. */
async function demoRoom(rubro: string): Promise<number> {
  const max = freePlanLimits(rubro).maxProducts;
  return Math.max(0, max - (await countDemoProductsActive()));
}

async function createDemoItem(rubro: string, item: DemoItem): Promise<void> {
  const service = item.service === true;
  const noStock = service || item.prepared === true;
  const onDemand = item.prepared === true || (service && rubro === "estetica");
  const unit = item.unit ?? (service ? (rubro === "clinica" ? "práctica" : "servicio") : "unidad");
  const productId = await createProduct({
    barcode: item.barcode ?? null,
    name: item.name,
    category_id: await categoryId(item.category),
    brand_id: item.brand ? await ensureBrand(item.brand) : null,
    supplier_id: item.supplier ? await ensureSupplier(item.supplier) : null,
    cost: item.cost ?? 0,
    price: item.price,
    stock: noStock || item.variants ? 0 : (item.stock ?? 0),
    min_stock: noStock ? 0 : (item.min_stock ?? 0),
    unit,
    tax_rate: item.tax_rate ?? 21,
    track_stock: !noStock,
    product_kind: onDemand ? "prepared" : "standard",
    prepare_mode: onDemand ? "on_demand" : null,
    duration_min: item.duration_min ?? null,
  }, { demo: true });

  // createProduct cierra la conexión JS al sincronizar el FTS en Rust.
  const db = await getDb();
  if (item.barcode) {
    await db.execute(
      `INSERT OR IGNORE INTO product_barcodes (product_id, barcode, label, quantity_factor, is_primary)
       VALUES ($1,$2,'Principal',1,1)`,
      [productId, item.barcode],
    );
  }
  if (item.variants?.length) {
    await saveProductVariants(
      productId,
      item.variants.map((v) => ({
        attributes: v.attributes,
        sku: "",
        barcode: "",
        price: "",
        stock: v.stock,
        min_stock: 1,
      })),
    );
  }
}

/** Carga los ejemplos del rubro (idempotente por código de barras o nombre). */
export async function seedDemoCatalog(rubro?: string): Promise<DemoSeedResult> {
  const rubroId = rubro ?? ((await getSetting("rubro").catch(() => null)) || "general");
  const catalog = demoCatalogFor(rubroId);
  const room = await demoRoom(rubroId);
  const result: DemoSeedResult = { added: 0, skipped: 0, cut: 0 };
  for (const item of catalog.items) {
    if (await demoItemExists(item)) {
      result.skipped++;
    } else if (result.added >= room) {
      result.cut++;
    } else {
      await createDemoItem(rubroId, item);
      result.added++;
    }
  }
  return result;
}

/** Desactiva productos de ejemplo (cierra conexión JS; no usa el flujo del catálogo masivo). */
export async function removeDemoCatalog(): Promise<number> {
  return withRustDb(() => removeDemoCatalogProducts());
}

export async function countDemoProductsActive(): Promise<number> {
  const db = await getDb();
  const placeholders = DEMO_BARCODES.map((_, i) => `$${i + 1}`).join(",");
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM products
     WHERE active = 1 AND (catalog_source = 'demo' OR barcode IN (${placeholders}))`,
    DEMO_BARCODES,
  );
  return rows[0]?.c ?? 0;
}

export async function countActiveProducts(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM products WHERE active = 1",
  );
  return rows[0]?.c ?? 0;
}
