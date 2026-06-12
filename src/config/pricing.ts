/** Precios de venta (ARS, pago único). */
export const PRICE_BASIC_ARS = 12_000;
export const PRICE_PRO_ARS = 40_000;
export const PRICE_CATALOG_SUPER_ARS = 10_000;

export function formatPriceArs(amount: number): string {
  return `$${amount.toLocaleString("es-AR")}`;
}
