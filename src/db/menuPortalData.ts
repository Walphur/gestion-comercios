import { getDb } from "./index";
import { resolveProductImageDataUrl } from "../lib/productImages";
import { listKitComponentsForProducts } from "./kits";
import { listExtraPhotosByProduct } from "./productPhotos";

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
  /** Archivos locales de la galería (principal primero); se cambian por hashes antes de subir. */
  photo_files?: string[];
  /** Hashes de las fotos ya subidas a la galería de la tienda. */
  photos?: string[];
  price_usd?: number;
  /** Celulares: equipos en stock, sin IMEI ni cantidad. */
  units?: MenuPortalUnit[];
}

export interface MenuPortalUnit {
  capacity?: string;
  color?: string;
  condition: "nuevo" | "usado" | "reacondicionado";
  battery?: number;
}

/** Equipos en stock agrupados por capacidad, color, estado y batería (no se publica cuántos hay). */
async function listMenuUnits(productIds: number[]): Promise<Map<number, MenuPortalUnit[]>> {
  const out = new Map<number, MenuPortalUnit[]>();
  if (productIds.length === 0) return out;
  const db = await getDb();
  const rows = await db.select<
    { product_id: number; capacity: string | null; color: string | null; condition: string; battery_pct: number | null }[]
  >(
    `SELECT DISTINCT product_id, TRIM(COALESCE(capacity, '')) AS capacity, TRIM(COALESCE(color, '')) AS color,
            condition, CASE WHEN condition = 'nuevo' THEN NULL ELSE battery_pct END AS battery_pct
     FROM product_units
     WHERE status = 'in_stock' AND product_id IN (SELECT value FROM json_each($1))
     ORDER BY product_id, CASE condition WHEN 'nuevo' THEN 0 WHEN 'reacondicionado' THEN 1 ELSE 2 END,
              capacity, color, battery_pct DESC`,
    [JSON.stringify(productIds)],
  );
  for (const r of rows) {
    const list = out.get(r.product_id) ?? [];
    if (list.length >= 12) continue;
    const condition = r.condition === "usado" || r.condition === "reacondicionado" ? r.condition : "nuevo";
    list.push({
      condition,
      ...(r.capacity ? { capacity: r.capacity } : {}),
      ...(r.color ? { color: r.color } : {}),
      ...(r.battery_pct && r.battery_pct > 0 ? { battery: r.battery_pct } : {}),
    });
    out.set(r.product_id, list);
  }
  return out;
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
  opts: { hideOutOfStock?: boolean; photoBudget?: number; extraPhotos?: boolean } = {},
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
      serialized: number;
      price_usd: number | null;
    }[]
  >(
    `SELECT p.id, p.name, p.price, p.description, p.is_daily_menu,
            COALESCE(p.is_kit, 0) AS is_kit,
            p.image_path,
            COALESCE(p.serialized, 0) AS serialized,
            p.price_usd,
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

  const ids = rows.map((r) => r.id);
  const [extraPhotos, unitsByProduct] = await Promise.all([
    opts.extraPhotos === false
      ? new Map<number, string[]>()
      : listExtraPhotosByProduct(ids).catch(() => new Map<number, string[]>()),
    listMenuUnits(rows.filter((r) => r.serialized === 1).map((r) => r.id)).catch(
      () => new Map<number, MenuPortalUnit[]>(),
    ),
  ]);

  const products: MenuPortalProduct[] = rows.map((r) => {
    let description = r.description?.trim() || null;
    if (!description && r.is_kit === 1) {
      description = formatKitIncludes(kitsByProduct.get(r.id) ?? []);
    }
    const main = r.image_path?.trim();
    const photoFiles = [...(main ? [main] : []), ...(extraPhotos.get(r.id) ?? [])].slice(0, 4);
    const units = unitsByProduct.get(r.id);
    return {
      id: r.id,
      name: r.name.trim(),
      price: Number(r.price) || 0,
      category: r.category_name?.trim() || null,
      description,
      is_daily_menu: r.is_daily_menu === 1,
      image_data_url: null,
      available: r.available === 1,
      ...(photoFiles.length ? { photo_files: photoFiles } : {}),
      ...(r.price_usd && r.price_usd > 0 ? { price_usd: Number(r.price_usd) } : {}),
      ...(units?.length ? { units } : {}),
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
