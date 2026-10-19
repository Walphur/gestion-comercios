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
  kind: "trial" | "monthly";
  /** Días que faltan; null si ya venció. */
  daysLeft: number | null;
}

/** Desde cuántos días antes se avisa que vence el plan o la prueba. */
export const SUBSCRIPTION_NOTICE_DAYS = 7;

/**
 * Aviso de arriba: la prueba Pro o el plan mensual vencen en 7 días o menos,
 * o el plan mensual se acaba de vencer (WalQo pasó al plan gratis).
 */
export function subscriptionAlert(status: LicenseStatus | null): SubscriptionAlert | null {
  if (!status?.active) return null;

  if (status.is_trial || status.billing === "trial") {
    const days = Math.max(status.trial_days_left ?? status.days_until_expiry ?? 99, 0);
    if (days > SUBSCRIPTION_NOTICE_DAYS) return null;
    const message =
      days === 0
        ? "Hoy es el último día de tu prueba Pro."
        : days === 1
          ? "Te queda 1 día de prueba Pro."
          : `Te quedan ${days} días de prueba Pro.`;
    return { kind: "trial", daysLeft: days, level: days <= 1 ? "critical" : days <= 3 ? "warn" : "info", message };
  }

  if (status.billing === "free" && /suscripción venció/i.test(status.message ?? "")) {
    return {
      kind: "monthly",
      daysLeft: null,
      level: "critical",
      message: "Tu plan venció y seguís en el plan gratis, con límites. Renovalo para volver a tener todo.",
    };
  }

  if (status.billing !== "monthly") return null;
  const days = status.days_until_expiry;
  if (days == null || days > SUBSCRIPTION_NOTICE_DAYS) return null;
  const date = status.expires_at ? ` (el ${formatExpiryDate(status.expires_at)})` : "";
  const message =
    days <= 0
      ? "Tu plan vence hoy. Renovalo para no quedarte con el plan gratis."
      : days === 1
        ? `Tu plan vence mañana${date}.`
        : `Tu plan vence en ${days} días${date}.`;
  return { kind: "monthly", daysLeft: Math.max(days, 0), level: days <= 3 ? "critical" : "warn", message };
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
