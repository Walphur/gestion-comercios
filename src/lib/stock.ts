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

/** Alertas reales para panel web: mínimo configurado o stock negativo (no catálogo en 0). */
export const PORTAL_STOCK_ALERT_WHERE_SQL =
  "((p.min_stock > 0 AND p.stock <= p.min_stock) OR p.stock < 0)";

export const LOW_STOCK_CASE_SQL =
  "CASE WHEN stock <= CASE WHEN min_stock > 0 THEN min_stock ELSE 0 END THEN 1 ELSE 0 END";
