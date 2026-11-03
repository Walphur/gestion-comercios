/**
 * Promo Cyber: la prueba empezada dentro de la ventana dura 30 días en vez de 7.
 * Mismas fechas que src/config/trialPromo.ts y src-tauri/src/license.rs.
 */
export const TRIAL_BASE_DAYS = 7;

export const TRIAL_PROMO = {
  name: "Promo Cyber",
  startsAt: "2026-11-02T03:00:00Z",
  endsAt: "2026-11-09T02:59:59Z",
  days: 30,
} as const;

const PROMO_START_MS = Date.parse(TRIAL_PROMO.startsAt);
const PROMO_END_MS = Date.parse(TRIAL_PROMO.endsAt);

export function isTrialPromo(startedAtMs: number): boolean {
  return startedAtMs >= PROMO_START_MS && startedAtMs <= PROMO_END_MS;
}

export function trialLengthDays(startedAtMs: number): number {
  return isTrialPromo(startedAtMs) ? Math.max(TRIAL_PROMO.days, TRIAL_BASE_DAYS) : TRIAL_BASE_DAYS;
}

export function trialExpiresAtSec(startedAtMs: number): number {
  return Math.floor((startedAtMs + trialLengthDays(startedAtMs) * 86_400_000) / 1000);
}
