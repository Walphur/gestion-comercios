import type { Product } from "../types";
import { getDb } from "./index";
import { getSetting, setSetting } from "./settings";

const FAVORITES_KEY = "pos_favorite_product_ids";

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

function parseFavoriteIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  } catch {
    return [];
  }
}

export async function getPosFavoriteIds(): Promise<number[]> {
  return parseFavoriteIds(await getSetting(FAVORITES_KEY));
}

export async function setPosFavoriteIds(ids: number[]): Promise<void> {
  const unique = [...new Set(ids.filter((id) => id > 0))];
  await setSetting(FAVORITES_KEY, JSON.stringify(unique));
}

export async function togglePosFavorite(productId: number): Promise<boolean> {
  const ids = await getPosFavoriteIds();
  const has = ids.includes(productId);
  await setPosFavoriteIds(has ? ids.filter((id) => id !== productId) : [...ids, productId]);
  return !has;
}

export async function addPosFavorites(productIds: number[]): Promise<void> {
  const ids = await getPosFavoriteIds();
  await setPosFavoriteIds([...ids, ...productIds]);
}

export async function getProductsByIds(ids: number[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const rows = await db.select<Product[]>(
    `${PRODUCT_SELECT} WHERE p.active = 1 AND p.id IN (${placeholders})`,
    ids,
  );
  const byId = new Map(rows.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Product => p != null);
}

/** Productos más vendidos por cantidad en los últimos N días (ventas no anuladas). */
export async function getTopSellingProducts(limit = 12, days = 30): Promise<Product[]> {
  const db = await getDb();
  const rows = await db.select<{ product_id: number }[]>(
    `SELECT si.product_id
     FROM sale_items si
     INNER JOIN sales s ON s.id = si.sale_id
     WHERE s.voided = 0
       AND si.product_id IS NOT NULL
       AND s.created_at >= datetime('now', 'localtime', '-' || $1 || ' days')
     GROUP BY si.product_id
     ORDER BY SUM(si.qty) DESC
     LIMIT $2`,
    [days, limit],
  );
  const ids = rows.map((r) => r.product_id);
  return getProductsByIds(ids);
}

export async function getPosQuickPickProducts(): Promise<{
  favorites: Product[];
  topSellers: Product[];
}> {
  const favoriteIds = await getPosFavoriteIds();
  const favorites = await getProductsByIds(favoriteIds);
  const favoriteIdSet = new Set(favorites.map((p) => p.id));
  const topRaw = await getTopSellingProducts(16);
  const topSellers = topRaw.filter((p) => !favoriteIdSet.has(p.id)).slice(0, 12);
  return { favorites, topSellers };
}
