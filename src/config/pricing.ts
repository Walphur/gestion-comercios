/** Precios y límites de planes (ARS). */

/** Plan gratis para siempre (sin clave). */
export const FREE_MAX_PRODUCTS = 25;
export const FREE_MAX_SALES_PER_MONTH = 50;

/** Estándar: productos/ventas ilimitados, sin ARCA ni módulos taller. */
export const PRICE_BASIC_MONTHLY_ARS = 35_000;

/** Pro+: taller/estética/órdenes/turnos/remitos + facturación ARCA. */
export const PRICE_PRO_MONTHLY_ARS = 60_000;

/** @deprecated alias histórico */
export const PRICE_BASIC_TARGET_ARS = PRICE_PRO_MONTHLY_ARS;

/** Legacy pago único marketplace (permanente Estándar). */
export const PRICE_BASIC_ONETIME_ARS = 12_000;
export const PRICE_PRO_ONETIME_ARS = 40_000;
export const PRICE_CATALOG_SUPER_ONETIME_ARS = 10_000;

/** PCs por defecto al crear licencia. */
export const DEVICES_PERPETUAL = 1;
export const DEVICES_BASIC_MONTHLY = 2;
export const DEVICES_PRO_MONTHLY = 3;

export function formatPriceArs(amount: number): string {
  return `$${amount.toLocaleString("es-AR")}`;
}

export function isFreePlan(plan: string | null | undefined): boolean {
  return plan === "free";
}

export function isProPlusPlan(plan: string | null | undefined, proEnabled: boolean): boolean {
  return proEnabled || plan === "pro" || plan === "trial";
}
