/**
 * Derechos por (billing × plan). Fuente de verdad comercial:
 * Permanente $12k vs Mensual Estándar $35k vs Pro+ $60k.
 */
import type { LicenseStatus } from "../lib/license";
import {
  FREE_MAX_PHONE_UNITS,
  FREE_MAX_TABLES,
  FREE_MAX_WAITER_PHONES,
  PRICE_BASIC_MONTHLY_ARS,
  PRICE_BASIC_ONETIME_ARS,
  PRICE_PRO_MONTHLY_ARS,
} from "./pricing";

export type PlanEntitlementKey =
  | "autoUpdates"
  | "catalogSuper"
  | "facturaIa"
  | "mercadoPago"
  | "tiendaNube"
  | "printBranding"
  | "appearanceEdit"
  | "unlimitedStaff"
  | "tutorialLibrary"
  | "virtualAssist"
  | "invoicingArca"
  | "proModules"
  | "businessIntelligence"
  | "phoneStore"
  | "multiPhotos"
  | "tables"
  | "waiterPhones"
  | "reportsFull"
  | "mobileApp"
  | "suppliers"
  | "treasury"
  | "expenses"
  | "bulkPriceUpdate"
  | "labels"
  | "webStore"
  | "auditLog";

export interface PlanEntitlements {
  autoUpdates: boolean;
  catalogSuper: boolean;
  facturaIa: boolean;
  mercadoPago: boolean;
  tiendaNube: boolean;
  printBranding: boolean;
  appearanceEdit: boolean;
  /** Si false: máx. 1 admin + 1 cajero activos. */
  unlimitedStaff: boolean;
  tutorialLibrary: boolean;
  /** WhatsApp directo con soporte WalQo (no incluido en permanente). */
  virtualAssist: boolean;
  invoicingArca: boolean;
  proModules: boolean;
  /** Inteligencia de Negocio — planes mensuales y trial. */
  businessIntelligence: boolean;
  /** Venta de celulares sin tope; si false, prueba con FREE_MAX_PHONE_UNITS equipos. */
  phoneStore: boolean;
  /** Hasta 4 fotos por producto en la tienda web; si false, solo la principal. */
  multiPhotos: boolean;
  /** Mesas sin tope; si false, prueba con FREE_MAX_TABLES mesas. */
  tables: boolean;
  /** Mozos desde el celular sin tope; si false, prueba con FREE_MAX_WAITER_PHONES celular. */
  waiterPhones: boolean;
  /** Reportes por período, rentabilidad y Sugerencias; si false, solo «Resumen hoy» y las ventas del día. */
  reportsFull: boolean;
  /** App del celular (catálogo y ventas desde el teléfono). */
  mobileApp: boolean;
  /** Proveedores, ingreso de compra y pedidos para reponer. */
  suppliers: boolean;
  treasury: boolean;
  expenses: boolean;
  /** Ajuste masivo de precio, costo o margen por porcentaje. */
  bulkPriceUpdate: boolean;
  /** Etiquetas de precio y código de barras. */
  labels: boolean;
  /** Tienda web / carta online en walqo.pro. */
  webStore: boolean;
  auditLog: boolean;
  /** Tope de productos de un plan pago (null = sin tope). Gratis usa freePlanLimits(). */
  maxProducts: number | null;
  maxDevicesDefault: number;
  maxActiveStaff: number | null;
  upsellLabel: string;
}

/** Productos activos (sin ejemplos) que entran en la licencia Permanente. */
export const PERMANENT_MAX_PRODUCTS = 1_000;

const FULL_FEATURES = {
  reportsFull: true,
  mobileApp: true,
  suppliers: true,
  treasury: true,
  expenses: true,
  bulkPriceUpdate: true,
  labels: true,
  webStore: true,
  auditLog: true,
  maxProducts: null,
} as const;

const MONTHLY_STANDARD: PlanEntitlements = {
  autoUpdates: true,
  catalogSuper: true,
  facturaIa: true,
  mercadoPago: true,
  tiendaNube: true,
  printBranding: true,
  appearanceEdit: true,
  unlimitedStaff: true,
  tutorialLibrary: true,
  virtualAssist: true,
  invoicingArca: true,
  proModules: false,
  businessIntelligence: true,
  phoneStore: true,
  multiPhotos: true,
  tables: true,
  waiterPhones: true,
  ...FULL_FEATURES,
  maxDevicesDefault: 2,
  maxActiveStaff: null,
  upsellLabel: "Plan mensual Estándar",
};

const MONTHLY_PRO: PlanEntitlements = {
  ...MONTHLY_STANDARD,
  invoicingArca: true,
  proModules: true,
  maxDevicesDefault: 3,
  upsellLabel: "Plan Pro+",
};

const PERMANENT: PlanEntitlements = {
  autoUpdates: false,
  catalogSuper: false,
  facturaIa: false,
  mercadoPago: false,
  tiendaNube: false,
  printBranding: false,
  appearanceEdit: false,
  unlimitedStaff: false,
  tutorialLibrary: false,
  virtualAssist: false,
  invoicingArca: false,
  proModules: false,
  businessIntelligence: false,
  phoneStore: false,
  multiPhotos: false,
  tables: false,
  waiterPhones: false,
  reportsFull: false,
  mobileApp: false,
  suppliers: false,
  treasury: false,
  expenses: false,
  bulkPriceUpdate: false,
  labels: false,
  webStore: false,
  auditLog: false,
  maxProducts: PERMANENT_MAX_PRODUCTS,
  maxDevicesDefault: 1,
  maxActiveStaff: 2,
  upsellLabel: "Suscripción mensual",
};

const FREE: PlanEntitlements = {
  autoUpdates: true,
  catalogSuper: false,
  facturaIa: false,
  mercadoPago: false,
  tiendaNube: false,
  printBranding: false,
  appearanceEdit: true,
  unlimitedStaff: false,
  tutorialLibrary: true,
  virtualAssist: true,
  invoicingArca: false,
  proModules: false,
  businessIntelligence: false,
  phoneStore: false,
  multiPhotos: false,
  tables: false,
  waiterPhones: false,
  ...FULL_FEATURES,
  maxDevicesDefault: 1,
  maxActiveStaff: 2,
  upsellLabel: "Plan mensual",
};

const TRIAL: PlanEntitlements = {
  ...MONTHLY_PRO,
  maxDevicesDefault: 1,
  upsellLabel: "Plan Pro+",
};

type EntitlementStatus = Pick<
  LicenseStatus,
  "plan" | "billing" | "pro_enabled" | "is_trial" | "active" | "max_products" | "catalog_super"
>;

/** Tope de la Permanente: el del panel si lo hay (-1 = sin tope), si no PERMANENT_MAX_PRODUCTS. Igual que permanent_max_products en license.rs. */
export function permanentMaxProducts(maxProducts: number | null | undefined): number | null {
  if (maxProducts == null || maxProducts === 0) return PERMANENT_MAX_PRODUCTS;
  return maxProducts < 0 ? null : maxProducts;
}

function permanentFor(status: EntitlementStatus): PlanEntitlements {
  return {
    ...PERMANENT,
    maxProducts: permanentMaxProducts(status.max_products),
    catalogSuper: status.catalog_super === true,
  };
}

export function resolvePlanEntitlements(status: EntitlementStatus | null): PlanEntitlements {
  if (!status?.active) return FREE;

  if (status.is_trial || status.billing === "trial" || status.plan === "trial") {
    return TRIAL;
  }

  if (status.plan === "free" || status.billing === "free") {
    return FREE;
  }

  if (status.billing === "perpetual") {
    return permanentFor(status);
  }

  const isPro = status.pro_enabled || status.plan === "pro";
  if (status.billing === "monthly") {
    return isPro ? MONTHLY_PRO : MONTHLY_STANDARD;
  }

  // Sin billing claro: tratar como permanente si hay licencia paga (conservador).
  if (status.plan === "basic" || status.plan === "pro") {
    return isPro && status.billing !== "perpetual" ? MONTHLY_PRO : permanentFor(status);
  }

  return FREE;
}

export function entitlementBlockedMessage(key: PlanEntitlementKey): string {
  const messages: Record<PlanEntitlementKey, string> = {
    autoUpdates:
      "Tu licencia permanente no incluye actualizaciones. Pasate al plan mensual para recibir versiones nuevas.",
    catalogSuper:
      "El catálogo de ~200.000 productos está incluido en el plan mensual. Escribinos por WhatsApp para actualizar.",
    facturaIa:
      "Facturas IA está incluido en el plan mensual. Con la licencia permanente podés cargar productos a mano o por Excel.",
    mercadoPago:
      "Cobrar con Mercado Pago desde la PC está incluido en el plan mensual.",
    tiendaNube:
      "La sincronización con Tienda Nube está incluida en el plan mensual.",
    printBranding:
      "Personalizar logo y datos en tickets está incluido en el plan mensual. El ticket básico sigue disponible.",
    appearanceEdit:
      "Cambiar la apariencia y los datos de impresión del negocio está incluido en el plan mensual.",
    unlimitedStaff:
      "La licencia permanente permite 1 administrador y 1 cajero. Para más usuarios, pasate al plan mensual.",
    tutorialLibrary:
      "La biblioteca completa de tutoriales está en el plan mensual y en walqo.pro.",
    virtualAssist:
      "La asistencia virtual por WhatsApp está incluida en el plan gratis y en la suscripción mensual, no en la licencia permanente.",
    invoicingArca:
      "La facturación electrónica ARCA está incluida en el plan mensual Estándar.",
    proModules: "Los módulos Pro (taller, turnos, remitos) están en el plan Pro+.",
    businessIntelligence:
      "Inteligencia de Negocio está incluida en el plan mensual. Te ayuda a saber qué hacer hoy en tu negocio.",
    phoneStore: `Ya cargaste los ${FREE_MAX_PHONE_UNITS} equipos de prueba de Venta de celulares. Para seguir cargando equipos y tomando usados, pasate a WalQo Completo. Lo que ya cargaste lo seguís vendiendo igual.`,
    multiPhotos: "Hasta 4 fotos por producto en la tienda web vienen con WalQo Completo. Ahora se publica solo la principal.",
    tables: `Probás con ${FREE_MAX_TABLES} mesas; con WalQo Completo tenés todas las que quieras.`,
    waiterPhones: `Probás con ${FREE_MAX_WAITER_PHONES} mozo; con WalQo Completo sumás todos los que quieras.`,
    reportsFull:
      "Los reportes por fechas, la ganancia y las sugerencias vienen con WalQo Completo. Con tu licencia tenés el resumen de hoy desde Inicio.",
    mobileApp: "La app del celular viene con WalQo Completo.",
    suppliers: "Proveedores, ingreso de compras y pedidos para reponer vienen con WalQo Completo.",
    treasury: "Tesorería viene con WalQo Completo.",
    expenses: "Gastos del negocio viene con WalQo Completo.",
    bulkPriceUpdate: "Subir o bajar precios en cantidad viene con WalQo Completo.",
    labels: "Imprimir etiquetas de precio y código de barras viene con WalQo Completo.",
    webStore: "La tienda web viene con WalQo Completo.",
    auditLog: "El historial de acciones viene con WalQo Completo.",
  };
  return messages[key];
}

export function defaultDevicesForCreate(
  plan: "basic" | "pro",
  billing: "monthly" | "perpetual",
): number {
  if (billing === "perpetual") return 1;
  return plan === "pro" ? 3 : 2;
}

export function defaultAmountArs(
  plan: "basic" | "pro",
  billing: "monthly" | "perpetual",
): number {
  if (billing === "perpetual") return PRICE_BASIC_ONETIME_ARS;
  return plan === "pro" ? PRICE_PRO_MONTHLY_ARS : PRICE_BASIC_MONTHLY_ARS;
}
