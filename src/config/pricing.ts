/** Precios de venta (ARS). */
export const PRICE_BASIC_MONTHLY_ARS = 25_000;
export const PRICE_PRO_MONTHLY_ARS = 35_000;
export const PRICE_CATALOG_SUPER_MONTHLY_ARS = 2_500;

/** Precio objetivo cuando el producto esté completo (AFIP, videos, etc.). */
export const PRICE_BASIC_TARGET_ARS = 50_000;

/** Legacy pago único (solo early adopters). */
export const PRICE_BASIC_ONETIME_ARS = 12_000;
export const PRICE_PRO_ONETIME_ARS = 40_000;
export const PRICE_CATALOG_SUPER_ONETIME_ARS = 10_000;

export function formatPriceArs(amount: number): string {
  return `$${amount.toLocaleString("es-AR")}`;
}
