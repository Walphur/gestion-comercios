/**
 * Lógica pura de recetas / expansión de stock (testeable sin SQLite).
 *
 * Reglas:
 * - Combo (kit): descuenta componentes (recursivo).
 * - Elaborado al momento (trackStock=0 + receta): descuenta insumos de la receta.
 * - Elaborado con stock / insumo / estándar: descuenta su propio stock.
 * - trackStock=0 sin receta: no-op (compatibilidad con platos viejos).
 */

export type StockExpandNode = {
  id: number;
  isKit: boolean;
  trackStock: boolean;
  /** qty de cada componente por 1 unidad del kit */
  kitItems?: { productId: number; qty: number }[];
  /** qty de cada insumo por 1 unidad del producto elaborado (ya dividido por yield) */
  recipeItems?: { productId: number; qty: number }[];
};

export type StockDeduction = { productId: number; qty: number };

export function expandStockDeductions(
  productId: number,
  qty: number,
  resolve: (id: number) => StockExpandNode | undefined,
  seen: Set<number> = new Set(),
): StockDeduction[] {
  if (qty <= 0 || !Number.isFinite(qty)) return [];
  if (seen.has(productId)) return [];
  const node = resolve(productId);
  if (!node) return [{ productId, qty }];

  const nextSeen = new Set(seen);
  nextSeen.add(productId);

  if (node.isKit && node.kitItems && node.kitItems.length > 0) {
    const out: StockDeduction[] = [];
    for (const it of node.kitItems) {
      out.push(...expandStockDeductions(it.productId, it.qty * qty, resolve, nextSeen));
    }
    return mergeDeductions(out);
  }

  if (!node.trackStock && node.recipeItems && node.recipeItems.length > 0) {
    const out: StockDeduction[] = [];
    for (const it of node.recipeItems) {
      out.push(...expandStockDeductions(it.productId, it.qty * qty, resolve, nextSeen));
    }
    return mergeDeductions(out);
  }

  if (!node.trackStock) return [];

  return [{ productId, qty }];
}

export function mergeDeductions(items: StockDeduction[]): StockDeduction[] {
  const map = new Map<number, number>();
  for (const it of items) {
    map.set(it.productId, (map.get(it.productId) ?? 0) + it.qty);
  }
  return [...map.entries()].map(([productId, qty]) => ({ productId, qty }));
}

/** Cantidad de cada insumo para producir `produceQty` unidades (rendimiento `yieldQty`). */
export function ingredientsForProduction(
  lines: { productId: number; qtyPerYield: number }[],
  yieldQty: number,
  produceQty: number,
): StockDeduction[] {
  const y = yieldQty > 0 ? yieldQty : 1;
  const factor = produceQty / y;
  return lines.map((l) => ({
    productId: l.productId,
    qty: l.qtyPerYield * factor,
  }));
}

/** Costo unitario del elaborado = suma(costo_insumo × qty) / yield. */
export function recipeUnitCost(
  lines: { qtyPerYield: number; unitCost: number }[],
  yieldQty: number,
): number {
  const y = yieldQty > 0 ? yieldQty : 1;
  const total = lines.reduce((s, l) => s + l.unitCost * l.qtyPerYield, 0);
  return total / y;
}

export type ProductKind = "standard" | "ingredient" | "prepared" | "kit";
export type PrepareMode = "batch" | "on_demand";

export function defaultsForGastroKind(
  kind: ProductKind,
  asDailyMenu = false,
): {
  product_kind: ProductKind;
  is_kit: boolean;
  is_daily_menu: boolean;
  track_stock: boolean;
  show_on_menu: boolean;
  prepare_mode: PrepareMode | null;
  unit: string;
  price: number;
} {
  switch (kind) {
    case "ingredient":
      return {
        product_kind: "ingredient",
        is_kit: false,
        is_daily_menu: false,
        track_stock: true,
        show_on_menu: false,
        prepare_mode: null,
        unit: "kg",
        price: 0,
      };
    case "prepared":
      return {
        product_kind: "prepared",
        is_kit: false,
        is_daily_menu: false,
        track_stock: true,
        show_on_menu: false,
        prepare_mode: "batch",
        unit: "porción",
        price: 0,
      };
    case "kit":
      return {
        product_kind: "kit",
        is_kit: true,
        is_daily_menu: asDailyMenu,
        track_stock: false,
        show_on_menu: true,
        prepare_mode: null,
        unit: "unidad",
        price: 0,
      };
    default:
      return {
        product_kind: "standard",
        is_kit: false,
        is_daily_menu: false,
        track_stock: true,
        show_on_menu: true,
        prepare_mode: null,
        unit: "unidad",
        price: 0,
      };
  }
}
