/** Unidades en las que el precio del producto es por peso (stock y cantidad en la misma base). */
const WEIGHT_UNITS = new Set(["kg", "kilogramo", "g", "gramo", "gr"]);

export function isWeightUnit(unit: string): boolean {
  return WEIGHT_UNITS.has(unit.trim().toLowerCase());
}

/** true si la unidad del producto se vende fraccionado por peso en el POS. */
export function productSoldByWeight(unit: string): boolean {
  return isWeightUnit(unit);
}

/** Cantidad en kg (stock y ventas internas en kg cuando la unidad del producto es kg). */
export function qtyInKg(unit: string, qty: number): number {
  const u = unit.trim().toLowerCase();
  if (u === "g" || u === "gramo" || u === "gr") return qty / 1000;
  return qty;
}

/** Convierte kg a la unidad de visualización del producto. */
export function qtyFromKg(unit: string, kg: number): number {
  const u = unit.trim().toLowerCase();
  if (u === "g" || u === "gramo" || u === "gr") return kg * 1000;
  return kg;
}

/**
 * Precio por kg del producto.
 * En pet shop / forrajería el precio cargado es por kg aunque se pese en gramos.
 */
export function pricePerKg(unit: string, unitPrice: number): number {
  const u = unit.trim().toLowerCase();
  if (u === "g" || u === "gramo" || u === "gr") return unitPrice * 1000;
  return unitPrice;
}

/** Cantidad en la unidad del producto (kg o g) a partir de un importe en pesos. */
export function qtyFromPesos(
  unit: string,
  unitPrice: number,
  pesos: number,
): number {
  const perKg = pricePerKg(unit, unitPrice);
  if (perKg <= 0) return 0;
  const kg = pesos / perKg;
  return qtyFromKg(unit, kg);
}

export function lineTotal(unitPrice: number, qty: number, discountPct: number): number {
  return unitPrice * qty * (1 - discountPct / 100);
}
