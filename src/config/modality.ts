/**
 * Modalidades de uso de WalQo (diseño cerrado 2026-11-17).
 * Etapa 4: la elección del alta se fija en licenses.modality al verificar (source=signup).
 * Gastronomía: solo Web (varios dispositivos: mozos, cajas, cocina).
 */

export type WalqoModality = "desktop" | "web";

/** Preferencia guardada en settings al crear la cuenta (local / DO). No es licencia. */
export const SIGNUP_MODALITY_SETTING = "signup_modality";

/** Rubros que no operan en Escritorio: van a walqo.pro/web. */
export const WEB_ONLY_RUBROS = ["gastronomia"] as const;

export type WebOnlyRubro = (typeof WEB_ONLY_RUBROS)[number];

export function isWebOnlyRubro(rubro: string | null | undefined): boolean {
  return !!rubro && (WEB_ONLY_RUBROS as readonly string[]).includes(rubro);
}

export const WEB_ONLY_RUBRO_MESSAGE =
  "Gastronomía funciona en WalQo Web (varios dispositivos: cajas, mozos y cocina). Abrí walqo.pro/web.";

export const MODALITY_LABEL: Record<WalqoModality, string> = {
  desktop: "Escritorio",
  web: "Web",
};

export function currentSurfaceModality(): WalqoModality {
  return import.meta.env.MODE === "web" ? "web" : "desktop";
}

export function parseModality(value: string | null | undefined): WalqoModality | null {
  if (value === "desktop" || value === "web") return value;
  return null;
}

/** Modalidad efectiva del alta: gastronomía siempre Web. */
export function signupModalityForRubro(
  rubro: string | null | undefined,
  chosen: WalqoModality,
): WalqoModality {
  return isWebOnlyRubro(rubro) ? "web" : chosen;
}

export const WINDOWS_DOWNLOAD_URL =
  "https://github.com/Walphur/gestion-comercios/releases/latest";

export const WALQO_WEB_URL = "https://walqo.pro/web/";
