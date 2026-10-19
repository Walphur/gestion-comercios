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
  /** Hay stock o no lleva control de stock. Nunca se publica la cantidad. */
  available: boolean;
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

function photoShare(count: number, budget: number): number {
  if (count <= 0) return PHOTO_CAP_CHARS;
  return Math.min(PHOTO_CAP_CHARS, Math.max(6_000, Math.floor(budget / count)));
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

/** Sin control de stock, combos y preparados se venden siempre; si no, stock propio o de alguna variante. */
const AVAILABLE_SQL = `CASE
       WHEN COALESCE(p.track_stock, 1) = 0 THEN 1
       WHEN COALESCE(p.is_kit, 0) = 1 THEN 1
       WHEN COALESCE(p.product_kind, 'standard') IN ('prepared', 'kit') THEN 1
       WHEN COALESCE(p.has_variants, 0) = 1
         AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.stock > 0) THEN 1
       WHEN p.stock > 0 THEN 1
       ELSE 0
     END`;

/** Productos activos marcados para carta pública (solo disponible / sin stock, nunca la cantidad). */
export async function buildMenuPortalProducts(
  opts: { hideOutOfStock?: boolean; photoBudget?: number } = {},
): Promise<MenuPortalProduct[]> {
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
      available: number;
    }[]
  >(
    `SELECT p.id, p.name, p.price, p.description, p.is_daily_menu,
            COALESCE(p.is_kit, 0) AS is_kit,
            p.image_path,
            c.name AS category_name,
            ${AVAILABLE_SQL} AS available
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.active = 1 AND COALESCE(p.show_on_menu, 1) = 1
       AND COALESCE(p.product_kind, 'standard') <> 'ingredient'
       ${opts.hideOutOfStock ? `AND ${AVAILABLE_SQL} = 1` : ""}
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
      available: r.available === 1,
    };
  });

  const totalBudget = Math.max(0, Math.min(PHOTO_BUDGET_CHARS, opts.photoBudget ?? PHOTO_BUDGET_CHARS));
  const photoCount = rows.filter((r) => r.image_path?.trim()).length;
  const share = photoShare(photoCount, totalBudget);

  let budget = totalBudget;
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
