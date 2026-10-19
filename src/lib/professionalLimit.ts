import { getDb } from "../db";
import { DEVICES_BASIC_MONTHLY, isSalonRubro } from "../config/pricing";
import { confirmAction } from "./confirm";
import type { LicenseStatus } from "./license";
import { openSalesWhatsApp } from "./supportContact";

/** WalQo Completo en peluquería/estética: hasta 2 profesionales activos. */
export const COMPLETO_MAX_PROFESSIONALS = 2;

/**
 * Licencia Pro del paquete de $35.000: Pro mensual con hasta 2 PCs.
 * El Pro de $60.000 sale con 3 PCs; la prueba y la permanente no entran.
 */
export function isCompletoProLicense(status: LicenseStatus | null | undefined): boolean {
  if (!status?.active || status.is_trial) return false;
  return (
    status.plan === "pro" &&
    status.billing === "monthly" &&
    status.max_devices > 0 &&
    status.max_devices <= DEVICES_BASIC_MONTHLY
  );
}

/** Tope de profesionales activos, o null si no hay tope. */
export function professionalLimitFor(
  rubroId: string,
  status: LicenseStatus | null | undefined,
): number | null {
  return isSalonRubro(rubroId) && isCompletoProLicense(status) ? COMPLETO_MAX_PROFESSIONALS : null;
}

async function countActiveProfessionals(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM workshop_resources WHERE active = 1",
  );
  return Number(rows[0]?.n ?? 0);
}

/** Antes de dar de alta un profesional. Si llegó al tope, avisa y ofrece WhatsApp de ventas. */
export async function canAddProfessional(
  rubroId: string,
  status: LicenseStatus | null | undefined,
): Promise<boolean> {
  const limit = professionalLimitFor(rubroId, status);
  if (limit == null) return true;
  if ((await countActiveProfessionals()) < limit) return true;
  const wantsPro = await confirmAction({
    title: "Llegaste al tope de profesionales",
    message: `Con WalQo Completo podés tener hasta ${limit} profesionales. Para más, pasate a Pro.`,
    variant: "default",
    confirmLabel: "Escribir por WhatsApp",
    cancelLabel: "Ahora no",
  });
  if (wantsPro) {
    await openSalesWhatsApp(
      "Hola! Tengo WalQo Completo y quiero pasar a Pro para sumar más profesionales.",
    );
  }
  return false;
}
