/**
 * Promos de prueba: la prueba empezada dentro de la ventana dura `days` en vez de 7.
 * Mismas fechas que src/config/trialPromo.ts y src-tauri/src/license.rs.
 */
export const TRIAL_BASE_DAYS = 7;

export const TRIAL_PROMOS = [
  { name: "Promo Cyber", startsAt: "2026-11-02T03:00:00Z", endsAt: "2026-11-09T02:59:59Z", days: 30 },
  { name: "Promo Fin de Año", startsAt: "2026-11-09T03:00:00Z", endsAt: "2027-01-01T02:59:59Z", days: 30 },
] as const;

export function trialPromoAt(startedAtMs: number): (typeof TRIAL_PROMOS)[number] | null {
  return (
    TRIAL_PROMOS.find((p) => startedAtMs >= Date.parse(p.startsAt) && startedAtMs <= Date.parse(p.endsAt)) ?? null
  );
}

export function isTrialPromo(startedAtMs: number): boolean {
  return trialPromoAt(startedAtMs) != null;
}

export function trialLengthDays(startedAtMs: number): number {
  const promo = trialPromoAt(startedAtMs);
  return promo ? Math.max(promo.days, TRIAL_BASE_DAYS) : TRIAL_BASE_DAYS;
}

export function trialExpiresAtSec(startedAtMs: number): number {
  return Math.floor((startedAtMs + trialLengthDays(startedAtMs) * 86_400_000) / 1000);
}
