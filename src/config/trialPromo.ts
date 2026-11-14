/**
 * Promos de prueba: la prueba empezada dentro de la ventana dura `days` en vez de 7.
 * La PC las aplica en src-tauri/src/license.rs y el servidor en workers/license-api (mismas fechas).
 */
export const TRIAL_BASE_DAYS = 7;

export interface TrialPromo {
  name: string;
  startsAt: string;
  endsAt: string;
  days: number;
  lastDayLabel: string;
  /** Descuento del primer mes al contratar después de una prueba de la promo. */
  firstMonthOffPct: number;
}

export const TRIAL_PROMOS: readonly TrialPromo[] = [
  {
    name: "Promo Cyber",
    /** 02/11/2026 00:00 a 08/11/2026 23:59:59, hora de Argentina. */
    startsAt: "2026-11-02T03:00:00Z",
    endsAt: "2026-11-09T02:59:59Z",
    days: 30,
    lastDayLabel: "domingo 8/11",
    firstMonthOffPct: 0,
  },
  {
    name: "Promo Fin de Año",
    /** 09/11/2026 00:00 a 31/12/2026 23:59:59, hora de Argentina. */
    startsAt: "2026-11-09T03:00:00Z",
    endsAt: "2027-01-01T02:59:59Z",
    days: 30,
    lastDayLabel: "31/12",
    firstMonthOffPct: 50,
  },
];

/** La promo de la que se habla ahora (la última de la lista). */
export const TRIAL_PROMO = TRIAL_PROMOS[TRIAL_PROMOS.length - 1];

export function trialPromoAt(atMs: number = Date.now()): TrialPromo | null {
  return TRIAL_PROMOS.find((p) => atMs >= Date.parse(p.startsAt) && atMs <= Date.parse(p.endsAt)) ?? null;
}

export function isTrialPromoActive(atMs: number = Date.now()): boolean {
  return trialPromoAt(atMs) != null;
}

/** Días de prueba según cuándo empezó (o empezaría) la prueba. */
export function trialLengthDays(startedAtMs: number = Date.now()): number {
  const promo = trialPromoAt(startedAtMs);
  return promo ? Math.max(promo.days, TRIAL_BASE_DAYS) : TRIAL_BASE_DAYS;
}

export function trialPromoName(startedAtMs: number): string | null {
  return trialPromoAt(startedAtMs)?.name ?? null;
}

export function promoByName(name: string | null | undefined): TrialPromo | null {
  return TRIAL_PROMOS.find((p) => p.name === name) ?? null;
}

/** Días que le quedan a la promo vigente (0 el último día); null si no hay. */
export function promoDaysLeft(atMs: number = Date.now()): number | null {
  const promo = trialPromoAt(atMs);
  if (!promo) return null;
  return Math.max(0, Math.floor((Date.parse(promo.endsAt) - atMs) / 86_400_000));
}

/**
 * Descuento del primer mes que le toca a este comercio: por la prueba que hizo en la promo
 * o, sin prueba, por contratar mientras la promo corre.
 */
export function firstMonthOffer(
  trialPromo: string | null | undefined,
  atMs: number = Date.now(),
): { promo: TrialPromo; pct: number } | null {
  const promo = promoByName(trialPromo) ?? trialPromoAt(atMs);
  return promo && promo.firstMonthOffPct > 0 ? { promo, pct: promo.firstMonthOffPct } : null;
}

export function priceWithOff(monthly: number, pct: number): number {
  return Math.round((monthly * (100 - pct)) / 100);
}
