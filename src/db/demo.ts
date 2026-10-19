import { ensureBrand } from "./brands";
import { createCategory } from "./categories";
import { getDb } from "./index";
import { createProduct } from "./products";
import { ensureSupplier } from "./suppliers";
import { removeDemoCatalogProducts } from "../lib/tauri";
import { withRustDb } from "../lib/rustDb";

interface DemoProduct {
  barcode: string;
  name: string;
  category: string;
  brand: string;
  supplier: string;
  cost: number;
  price: number;
  stock: number;
  min_stock: number;
}

const DEMO_PRODUCTS: DemoProduct[] = [
  { barcode: "7790895000011", name: "Coca-Cola 500 ml", category: "Bebidas", brand: "Coca-Cola", supplier: "Refrescos del Sur", cost: 900, price: 1800, stock: 48, min_stock: 12 },
  { barcode: "7790895000028", name: "Coca-Cola 1.5 L", category: "Bebidas", brand: "Coca-Cola", supplier: "Refrescos del Sur", cost: 2200, price: 3800, stock: 24, min_stock: 6 },
  { barcode: "7798065000015", name: "Agua Villavicencio 2 L", category: "Bebidas", brand: "Villavicencio", supplier: "Refrescos del Sur", cost: 1100, price: 2200, stock: 36, min_stock: 10 },
  { barcode: "7799312000010", name: "Cerveza Quilmes 1 L", category: "Bebidas", brand: "Quilmes", supplier: "Distribuidora Norte", cost: 2100, price: 3500, stock: 18, min_stock: 6 },
  { barcode: "7790315980012", name: "Alfajor Havanna", category: "Golosinas", brand: "Havanna", supplier: "Mayorista Centro", cost: 1400, price: 2500, stock: 22, min_stock: 8 },
  { barcode: "7790315980029", name: "Chicles Beldent 10 u.", category: "Golosinas", brand: "Mondelez", supplier: "Mayorista Centro", cost: 400, price: 800, stock: 30, min_stock: 8 },
  { barcode: "7790733001024", name: "Papas fritas Lay's 85 g", category: "Golosinas", brand: "Lay's", supplier: "Mayorista Centro", cost: 1800, price: 3200, stock: 14, min_stock: 6 },
  { barcode: "7790748000010", name: "Chocolate con leche 100 g", category: "Golosinas", brand: "Arcor", supplier: "Mayorista Centro", cost: 1200, price: 2200, stock: 28, min_stock: 8 },
  { barcode: "7798154000011", name: "Leche entera 1 L", category: "Lácteos", brand: "La Serenísima", supplier: "Distribuidora Norte", cost: 1400, price: 2400, stock: 30, min_stock: 10 },
  { barcode: "7798154000028", name: "Yogur bebible frutilla", category: "Lácteos", brand: "La Serenísima", supplier: "Distribuidora Norte", cost: 700, price: 1300, stock: 20, min_stock: 6 },
  { barcode: "7798154000035", name: "Queso cremoso 290 g", category: "Lácteos", brand: "La Serenísima", supplier: "Distribuidora Norte", cost: 3200, price: 5200, stock: 8, min_stock: 3 },
  { barcode: "7791132000015", name: "Detergente líquido 750 ml", category: "Limpieza", brand: "Ala", supplier: "Distribuidora Norte", cost: 1800, price: 3200, stock: 15, min_stock: 4 },
  { barcode: "7791132000022", name: "Lavandina 1 L", category: "Limpieza", brand: "Ayudín", supplier: "Distribuidora Norte", cost: 900, price: 1600, stock: 20, min_stock: 5 },
  { barcode: "7791132000039", name: "Esponja multiuso x3", category: "Limpieza", brand: "Virulana", supplier: "Mayorista Centro", cost: 700, price: 1200, stock: 25, min_stock: 6 },
  { barcode: "7790741000010", name: "Jamón cocido 200 g", category: "Fiambres", brand: "Paladini", supplier: "Distribuidora Norte", cost: 2200, price: 3500, stock: 12, min_stock: 4 },
  { barcode: "7790741000027", name: "Salchichas 6 u.", category: "Fiambres", brand: "Paladini", supplier: "Distribuidora Norte", cost: 1400, price: 2400, stock: 14, min_stock: 4 },
  { barcode: "7790741000034", name: "Pan lactal 390 g", category: "Panadería", brand: "Bimbo", supplier: "Mayorista Centro", cost: 1800, price: 3200, stock: 10, min_stock: 3 },
  { barcode: "7790315000018", name: "Arroz largo fino 1 kg", category: "Almacén", brand: "Gallo", supplier: "Mayorista Centro", cost: 1600, price: 2800, stock: 28, min_stock: 8 },
  { barcode: "7790315000025", name: "Yerba mate 500 g", category: "Almacén", brand: "Taragüi", supplier: "Mayorista Centro", cost: 3200, price: 5200, stock: 9, min_stock: 4 },
  { barcode: "7799001000012", name: "Red Bull 250 ml", category: "Bebidas", brand: "Red Bull", supplier: "Refrescos del Sur", cost: 2400, price: 4200, stock: 5, min_stock: 8 },
  { barcode: "7790001999999", name: "Chicles Beldent (stock bajo)", category: "Golosinas", brand: "Mondelez", supplier: "Mayorista Centro", cost: 400, price: 800, stock: 4, min_stock: 8 },
];

/** Códigos de barras del catálogo de demostración (para borrado selectivo). */
export const DEMO_BARCODES = DEMO_PRODUCTS.map((p) => p.barcode);

interface DemoSalonItem {
  name: string;
  category: string;
  price: number;
  cost?: number;
  stock?: number;
  min_stock?: number;
  /** Minutos del turno: si está, es un servicio. */
  duration_min?: number;
}

const DEMO_SALON: DemoSalonItem[] = [
  { name: "Corte de pelo", category: "Servicios", price: 8000, duration_min: 30 },
  { name: "Corte y barba", category: "Servicios", price: 11000, duration_min: 45 },
  { name: "Arreglo de barba", category: "Servicios", price: 5000, duration_min: 20 },
  { name: "Corte niño", category: "Servicios", price: 6500, duration_min: 30 },
  { name: "Lavado y peinado", category: "Servicios", price: 7000, duration_min: 30 },
  { name: "Coloración", category: "Servicios", price: 25000, duration_min: 90 },
  { name: "Cera para peinar 100 g", category: "Productos", price: 7000, cost: 3500, stock: 12, min_stock: 4 },
  { name: "Shampoo 400 ml", category: "Productos", price: 8000, cost: 4000, stock: 10, min_stock: 3 },
  { name: "Aceite para barba 30 ml", category: "Productos", price: 9000, cost: 4500, stock: 8, min_stock: 3 },
];

/** Clínica y taller no tienen ejemplos: los de almacén no les sirven. */
export function rubroHasDemoCatalog(rubro: string): boolean {
  return rubro !== "clinica" && rubro !== "taller";
}

async function seedSalonDemo(): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const item of DEMO_SALON) {
    const exists = await (await getDb()).select<{ id: number }[]>(
      "SELECT id FROM products WHERE name = $1 COLLATE NOCASE AND active = 1",
      [item.name],
    );
    if (exists.length) {
      skipped++;
      continue;
    }
    const service = item.duration_min != null;
    const productId = await createProduct({
      name: item.name,
      category_id: await categoryId(item.category),
      cost: item.cost ?? 0,
      price: item.price,
      stock: service ? 0 : (item.stock ?? 0),
      min_stock: service ? 0 : (item.min_stock ?? 0),
      unit: service ? "servicio" : "unidad",
      tax_rate: 21,
      track_stock: !service,
      product_kind: service ? "prepared" : "standard",
      prepare_mode: service ? "on_demand" : null,
      duration_min: item.duration_min ?? null,
    });
    await (await getDb()).execute("UPDATE products SET catalog_source = 'demo' WHERE id = $1", [
      productId,
    ]);
    added++;
  }
  return { added, skipped };
}

async function categoryId(name: string): Promise<number> {
  await createCategory(name);
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>("SELECT id FROM categories WHERE name = $1", [
    name,
  ]);
  return rows[0].id;
}

/** Carga catálogo de ejemplo (idempotente por código de barras o nombre). */
export async function seedDemoCatalog(rubro?: string): Promise<{ added: number; skipped: number }> {
  if (rubro === "estetica") return seedSalonDemo();
  let added = 0;
  let skipped = 0;

  for (const p of DEMO_PRODUCTS) {
    const exists = await (await getDb()).select<{ id: number }[]>(
      "SELECT id FROM products WHERE barcode = $1 AND active = 1",
      [p.barcode],
    );
    if (exists.length) {
      skipped++;
      continue;
    }

    const catId = await categoryId(p.category);
    const brandId = await ensureBrand(p.brand);
    const supplierId = await ensureSupplier(p.supplier);

    const productId = await createProduct({
      barcode: p.barcode,
      name: p.name,
      category_id: catId,
      brand_id: brandId,
      supplier_id: supplierId,
      cost: p.cost,
      price: p.price,
      stock: p.stock,
      min_stock: p.min_stock,
      unit: "unidad",
      tax_rate: 21,
    });

    // createProduct cierra la conexión JS al sincronizar el FTS en Rust.
    const db = await getDb();
    await db.execute(
      `INSERT OR IGNORE INTO product_barcodes (product_id, barcode, label, quantity_factor, is_primary)
       VALUES ($1,$2,'Principal',1,1)`,
      [productId, p.barcode],
    );
    await db.execute("UPDATE products SET catalog_source = 'demo' WHERE id = $1", [productId]);
    added++;
  }

  return { added, skipped };
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
