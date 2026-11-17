/** Modalidad activa de una licencia (PC vs WalQo Web). NULL = sin enforcement. */

export type WalqoModality = "desktop" | "web";
export type ModalitySource = "signup" | "admin" | "inferred_safe" | "manual_review";

/** Rubros que solo operan en WalQo Web (misma lista que src/config/modality.ts). */
export const WEB_ONLY_RUBROS = ["gastronomia"] as const;

export function isWebOnlyRubro(rubro: string | null | undefined): boolean {
  return !!rubro && (WEB_ONLY_RUBROS as readonly string[]).includes(rubro);
}

export const WEB_ONLY_RUBRO_MESSAGE =
  "Gastronomía funciona en WalQo Web (varios dispositivos: cajas, mozos y cocina). Abrí walqo.pro/web.";

export function isPermanentPaid(license: {
  billing_type?: string | null;
  plan?: string | null;
}): boolean {
  return (license.billing_type ?? "") === "perpetual" && license.plan !== "free";
}

/**
 * Rubro web-only → siempre web (también si es Permanente).
 * Permanente sin rubro web-only → desktop.
 * Si modality es null, no hay bloqueo por modalidad sola.
 */
export function effectiveModality(
  license: {
    modality?: string | null;
    billing_type?: string | null;
    plan?: string | null;
  },
  rubro?: string | null,
): WalqoModality | null {
  if (isWebOnlyRubro(rubro)) return "web";
  if (isPermanentPaid(license)) return "desktop";
  if (license.modality === "desktop" || license.modality === "web") return license.modality;
  return null;
}

export function parseModality(raw: unknown): WalqoModality | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "" || raw === "null") return null;
  if (raw === "desktop" || raw === "web") return raw;
  return undefined;
}

export function modalityBlockedMessage(surface: WalqoModality, modality: WalqoModality): string {
  if (surface === "desktop" && modality === "web") {
    return "Esta licencia está en modalidad Web. Abrí WalQo en walqo.pro/web.";
  }
  return "Esta licencia está en modalidad Escritorio. Usá la app de Windows.";
}

/**
 * null = ok. Si modality está fijada y no coincide con la superficie, mensaje de error.
 * Rubro web-only bloquea Escritorio aunque modality sea null.
 */
export function modalityGate(
  license: {
    modality?: string | null;
    billing_type?: string | null;
    plan?: string | null;
  },
  surface: WalqoModality,
  rubro?: string | null,
): { message: string; code?: string } | null {
  if (isWebOnlyRubro(rubro) && surface === "desktop") {
    return { message: WEB_ONLY_RUBRO_MESSAGE, code: "WEB_ONLY_RUBRO" };
  }
  const mod = effectiveModality(license, rubro);
  if (!mod || mod === surface) return null;
  return { message: modalityBlockedMessage(surface, mod) };
}

export function surfaceFromMachineId(machineId: string): WalqoModality {
  return machineId.startsWith("web-") || machineId.startsWith("walqo-web") ? "web" : "desktop";
}

/** Modalidad a fijar en el alta según rubro. */
export function signupModalityForRubro(
  rubro: string | null | undefined,
  chosen: WalqoModality | null | undefined,
): WalqoModality {
  if (isWebOnlyRubro(rubro)) return "web";
  return chosen === "desktop" || chosen === "web" ? chosen : "desktop";
}
