/** Columnas configurables del listado de productos (estilo Excel). */

export type ProductsListColId =
  | "product"
  | "code"
  | "category"
  | "brand"
  | "unit"
  | "cost"
  | "price"
  | "stock";

/** Columnas que el usuario puede ocultar. */
export type ProductsListToggleCol = "code" | "category" | "brand" | "unit" | "cost";

export const PRODUCTS_LIST_TOGGLE_COLS: {
  id: ProductsListToggleCol;
  label: string;
}[] = [
  { id: "code", label: "Código" },
  { id: "category", label: "Categoría" },
  { id: "brand", label: "Marca" },
  { id: "unit", label: "Unidad" },
  { id: "cost", label: "Costo" },
];

export type ProductsListColVisibility = Record<ProductsListToggleCol, boolean>;

export type ProductsListColWidths = Record<ProductsListColId, number>;

const STORAGE_KEY = "wt_products_list_cols_v1";

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

export const PRODUCTS_LIST_DEFAULT_VISIBLE: ProductsListColVisibility = {
  code: true,
  category: true,
  brand: true,
  unit: true,
  cost: true,
};

export type ProductsListColPrefs = {
  visible: ProductsListColVisibility;
  widths: ProductsListColWidths;
};

function clampWidth(id: ProductsListColId, px: number): number {
  const min = PRODUCTS_LIST_MIN_WIDTHS[id];
  return Math.max(min, Math.min(480, Math.round(px)));
}

export function loadProductsListColPrefs(): ProductsListColPrefs {
  const fallback: ProductsListColPrefs = {
    visible: { ...PRODUCTS_LIST_DEFAULT_VISIBLE },
    widths: { ...PRODUCTS_LIST_DEFAULT_WIDTHS },
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ProductsListColPrefs>;
    const visible = { ...PRODUCTS_LIST_DEFAULT_VISIBLE, ...parsed.visible };
    const widths = { ...PRODUCTS_LIST_DEFAULT_WIDTHS };
    if (parsed.widths) {
      for (const key of Object.keys(widths) as ProductsListColId[]) {
        const v = parsed.widths[key];
        if (typeof v === "number" && Number.isFinite(v)) widths[key] = clampWidth(key, v);
      }
    }
    return { visible, widths };
  } catch {
    return fallback;
  }
}

export function saveProductsListColPrefs(prefs: ProductsListColPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

export function resetProductsListColPrefs(): ProductsListColPrefs {
  const prefs: ProductsListColPrefs = {
    visible: { ...PRODUCTS_LIST_DEFAULT_VISIBLE },
    widths: { ...PRODUCTS_LIST_DEFAULT_WIDTHS },
  };
  saveProductsListColPrefs(prefs);
  return prefs;
}

export type ProductsListColContext = {
  hasBarcode: boolean;
  hasUnit: boolean;
};

/** Columnas de datos en orden (sin check/thumb/acciones). */
export function productsListDataCols(
  visible: ProductsListColVisibility,
  ctx: ProductsListColContext,
): ProductsListColId[] {
  const out: ProductsListColId[] = ["product"];
  if (ctx.hasBarcode && visible.code) out.push("code");
  if (visible.category) out.push("category");
  if (visible.brand) out.push("brand");
  if (ctx.hasUnit && visible.unit) out.push("unit");
  if (visible.cost) out.push("cost");
  out.push("price", "stock");
  return out;
}

export function buildProductsListGridTemplate(
  widths: ProductsListColWidths,
  visible: ProductsListColVisibility,
  ctx: ProductsListColContext,
): string {
  const parts = [
    `${PRODUCTS_LIST_FIXED.check}px`,
    `${PRODUCTS_LIST_FIXED.thumb}px`,
  ];
  for (const id of productsListDataCols(visible, ctx)) {
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
