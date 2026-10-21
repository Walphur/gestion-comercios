import { getDb } from "./index";
import { removeProductPhotoFile, saveProductPhotoFile } from "../lib/productImages";

/** La principal (products.image_path) más tres extra. */
export const MAX_PRODUCT_PHOTOS = 4;

/** Foto en el formulario: guardada (`file`) o elegida y sin guardar (`sourcePath`). */
export interface GallerySlot {
  key: string;
  file: string | null;
  sourcePath: string | null;
  previewUrl: string | null;
}

export async function listProductPhotoFiles(productId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ file_name: string }[]>(
    `SELECT file_name FROM product_photos WHERE product_id = $1 ORDER BY position, id`,
    [productId],
  );
  return rows.map((r) => r.file_name);
}

/** Fotos extra de varios productos, en orden. */
export async function listExtraPhotosByProduct(productIds: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (productIds.length === 0) return out;
  const db = await getDb();
  const rows = await db.select<{ product_id: number; file_name: string }[]>(
    `SELECT product_id, file_name FROM product_photos
     WHERE product_id IN (SELECT value FROM json_each($1))
     ORDER BY product_id, position, id`,
    [JSON.stringify(productIds)],
  );
  for (const r of rows) {
    const list = out.get(r.product_id) ?? [];
    list.push(r.file_name);
    out.set(r.product_id, list);
  }
  return out;
}

export async function copyProductPhotos(fromId: number, toId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO product_photos (product_id, file_name, position)
     SELECT $1, file_name, position FROM product_photos WHERE product_id = $2`,
    [toId, fromId],
  );
}

async function fileInUse(fileName: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT (SELECT COUNT(*) FROM products WHERE image_path = $1)
          + (SELECT COUNT(*) FROM product_photos WHERE file_name = $1) AS n`,
    [fileName],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/**
 * Guarda la galería: la primera queda como principal (image_path) y el resto en product_photos.
 * Borra del disco las fotos sacadas que ningún otro producto usa (un duplicado comparte archivos).
 */
export async function saveProductGallery(
  productId: number,
  slots: GallerySlot[],
  previousFiles: string[],
): Promise<string | null> {
  const files: string[] = [];
  for (const s of slots.slice(0, MAX_PRODUCT_PHOTOS)) {
    if (s.file) files.push(s.file);
    else if (s.sourcePath) files.push(await saveProductPhotoFile(productId, s.sourcePath));
  }
  const main = files[0] ?? null;
  const db = await getDb();
  await db.execute(`UPDATE products SET image_path = $1 WHERE id = $2`, [main, productId]);
  await db.execute(`DELETE FROM product_photos WHERE product_id = $1`, [productId]);
  for (let i = 1; i < files.length; i++) {
    await db.execute(
      `INSERT INTO product_photos (product_id, file_name, position) VALUES ($1, $2, $3)`,
      [productId, files[i], i],
    );
  }
  for (const f of previousFiles) {
    if (files.includes(f) || (await fileInUse(f))) continue;
    await removeProductPhotoFile(f).catch(() => undefined);
  }
  return main;
}
