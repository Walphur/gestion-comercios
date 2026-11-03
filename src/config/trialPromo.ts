/**
 * Promo Cyber: la prueba empezada dentro de la ventana dura 30 días en vez de 7.
 * La PC la aplica en src-tauri/src/license.rs y el servidor en workers/license-api (mismas fechas).
 */
export const TRIAL_BASE_DAYS = 7;

export const TRIAL_PROMO = {
  name: "Promo Cyber",
  /** 02/11/2026 00:00 hora de Argentina. */
  startsAt: "2026-11-02T03:00:00Z",
  /** 08/11/2026 23:59:59 hora de Argentina. */
  endsAt: "2026-11-09T02:59:59Z",
  days: 30,
  lastDayLabel: "domingo 8/11",
} as const;

const PROMO_START_MS = Date.parse(TRIAL_PROMO.startsAt);
const PROMO_END_MS = Date.parse(TRIAL_PROMO.endsAt);

export function isTrialPromoActive(atMs: number = Date.now()): boolean {
  return atMs >= PROMO_START_MS && atMs <= PROMO_END_MS;
}

/** Días de prueba según cuándo empezó (o empezaría) la prueba. */
export function trialLengthDays(startedAtMs: number = Date.now()): number {
  return isTrialPromoActive(startedAtMs) ? Math.max(TRIAL_PROMO.days, TRIAL_BASE_DAYS) : TRIAL_BASE_DAYS;
}
