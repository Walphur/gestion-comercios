import { getDb } from "./index";
import { resolveProductImageDataUrl } from "../lib/productImages";

export interface MenuPortalProduct {
  id: number;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  is_daily_menu: boolean;
  /** Miniatura comprimida para la carta pública (opcional). */
  image_data_url?: string | null;
}

export function menuSlugify(raw: string): string {
  const base = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "carta";
}

/** Presupuesto total de data URLs de fotos en el snapshot (logo aparte). */
const MAX_PRODUCT_IMAGES_CHARS = 900_000;
/** Tope por foto (worker sanitize). */
const MAX_SINGLE_IMAGE_CHARS = 28_000;

/** Productos activos marcados para carta pública (sin stock sensible). */
export async function buildMenuPortalProducts(): Promise<MenuPortalProduct[]> {
  const db = await getDb();
  const rows = await db.select<
    {
      id: number;
      name: string;
      price: number;
      description: string | null;
      is_daily_menu: number;
      category_name: string | null;
      image_path: string | null;
    }[]
  >(
    `SELECT p.id, p.name, p.price, p.description, p.is_daily_menu,
            p.image_path,
            c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.active = 1 AND COALESCE(p.show_on_menu, 1) = 1
     ORDER BY
       CASE WHEN p.is_daily_menu = 1 THEN 0 ELSE 1 END,
       CASE WHEN c.name IS NULL OR TRIM(c.name) = '' THEN 1 ELSE 0 END,
       LOWER(COALESCE(c.name, '')),
       LOWER(p.name)
     LIMIT 400`,
  );

  const products: MenuPortalProduct[] = rows.map((r) => ({
    id: r.id,
    name: r.name.trim(),
    price: Number(r.price) || 0,
    category: r.category_name?.trim() || null,
    description: r.description?.trim() || null,
    is_daily_menu: r.is_daily_menu === 1,
    image_data_url: null,
  }));

  let budget = MAX_PRODUCT_IMAGES_CHARS;
  for (let i = 0; i < products.length; i++) {
    const path = rows[i]?.image_path;
    if (!path?.trim() || budget < 4_000) continue;
    const maxForThis = Math.min(MAX_SINGLE_IMAGE_CHARS, budget);
    const dataUrl = await resolveProductImageDataUrl(path, maxForThis);
    if (!dataUrl) continue;
    products[i].image_data_url = dataUrl;
    budget -= dataUrl.length;
  }

  return products;
}
