/** Precios y límites de planes (ARS). */

/** Plan gratis para siempre (sin clave), valores generales. Por rubro: freePlanLimits(). */
export const FREE_MAX_PRODUCTS = 25;
export const FREE_MAX_SALES_PER_MONTH = 50;

export interface FreePlanLimits {
  maxProducts: number;
  maxSalesPerMonth: number;
  /** Cómo se nombra lo que cuenta en maxProducts. */
  itemsLabel: "productos" | "servicios";
}

/**
 * Plan gratis según el rubro. Peluquería/estética: 5 servicios (cuentan también productos e insumos)
 * y 10 ventas; electrónica: 25 productos y 10 ventas (más la prueba de equipos). Import de Excel
 * repite el tope de productos en src-tauri/src/import_products.rs.
 */
export function freePlanLimits(rubroId: string | null | undefined): FreePlanLimits {
  if (rubroId && isSalonRubro(rubroId)) return { maxProducts: 5, maxSalesPerMonth: 10, itemsLabel: "servicios" };
  if (rubroId === "electronica") {
    return { maxProducts: FREE_MAX_PRODUCTS, maxSalesPerMonth: 10, itemsLabel: "productos" };
  }
  return { maxProducts: FREE_MAX_PRODUCTS, maxSalesPerMonth: FREE_MAX_SALES_PER_MONTH, itemsLabel: "productos" };
}

/** «hasta 25 productos y 50 ventas por mes» del plan gratis para ese rubro. */
export function freePlanLimitsText(rubroId: string | null | undefined): string {
  const l = freePlanLimits(rubroId);
  return `hasta ${l.maxProducts} ${l.itemsLabel} y ${l.maxSalesPerMonth} ventas por mes`;
}
/** Venta de celulares de prueba en Gratis y Permanente: equipos cargados en total (vendidos y usados incluidos). */
export const FREE_MAX_PHONE_UNITS = 5;
/** Mesas de prueba en Gratis y Permanente (las primeras del salón). */
export const FREE_MAX_TABLES = 2;

/** Estándar: productos/ventas ilimitados + facturación ARCA; sin módulos taller. */
export const PRICE_BASIC_MONTHLY_ARS = 35_000;

/** Pro+: taller/clínica/súper/órdenes/turnos/remitos (incluye ARCA del Estándar). */
export const PRICE_PRO_MONTHLY_ARS = 60_000;

/** Pagando el año de una vez: 12 meses por el precio de 10. */
export const ANNUAL_PAID_MONTHS = 10;

export function annualPriceArs(monthly: number): number {
  return monthly * ANNUAL_PAID_MONTHS;
}

/** Pagando 3 meses juntos: 10% menos. */
export const QUARTER_DISCOUNT_PCT = 10;

export function quarterPriceArs(monthly: number): number {
  return Math.round(monthly * 3 * (1 - QUARTER_DISCOUNT_PCT / 100));
}

/**
 * Peluquería, barbería y estética: WalQo Completo trae turnos, trabajos y comisiones para
 * hasta 2 profesionales (licencia Pro a $35.000 con 2 PCs). Con más, Pro.
 */
export function isSalonRubro(rubroId: string): boolean {
  return rubroId === "estetica";
}

/** Plan que conviene ofrecer según el rubro, para textos y mensajes de venta. */
export function suggestedPlanFor(rubroId: string): { name: string; monthly: number; includes: string } {
  if (isSalonRubro(rubroId)) {
    return {
      name: "WalQo Completo",
      monthly: PRICE_BASIC_MONTHLY_ARS,
      includes: "turnos y comisiones para hasta 2 profesionales; con más, Pro",
    };
  }
  return { name: "WalQo Completo", monthly: PRICE_BASIC_MONTHLY_ARS, includes: "productos y ventas sin límite" };
}

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
