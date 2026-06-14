import { SUPPORT_WHATSAPP } from "./support";

/** Mismo WhatsApp que soporte — catálogo super incluido en la suscripción mensual. */
export const CATALOG_SALES_WHATSAPP = SUPPORT_WHATSAPP;

export function catalogSupportWhatsAppMessage(): string {
  return [
    "Hola! Uso Gestión Comercios con suscripción activa.",
    "Necesito ayuda para importar el catálogo de supermercado (+200.000 productos) incluido en mi plan.",
    "¿Me pasás el CSV o me guían en Productos → Importar?",
  ].join("\n");
}

/** @deprecated Usar catalogSupportWhatsAppMessage */
export const catalogSalesWhatsAppMessage = catalogSupportWhatsAppMessage;
