import type { LicenseStatus } from "./license";

export function billingLabel(billing: string): string {
  if (billing === "monthly") return "Suscripción mensual";
  if (billing === "perpetual") return "Licencia permanente";
  if (billing === "trial") return "Prueba de 7 días";
  return "Sin plan";
}

export function formatExpiryDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function subscriptionWarning(status: LicenseStatus | null): string | null {
  if (!status?.active) return null;

  if (status.is_trial || status.billing === "trial") {
    const days = status.trial_days_left ?? status.days_until_expiry;
    if (days == null) return null;
    if (days <= 0) {
      return "Tu prueba de 7 días terminó. Activá tu licencia para seguir usando la app.";
    }
    if (days === 1) {
      return "Último día de prueba gratuita. Activá tu licencia para no quedarte sin acceso.";
    }
    if (days <= 3) {
      return `Te quedan ${days} días de prueba gratuita. Activá tu licencia cuando quieras continuar.`;
    }
    return `Estás en prueba gratuita · ${days} días restantes.`;
  }

  if (status.billing !== "monthly") return null;
  const days = status.days_until_expiry;
  if (days == null) return null;
  if (days <= 0) return "Tu suscripción venció. Renová por WhatsApp para seguir usando la app.";
  if (days <= 7) return `Tu suscripción vence en ${days} día(s). Contactá a Waltech para renovar.`;
  return null;
}
