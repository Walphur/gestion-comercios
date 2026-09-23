import type { LicenseStatus } from "./license";

export function billingLabel(billing: string): string {
  if (billing === "monthly") return "Suscripción mensual";
  if (billing === "perpetual") return "Licencia permanente";
  if (billing === "trial") return "Prueba de 7 días";
  if (billing === "free") return "Plan gratis";
  return "Sin plan";
}

export function formatExpiryDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export type SubscriptionAlertLevel = "info" | "warn" | "critical";

export interface SubscriptionAlert {
  message: string;
  level: SubscriptionAlertLevel;
}

/**
 * Banner superior: solo cuando quedan 3, 2, 1 o 0 días (o venció).
 * Los días restantes en el resto del período se muestran en Sistema POS.
 */
export function subscriptionAlert(status: LicenseStatus | null): SubscriptionAlert | null {
  if (!status?.active) return null;

  if (status.is_trial || status.billing === "trial") {
    const days = status.trial_days_left ?? status.days_until_expiry;
    if (days == null || days > 3) return null;
    if (days <= 0) {
      return {
        level: "critical",
        message:
          "Tu prueba Pro terminó. Segís en plan gratis con límites, o activá Estándar / Pro+.",
      };
    }
    if (days === 1) {
      return {
        level: "critical",
        message: "Último día de prueba Pro. Después pasás a plan gratis (o activá una licencia).",
      };
    }
    return {
      level: "warn",
      message: `Te quedan ${days} días de prueba Pro.`,
    };
  }

  if (status.billing !== "monthly") return null;
  const days = status.days_until_expiry;
  if (days == null || days > 3) return null;

  if (days <= 0) {
    return {
      level: "critical",
      message: "Tu suscripción venció. Renová o seguí en plan gratis con límites.",
    };
  }
  if (days === 1) {
    return {
      level: "critical",
      message:
        "Tu suscripción vence mañana. Renová hoy para no perder actualizaciones ni funciones.",
    };
  }
  return {
    level: "critical",
    message: `Atención: tu suscripción vence en ${days} días. Renová para no interrumpir el servicio.`,
  };
}

/** Texto corto de días restantes para el bloque Sistema POS del sidebar. */
export function subscriptionSidebarDays(status: LicenseStatus | null): string | null {
  if (!status?.active) return null;

  if (status.is_trial || status.billing === "trial") {
    const days = status.trial_days_left ?? status.days_until_expiry;
    if (days == null) return null;
    if (days <= 0) return "Prueba vencida";
    if (days === 1) return "Prueba · 1 día";
    return `Prueba · ${days} días`;
  }

  if (status.billing === "monthly") {
    const days = status.days_until_expiry;
    if (days == null) return null;
    if (days <= 0) return "Suscripción vencida";
    if (days === 1) return "1 día restante";
    return `${days} días restantes`;
  }

  if (status.billing === "perpetual") return "Licencia permanente";
  if (status.billing === "free") return "Plan gratis";
  return null;
}

/** @deprecated Prefer subscriptionAlert for level-aware UI. */
export function subscriptionWarning(status: LicenseStatus | null): string | null {
  return subscriptionAlert(status)?.message ?? null;
}
