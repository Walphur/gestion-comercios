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
  { barcode: "7790895000011", name: "Coca-Cola 500 ml", category: "Bebidas", brand: "Coca-Cola", supplier: "Refrescos del Sur", cost: 450, price: 800, stock: 48, min_stock: 12 },
  { barcode: "7790895000028", name: "Coca-Cola 1.5 L", category: "Bebidas", brand: "Coca-Cola", supplier: "Refrescos del Sur", cost: 900, price: 1500, stock: 24, min_stock: 6 },
  { barcode: "7798065000015", name: "Agua mineral 500 ml", category: "Bebidas", brand: "Villavicencio", supplier: "Refrescos del Sur", cost: 200, price: 400, stock: 60, min_stock: 15 },
  { barcode: "7799312000010", name: "Cerveza Quilmes 1 L", category: "Bebidas", brand: "Quilmes", supplier: "Distribuidora Norte", cost: 1100, price: 1800, stock: 18, min_stock: 6 },
  { barcode: "7790315980012", name: "Alfajor triple chocolate", category: "Golosinas", brand: "Arcor", supplier: "Mayorista Centro", cost: 350, price: 650, stock: 40, min_stock: 10 },
  { barcode: "7790315980029", name: "Chicles Beldent 10 u.", category: "Golosinas", brand: "Mondelez", supplier: "Mayorista Centro", cost: 180, price: 350, stock: 30, min_stock: 8 },
  { barcode: "7790733001024", name: "Papas fritas clásicas 85 g", category: "Golosinas", brand: "Lay's", supplier: "Mayorista Centro", cost: 520, price: 900, stock: 22, min_stock: 6 },
  { barcode: "7790748000010", name: "Chocolate con leche 100 g", category: "Golosinas", brand: "Arcor", supplier: "Mayorista Centro", cost: 480, price: 850, stock: 28, min_stock: 8 },
  { barcode: "7798154000011", name: "Leche entera 1 L", category: "Lácteos", brand: "La Serenísima", supplier: "Distribuidora Norte", cost: 650, price: 950, stock: 36, min_stock: 10 },
  { barcode: "7798154000028", name: "Yogur bebible frutilla", category: "Lácteos", brand: "La Serenísima", supplier: "Distribuidora Norte", cost: 320, price: 550, stock: 20, min_stock: 6 },
  { barcode: "7798154000035", name: "Queso cremoso 290 g", category: "Lácteos", brand: "La Serenísima", supplier: "Distribuidora Norte", cost: 1800, price: 2800, stock: 8, min_stock: 3 },
  { barcode: "7791132000015", name: "Detergente líquido 750 ml", category: "Limpieza", brand: "Ala", supplier: "Distribuidora Norte", cost: 890, price: 1400, stock: 15, min_stock: 4 },
  { barcode: "7791132000022", name: "Lavandina 1 L", category: "Limpieza", brand: "Ayudín", supplier: "Distribuidora Norte", cost: 420, price: 750, stock: 20, min_stock: 5 },
  { barcode: "7791132000039", name: "Esponja multiuso x3", category: "Limpieza", brand: "Virulana", supplier: "Mayorista Centro", cost: 380, price: 650, stock: 25, min_stock: 6 },
  { barcode: "7790741000010", name: "Jamón cocido 200 g", category: "Fiambres", brand: "Paladini", supplier: "Distribuidora Norte", cost: 1100, price: 1650, stock: 12, min_stock: 4 },
  { barcode: "7790741000027", name: "Salchichas 6 u.", category: "Fiambres", brand: "Paladini", supplier: "Distribuidora Norte", cost: 750, price: 1200, stock: 14, min_stock: 4 },
  { barcode: "7790741000034", name: "Pan lactal 390 g", category: "Panadería", brand: "Bimbo", supplier: "Mayorista Centro", cost: 680, price: 1100, stock: 10, min_stock: 3 },
  { barcode: "7790315000018", name: "Arroz largo fino 1 kg", category: "Almacén", brand: "Gallo", supplier: "Mayorista Centro", cost: 720, price: 1100, stock: 30, min_stock: 8 },
  { barcode: "7790315000025", name: "Yerba mate 500 g", category: "Almacén", brand: "Taragüi", supplier: "Mayorista Centro", cost: 1400, price: 2200, stock: 16, min_stock: 4 },
  { barcode: "7790001999999", name: "Producto stock bajo (demo)", category: "Almacén", brand: "Genérico", supplier: "Mayorista Centro", cost: 100, price: 250, stock: 2, min_stock: 10 },
];

/** Códigos de barras del catálogo de demostración (para borrado selectivo). */
export const DEMO_BARCODES = DEMO_PRODUCTS.map((p) => p.barcode);

async function categoryId(name: string): Promise<number> {
  await createCategory(name);
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>("SELECT id FROM categories WHERE name = $1", [
    name,
  ]);
  return rows[0].id;
}

/** Carga catálogo de ejemplo (idempotente por código de barras). */
export async function seedDemoCatalog(): Promise<{ added: number; skipped: number }> {
  const db = await getDb();
  let added = 0;
  let skipped = 0;

  for (const p of DEMO_PRODUCTS) {
    const exists = await db.select<{ id: number }[]>(
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
  if (DEMO_BARCODES.length === 0) return 0;
  const placeholders = DEMO_BARCODES.map((_, i) => `$${i + 1}`).join(",");
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM products WHERE active = 1 AND barcode IN (${placeholders})`,
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
