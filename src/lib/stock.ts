/** Umbral efectivo: si hay mínimo configurado, ese; si no, 0 = agotado. */
export function lowStockThreshold(minStock: number): number {
  return minStock > 0 ? minStock : 0;
}

export function isLowStock(stock: number, minStock: number): boolean {
  return stock <= lowStockThreshold(minStock);
}

/** Condición SQL para filtros de productos (alias `p`). */
export const LOW_STOCK_WHERE_SQL =
  "p.stock <= CASE WHEN p.min_stock > 0 THEN p.min_stock ELSE 0 END";

export const LOW_STOCK_CASE_SQL =
  "CASE WHEN stock <= CASE WHEN min_stock > 0 THEN min_stock ELSE 0 END THEN 1 ELSE 0 END";
