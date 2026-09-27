import { getDb } from "./index";
import { resolveProductImageDataUrl } from "../lib/productImages";
import { listKitComponentsForProducts } from "./kits";

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

/** Presupuesto de fotos del snapshot (el worker acepta hasta ~1,2 MB). */
const PHOTO_BUDGET_CHARS = 980_000;
/** Tope por foto: el worker descarta data URLs más largas que 32 000. */
const PHOTO_CAP_CHARS = 32_000;

function photoShare(count: number): number {
  if (count <= 0) return PHOTO_CAP_CHARS;
  return Math.min(PHOTO_CAP_CHARS, Math.max(6_000, Math.floor(PHOTO_BUDGET_CHARS / count)));
}

function formatKitIncludes(
  comps: { name: string; qty: number }[],
): string | null {
  if (comps.length === 0) return null;
  return comps
    .map((c) => {
      const n = c.name.trim();
      if (!n) return "";
      return c.qty > 1 ? `${n} ×${c.qty}` : n;
    })
    .filter(Boolean)
    .join(" · ")
    .slice(0, 280);
}

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
      is_kit: number;
      category_name: string | null;
      image_path: string | null;
    }[]
  >(
    `SELECT p.id, p.name, p.price, p.description, p.is_daily_menu,
            COALESCE(p.is_kit, 0) AS is_kit,
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

  const kitIds = rows.filter((r) => r.is_kit === 1).map((r) => r.id);
  let kitsByProduct = new Map<number, { name: string; qty: number }[]>();
  try {
    kitsByProduct = await listKitComponentsForProducts(kitIds);
  } catch {
    kitsByProduct = new Map();
  }

  const products: MenuPortalProduct[] = rows.map((r) => {
    let description = r.description?.trim() || null;
    if (!description && r.is_kit === 1) {
      description = formatKitIncludes(kitsByProduct.get(r.id) ?? []);
    }
    return {
      id: r.id,
      name: r.name.trim(),
      price: Number(r.price) || 0,
      category: r.category_name?.trim() || null,
      description,
      is_daily_menu: r.is_daily_menu === 1,
      image_data_url: null,
    };
  });

  const photoCount = rows.filter((r) => r.image_path?.trim()).length;
  const share = photoShare(photoCount);

  let budget = PHOTO_BUDGET_CHARS;
  for (let i = 0; i < products.length; i++) {
    const path = rows[i]?.image_path;
    if (!path?.trim() || budget < 4_000) continue;
    const maxForThis = Math.min(share, budget);
    const dataUrl = await resolveProductImageDataUrl(path, maxForThis);
    if (!dataUrl) continue;
    products[i].image_data_url = dataUrl;
    budget -= dataUrl.length;
  }

  return products;
}
