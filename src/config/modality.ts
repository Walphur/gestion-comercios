/**
 * Modalidades de uso de WalQo (diseño cerrado 2026-11-17).
 * Etapa 1: solo copy + preferencia local en el alta. Sin enforcement de backend.
 */

export type WalqoModality = "desktop" | "web";

/** Preferencia guardada en settings al crear la cuenta (local / DO). No es licencia. */
export const SIGNUP_MODALITY_SETTING = "signup_modality";

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

export const WINDOWS_DOWNLOAD_URL =
  "https://github.com/Walphur/gestion-comercios/releases/latest";

export const WALQO_WEB_URL = "https://walqo.pro/web/";
