/** Umbral efectivo: si hay mínimo configurado, ese; si no, 0 = agotado. */
export function lowStockThreshold(minStock: number): number {
  return minStock > 0 ? minStock : 0;
}

export function isLowStock(stock: number, minStock: number, trackStock = true): boolean {
  if (!trackStock) return false;
  return stock <= lowStockThreshold(minStock);
}

/** Condición SQL para filtros de productos (alias `p`). Incluye variantes con mínimo. */
export const LOW_STOCK_WHERE_SQL =
  `((COALESCE(p.track_stock, 1) = 1 AND p.stock <= CASE WHEN p.min_stock > 0 THEN p.min_stock ELSE 0 END)
    OR EXISTS (
      SELECT 1 FROM product_variants v
      WHERE v.product_id = p.id AND v.min_stock > 0 AND v.stock <= v.min_stock
    ))`;

/** Alertas reales para panel web: mínimo configurado o stock negativo (no catálogo en 0). */
export const PORTAL_STOCK_ALERT_WHERE_SQL =
  `(COALESCE(p.track_stock, 1) = 1 AND ((p.min_stock > 0 AND p.stock <= p.min_stock) OR p.stock < 0)
    OR EXISTS (
      SELECT 1 FROM product_variants v
      WHERE v.product_id = p.id AND v.min_stock > 0 AND v.stock <= v.min_stock
    ))`;

export const LOW_STOCK_CASE_SQL =
  `CASE WHEN (COALESCE(track_stock, 1) = 1 AND stock <= CASE WHEN min_stock > 0 THEN min_stock ELSE 0 END)
    OR EXISTS (
      SELECT 1 FROM product_variants v
      WHERE v.product_id = products.id AND v.min_stock > 0 AND v.stock <= v.min_stock
    )
   THEN 1 ELSE 0 END`;
