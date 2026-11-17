/** Modalidad activa de una licencia (PC vs WalQo Web). NULL = sin enforcement. */

export type WalqoModality = "desktop" | "web";
export type ModalitySource = "signup" | "admin" | "inferred_safe" | "manual_review";

export function isPermanentPaid(license: {
  billing_type?: string | null;
  plan?: string | null;
}): boolean {
  return (license.billing_type ?? "") === "perpetual" && license.plan !== "free";
}

/** Permanente siempre desktop. Si modality es null, no hay bloqueo. */
export function effectiveModality(license: {
  modality?: string | null;
  billing_type?: string | null;
  plan?: string | null;
}): WalqoModality | null {
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
 * machineId que empieza con `web-` = superficie web.
 */
export function modalityGate(
  license: {
    modality?: string | null;
    billing_type?: string | null;
    plan?: string | null;
  },
  surface: WalqoModality,
): { message: string } | null {
  const mod = effectiveModality(license);
  if (!mod || mod === surface) return null;
  return { message: modalityBlockedMessage(surface, mod) };
}

export function surfaceFromMachineId(machineId: string): WalqoModality {
  return machineId.startsWith("web-") ? "web" : "desktop";
}
