/** Stock bajo solo si hay mínimo configurado (> 0) y la cantidad no lo alcanza. */
export function isLowStock(stock: number, minStock: number): boolean {
  if (minStock > 0) return stock <= minStock;
  return stock < 0;
}
