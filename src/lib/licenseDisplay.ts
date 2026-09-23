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

/** Alertas de suscripción / prueba para el banner del comerciante. */
export function subscriptionAlert(status: LicenseStatus | null): SubscriptionAlert | null {
  if (!status?.active) return null;

  if (status.is_trial || status.billing === "trial") {
    const days = status.trial_days_left ?? status.days_until_expiry;
    if (days == null) return null;
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
    if (days <= 3) {
      return {
        level: "warn",
        message: `Te quedan ${days} días de prueba Pro.`,
      };
    }
    return {
      level: "info",
      message: `Prueba Pro · ${days} días restantes.`,
    };
  }

  if (status.billing !== "monthly") return null;
  const days = status.days_until_expiry;
  if (days == null) return null;

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
  if (days <= 3) {
    return {
      level: "critical",
      message: `Atención: tu suscripción vence en ${days} días. Renová para no interrumpir el servicio.`,
    };
  }
  if (days <= 7) {
    return {
      level: "warn",
      message: `Tu suscripción vence en ${days} días. Contactá a Waltech para renovar.`,
    };
  }
  return {
    level: "info",
    message: `Suscripción activa · ${days} días restantes.`,
  };
}

/** @deprecated Prefer subscriptionAlert for level-aware UI. */
export function subscriptionWarning(status: LicenseStatus | null): string | null {
  return subscriptionAlert(status)?.message ?? null;
}
