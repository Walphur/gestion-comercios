/** Contacto oficial Waltech — soporte, ventas y catálogo. */
export const SUPPORT_WHATSAPP = "5492665031950";

export const SUPPORT_WHATSAPP_DISPLAY = "+54 9 266 503-1950";

/** Grupo de comerciantes — precios, tips y novedades (Argentina). */
export const COMMUNITY_WHATSAPP_GROUP_URL =
  "https://chat.whatsapp.com/Bk6pxaPf88i6935zS9aP9u";

export const COMMUNITY_WHATSAPP_GROUP_LABEL = "Grupo comerciantes AR";

/** Publicar `docs/legal/*.html` en GitHub Pages (misma carpeta que oauth). */
export const LEGAL_BASE_URL = "https://walphur.github.io/gestion-comercios/legal";

export const SUPPORT_URL = `${LEGAL_BASE_URL}/soporte.html`;
export const HELP_CENTER_URL = `${LEGAL_BASE_URL}/ayuda.html`;
export const PRIVACY_POLICY_URL = `${LEGAL_BASE_URL}/privacidad.html`;
export const TERMS_URL = `${LEGAL_BASE_URL}/terminos.html`;

/** Herramientas web (GitHub Pages, carpeta docs/tools). */
export const TOOLS_BASE_URL = "https://walphur.github.io/gestion-comercios/tools";

/** Lectura de factura con IA → descarga CSV para importar en la app. */
export const FACTURA_IA_URL = `${TOOLS_BASE_URL}/factura-ia.html`;

export function supportWhatsAppMessage(topic = "soporte"): string {
  return `Hola! Necesito ayuda con Gestión Comercios (${topic}). Mi versión: [pegá la versión de la app].`;
}
