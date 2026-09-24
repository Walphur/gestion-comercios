/** Anchos configurables del listado de productos (arrastre en encabezado). */

export type ProductsListColId =
  | "product"
  | "code"
  | "category"
  | "brand"
  | "unit"
  | "cost"
  | "price"
  | "stock";

export type ProductsListColWidths = Record<ProductsListColId, number>;

const STORAGE_KEY = "wt_products_list_cols_v2";

export const PRODUCTS_LIST_FIXED = {
  check: 22,
  thumb: 38,
  actions: 118,
} as const;

export const PRODUCTS_LIST_DEFAULT_WIDTHS: ProductsListColWidths = {
  product: 240,
  code: 88,
  category: 120,
  brand: 96,
  unit: 72,
  cost: 92,
  price: 92,
  stock: 78,
};

export const PRODUCTS_LIST_MIN_WIDTHS: ProductsListColWidths = {
  product: 140,
  code: 52,
  category: 72,
  brand: 64,
  unit: 52,
  cost: 72,
  price: 72,
  stock: 64,
};

export type ProductsListColPrefs = {
  widths: ProductsListColWidths;
};

export type ProductsListColContext = {
  hasBarcode: boolean;
  hasUnit: boolean;
  hasStock?: boolean;
};

function clampWidth(id: ProductsListColId, px: number): number {
  const min = PRODUCTS_LIST_MIN_WIDTHS[id];
  return Math.max(min, Math.min(480, Math.round(px)));
}

export function loadProductsListColPrefs(): ProductsListColPrefs {
  const fallback: ProductsListColPrefs = {
    widths: { ...PRODUCTS_LIST_DEFAULT_WIDTHS },
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("wt_products_list_cols_v1");
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { widths?: Partial<ProductsListColWidths> };
    const widths = { ...PRODUCTS_LIST_DEFAULT_WIDTHS };
    if (parsed.widths) {
      for (const key of Object.keys(widths) as ProductsListColId[]) {
        const v = parsed.widths[key];
        if (typeof v === "number" && Number.isFinite(v)) widths[key] = clampWidth(key, v);
      }
    }
    return { widths };
  } catch {
    return fallback;
  }
}

export function saveProductsListColPrefs(prefs: ProductsListColPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ widths: prefs.widths }));
  } catch {
    /* quota / private mode */
  }
}

/** Columnas de datos en orden (sin check/thumb/acciones). */
export function productsListDataCols(ctx: ProductsListColContext): ProductsListColId[] {
  const out: ProductsListColId[] = ["product"];
  if (ctx.hasBarcode) out.push("code");
  out.push("category", "brand");
  if (ctx.hasUnit) out.push("unit");
  out.push("cost", "price");
  if (ctx.hasStock !== false) out.push("stock");
  return out;
}

export function buildProductsListGridTemplate(
  widths: ProductsListColWidths,
  ctx: ProductsListColContext,
): string {
  const parts = [`${PRODUCTS_LIST_FIXED.check}px`, `${PRODUCTS_LIST_FIXED.thumb}px`];
  for (const id of productsListDataCols(ctx)) {
    if (id === "product") {
      parts.push(`minmax(${widths.product}px, 1fr)`);
    } else {
      parts.push(`${widths[id]}px`);
    }
  }
  parts.push(`${PRODUCTS_LIST_FIXED.actions}px`);
  return parts.join(" ");
}

export function clampProductsListColWidth(id: ProductsListColId, px: number): number {
  return clampWidth(id, px);
}
