/** Contacto oficial Waltech — soporte, ventas y catálogo. */
export const SUPPORT_WHATSAPP = "5492665031950";

export const SUPPORT_WHATSAPP_DISPLAY = "+54 9 266 503-1950";

/** Publicar `docs/legal/*.html` en GitHub Pages (misma carpeta que oauth). */
export const LEGAL_BASE_URL = "https://walphur.github.io/gestion-comercios/legal";

export const SUPPORT_URL = `${LEGAL_BASE_URL}/soporte.html`;
export const HELP_CENTER_URL = `${LEGAL_BASE_URL}/ayuda.html`;
export const PRIVACY_POLICY_URL = `${LEGAL_BASE_URL}/privacidad.html`;
export const TERMS_URL = `${LEGAL_BASE_URL}/terminos.html`;

export function supportWhatsAppMessage(topic = "soporte"): string {
  return `Hola! Necesito ayuda con Gestión Comercios (${topic}). Mi versión: [pegá la versión de la app].`;
}
