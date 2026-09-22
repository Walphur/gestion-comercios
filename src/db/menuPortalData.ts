import { getDb } from "./index";

export interface MenuPortalProduct {
  id: number;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  is_daily_menu: boolean;
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

/** Productos activos para la carta pública (sin stock sensible). */
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
    }[]
  >(
    `SELECT p.id, p.name, p.price, p.description, p.is_daily_menu,
            c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.active = 1
     ORDER BY
       CASE WHEN p.is_daily_menu = 1 THEN 0 ELSE 1 END,
       CASE WHEN c.name IS NULL OR TRIM(c.name) = '' THEN 1 ELSE 0 END,
       LOWER(COALESCE(c.name, '')),
       LOWER(p.name)
     LIMIT 400`,
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name.trim(),
    price: Number(r.price) || 0,
    category: r.category_name?.trim() || null,
    description: r.description?.trim() || null,
    is_daily_menu: r.is_daily_menu === 1,
  }));
}
