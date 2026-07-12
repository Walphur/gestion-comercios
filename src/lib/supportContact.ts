import { resolveAppVersion } from "./appVersion";
import { getMachineId } from "./license";
import { openExternalUrl, openWhatsApp } from "./openExternal";
import { COMMUNITY_WHATSAPP_GROUP_URL, HELP_CENTER_URL, SUPPORT_WHATSAPP } from "../config/support";

export async function openSupportWhatsApp(topic = "soporte"): Promise<void> {
  const [version, machineId] = await Promise.all([
    resolveAppVersion().catch(() => "—"),
    getMachineId().catch(() => "—"),
  ]);
  const message = [
    `Hola! Necesito ${topic} con Gestión Comercios.`,
    `Versión: v${version}`,
    `ID PC: ${machineId.slice(0, 16)}…`,
  ].join("\n");
  const { copied } = await openWhatsApp(SUPPORT_WHATSAPP, message);
  if (copied) {
    alert("El mensaje se copió. Pegalo en WhatsApp al abrir el chat.");
  }
}

/** Botón «Asistencia virtual» → WhatsApp de Waltech con datos de la PC. */
export function openVirtualAssist(): Promise<void> {
  return openSupportWhatsApp("asistencia virtual");
}

/** Ventas / plan mensual — desde la prueba gratuita o pantalla de activación. */
export async function openSalesWhatsApp(): Promise<void> {
  const version = await resolveAppVersion().catch(() => "—");
  const message = [
    "Hola! Estoy probando Gestión Comercios y me interesa contratar el plan mensual.",
    `Versión: v${version}`,
  ].join("\n");
  const { copied } = await openWhatsApp(SUPPORT_WHATSAPP, message);
  if (copied) {
    alert("El mensaje se copió. Pegalo en WhatsApp al abrir el chat.");
  }
}

export function openHelpCenter(): void {
  void openExternalUrl(HELP_CENTER_URL);
}

/** Grupo de WhatsApp — comerciantes AR, precios y novedades. */
export function openCommunityGroup(): void {
  void openExternalUrl(COMMUNITY_WHATSAPP_GROUP_URL);
}
