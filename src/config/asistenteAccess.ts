import type { PlanEntitlementKey } from "./planEntitlements";
import { resolvePlanEntitlements } from "./planEntitlements";
import type { LicenseStatus } from "../lib/license";

/**
 * Acceso a /asistente: requiere rubro `reports` + entitlement `businessIntelligence`.
 * No alcanza con ocultar el sidebar.
 */
export function canAccessAsistente(input: {
  reportsFeature: boolean;
  businessIntelligence: boolean;
}): { allowed: boolean; blockedBy: "reports_feature" | "businessIntelligence" | null } {
  if (!input.reportsFeature) {
    return { allowed: false, blockedBy: "reports_feature" };
  }
  if (!input.businessIntelligence) {
    return { allowed: false, blockedBy: "businessIntelligence" };
  }
  return { allowed: true, blockedBy: null };
}

export function canAccessAsistenteForLicense(
  status: Pick<LicenseStatus, "plan" | "billing" | "pro_enabled" | "is_trial" | "active"> | null,
  reportsFeature = true,
): { allowed: boolean; blockedBy: "reports_feature" | "businessIntelligence" | null } {
  const ents = resolvePlanEntitlements(status);
  return canAccessAsistente({
    reportsFeature,
    businessIntelligence: ents.businessIntelligence,
  });
}

export const ASISTENTE_ENTITLEMENT: PlanEntitlementKey = "businessIntelligence";
