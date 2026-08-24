import { resolvePlanEntitlements } from "./planEntitlements";
import { canAccessAsistente, canAccessAsistenteForLicense } from "./asistenteAccess";

export function selfTestAsistenteAccess(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  const matrix: Array<{
    label: string;
    status: Parameters<typeof resolvePlanEntitlements>[0];
    expectBi: boolean;
    expectRoute: boolean;
  }> = [
    {
      label: "FREE",
      status: { active: false, plan: "free", billing: "free", pro_enabled: false, is_trial: false },
      expectBi: false,
      expectRoute: false,
    },
    {
      label: "PERMANENT",
      status: { active: true, plan: "basic", billing: "perpetual", pro_enabled: false, is_trial: false },
      expectBi: false,
      expectRoute: false,
    },
    {
      label: "TRIAL",
      status: { active: true, plan: "pro", billing: "trial", pro_enabled: true, is_trial: true },
      expectBi: true,
      expectRoute: true,
    },
    {
      label: "STANDARD",
      status: { active: true, plan: "basic", billing: "monthly", pro_enabled: false, is_trial: false },
      expectBi: true,
      expectRoute: true,
    },
    {
      label: "PRO+",
      status: { active: true, plan: "pro", billing: "monthly", pro_enabled: true, is_trial: false },
      expectBi: true,
      expectRoute: true,
    },
  ];

  for (const row of matrix) {
    const ents = resolvePlanEntitlements(row.status);
    if (ents.businessIntelligence !== row.expectBi) {
      errors.push(`${row.label}: businessIntelligence=${ents.businessIntelligence} esperado ${row.expectBi}`);
    }
    const access = canAccessAsistenteForLicense(row.status, true);
    if (access.allowed !== row.expectRoute) {
      errors.push(`${row.label}: ruta allowed=${access.allowed} esperado ${row.expectRoute}`);
    }
    if (!row.expectRoute && access.blockedBy !== "businessIntelligence") {
      errors.push(`${row.label}: blockedBy=${access.blockedBy}`);
    }
  }

  const noReports = canAccessAsistente({ reportsFeature: false, businessIntelligence: true });
  if (noReports.allowed || noReports.blockedBy !== "reports_feature") {
    errors.push("reports_feature debe bloquear aunque haya BI");
  }

  return { ok: errors.length === 0, errors };
}
