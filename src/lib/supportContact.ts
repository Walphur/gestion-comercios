import { resolveAppVersion } from "./appVersion";
import { getMachineId } from "./license";
import { openExternalUrl, openWhatsApp } from "./openExternal";
import { HELP_CENTER_URL, SUPPORT_WHATSAPP } from "../config/support";

export async function openSupportWhatsApp(topic = "soporte"): Promise<void> {
  const [version, machineId] = await Promise.all([
    resolveAppVersion().catch(() => "—"),
    getMachineId().catch(() => "—"),
  ]);
  const message = [
    `Hola! Necesito ayuda con Gestión Comercios (${topic}).`,
    `Versión: v${version}`,
    `ID PC: ${machineId.slice(0, 16)}…`,
  ].join("\n");
  const { copied } = await openWhatsApp(SUPPORT_WHATSAPP, message);
  if (copied) {
    alert("El mensaje se copió. Pegalo en WhatsApp al abrir el chat.");
  }
}

export function openHelpCenter(): void {
  void openExternalUrl(HELP_CENTER_URL);
}
