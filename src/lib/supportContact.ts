import { resolveAppVersion } from "./appVersion";
import { getLicenseStatus, getMachineId } from "./license";
import { openExternalUrl, openWhatsApp } from "./openExternal";
import { getSetting } from "../db/settings";
import { COMMUNITY_WHATSAPP_GROUP_URL, HELP_CENTER_URL, SUPPORT_WHATSAPP } from "../config/support";

export interface SupportContext {
  businessName?: string | null;
  userName?: string | null;
}

function planLabel(status: Awaited<ReturnType<typeof getLicenseStatus>>): string {
  if (status.is_trial) return "Prueba";
  if (status.billing === "perpetual") return "Permanente";
  if (status.plan === "pro") return "Pro+ mensual";
  if (status.plan === "basic" || status.billing === "monthly") return "Mensual";
  if (status.plan === "free") return "Gratis";
  return status.plan || "—";
}

export async function openSupportWhatsApp(
  topic = "soporte",
  ctx?: SupportContext,
): Promise<void> {
  const [version, machineId, license, storedBusiness] = await Promise.all([
    resolveAppVersion().catch(() => "—"),
    getMachineId().catch(() => "—"),
    getLicenseStatus().catch(() => null),
    getSetting("business_name").catch(() => null),
  ]);

  const business = (ctx?.businessName || storedBusiness || "—").trim() || "—";
  const userName = ctx?.userName?.trim();

  const lines = [`Hola! Necesito ${topic} con WalQo.`, `Negocio: ${business}`];
  if (userName) lines.push(`Usuario: ${userName}`);
  if (license) {
    lines.push(`Plan: ${planLabel(license)}`);
    if (license.key_mask) lines.push(`Licencia: ${license.key_mask}`);
  }
  lines.push(`Versión: v${version}`);
  lines.push(`ID PC: ${machineId.slice(0, 20)}${machineId.length > 20 ? "…" : ""}`);

  const { copied } = await openWhatsApp(SUPPORT_WHATSAPP, lines.join("\n"));
  if (copied) {
    alert("El mensaje se copió. Pegalo en WhatsApp al abrir el chat.");
  }
}

/** Asistencia → WhatsApp Waltech con datos del negocio y licencia. */
export function openVirtualAssist(ctx?: SupportContext): Promise<void> {
  return openSupportWhatsApp("asistencia", ctx);
}

export async function openSalesWhatsApp(extraLine?: string): Promise<void> {
  const [version, businessName, license] = await Promise.all([
    resolveAppVersion().catch(() => "—"),
    getSetting("business_name").catch(() => null),
    getLicenseStatus().catch(() => null),
  ]);
  const message = [
    extraLine?.trim() ||
      "Hola! Estoy probando WalQo y me interesa contratar el plan mensual.",
    `Negocio: ${(businessName || "—").trim() || "—"}`,
    license ? `Plan actual: ${planLabel(license)}` : null,
    `Versión: v${version}`,
  ]
    .filter(Boolean)
    .join("\n");
  const { copied } = await openWhatsApp(SUPPORT_WHATSAPP, message);
  if (copied) {
    alert("El mensaje se copió. Pegalo en WhatsApp al abrir el chat.");
  }
}

export function openHelpCenter(): void {
  void openExternalUrl(HELP_CENTER_URL);
}

export function openCommunityGroup(): void {
  void openExternalUrl(COMMUNITY_WHATSAPP_GROUP_URL);
}
