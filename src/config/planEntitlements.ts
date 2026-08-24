/**
 * Derechos por (billing × plan). Fuente de verdad comercial:
 * Permanente $12k vs Mensual Estándar $35k vs Pro+ $60k.
 */
import type { LicenseStatus } from "../lib/license";
import {
  PRICE_BASIC_MONTHLY_ARS,
  PRICE_BASIC_ONETIME_ARS,
  PRICE_PRO_MONTHLY_ARS,
} from "./pricing";

export type PlanEntitlementKey =
  | "autoUpdates"
  | "catalogSuper"
  | "facturaIa"
  | "mercadoPago"
  | "whatsappDailyReport"
  | "printBranding"
  | "appearanceEdit"
  | "unlimitedStaff"
  | "tutorialLibrary"
  | "virtualAssist"
  | "invoicingArca"
  | "proModules"
  | "businessIntelligence";

export interface PlanEntitlements {
  autoUpdates: boolean;
  catalogSuper: boolean;
  facturaIa: boolean;
  mercadoPago: boolean;
  whatsappDailyReport: boolean;
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
  maxDevicesDefault: number;
  maxActiveStaff: number | null;
  upsellLabel: string;
}

const MONTHLY_STANDARD: PlanEntitlements = {
  autoUpdates: true,
  catalogSuper: true,
  facturaIa: true,
  mercadoPago: true,
  whatsappDailyReport: true,
  printBranding: true,
  appearanceEdit: true,
  unlimitedStaff: true,
  tutorialLibrary: true,
  virtualAssist: true,
  invoicingArca: false,
  proModules: false,
  businessIntelligence: true,
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
  whatsappDailyReport: false,
  printBranding: false,
  appearanceEdit: false,
  unlimitedStaff: false,
  tutorialLibrary: false,
  virtualAssist: false,
  invoicingArca: false,
  proModules: false,
  businessIntelligence: false,
  maxDevicesDefault: 1,
  maxActiveStaff: 2,
  upsellLabel: "Suscripción mensual",
};

const FREE: PlanEntitlements = {
  autoUpdates: true,
  catalogSuper: false,
  facturaIa: false,
  mercadoPago: false,
  whatsappDailyReport: false,
  printBranding: false,
  appearanceEdit: true,
  unlimitedStaff: false,
  tutorialLibrary: true,
  virtualAssist: true,
  invoicingArca: false,
  proModules: false,
  businessIntelligence: false,
  maxDevicesDefault: 1,
  maxActiveStaff: 2,
  upsellLabel: "Plan mensual",
};

const TRIAL: PlanEntitlements = {
  ...MONTHLY_PRO,
  maxDevicesDefault: 1,
  upsellLabel: "Plan Pro+",
};

export function resolvePlanEntitlements(
  status: Pick<LicenseStatus, "plan" | "billing" | "pro_enabled" | "is_trial" | "active"> | null,
): PlanEntitlements {
  if (!status?.active) return FREE;

  if (status.is_trial || status.billing === "trial" || status.plan === "trial") {
    return TRIAL;
  }

  if (status.plan === "free" || status.billing === "free") {
    return FREE;
  }

  if (status.billing === "perpetual") {
    return PERMANENT;
  }

  const isPro = status.pro_enabled || status.plan === "pro";
  if (status.billing === "monthly") {
    return isPro ? MONTHLY_PRO : MONTHLY_STANDARD;
  }

  // Sin billing claro: tratar como permanente si hay licencia paga (conservador).
  if (status.plan === "basic" || status.plan === "pro") {
    return isPro && status.billing !== "perpetual" ? MONTHLY_PRO : PERMANENT;
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
    whatsappDailyReport:
      "Enviar el resumen del día por WhatsApp está incluido en el plan mensual.",
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
    invoicingArca: "La facturación electrónica ARCA está en el plan Pro+.",
    proModules: "Los módulos Pro (taller, turnos, remitos) están en el plan Pro+.",
    businessIntelligence:
      "Inteligencia de Negocio está incluida en el plan mensual. Te ayuda a saber qué hacer hoy en tu negocio.",
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
