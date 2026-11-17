/**
 * Motor de renovación por meses calendario (America/Argentina/Buenos_Aires).
 *
 * Reglas definitivas:
 * A) Paga antes del vencimiento → ancla = vencimiento actual (conserva días).
 * B) Paga el día del vencimiento → ancla = ese vencimiento.
 * C) Paga después → ancla = vencimiento anterior (no desde el día de pago).
 * D) Varios períodos → se acumulan consecutivamente sobre el mismo día ancla.
 *
 * Fin de mes: si el día ancla no existe en el mes destino, se usa el último día
 * de ese mes. El día preferido (1–31) se guarda en la licencia para evitar
 * que 31 ene → 28 feb → 28 mar (debe ser 31 mar).
 *
 * Casos de aceptación (billingCalendar.test.ts):
 * 1. 2026-11-10 + 1 mes → 2026-12-10
 * 2. Atraso: vence 2026-11-10, paga 2026-11-17, 1 mes → 2026-12-10
 * 3. Prematuro: vence 2026-12-10, paga 2026-11-17, 1 mes → 2027-01-10
 * 4. 2026-01-31 + 1 mes → 2026-02-28
 * 5. 2024-01-31 + 1 mes → 2024-02-29 (bisiesto)
 * 6. 2026-01-31 +1 → 2026-02-28; +1 más con día ancla 31 → 2026-03-31
 * 7. Trimestral: 2026-11-10 + 3 meses → 2027-02-10
 * 8. Anual: 2026-11-10 + 12 meses → 2027-11-10
 * 9. Sin vencimiento previo + pago 2026-11-17 + 1 mes → 2026-12-17
 * 10. 2 períodos mensuales desde 2026-11-10 → 2027-01-10
 * 11. Parcial / permanente: no llaman a este motor (manejados en handleAdminPay)
 */

export type PeriodUnit = "month" | "quarter" | "year";

export type RenewalInput = {
  /** ISO o YYYY-MM-DD del vencimiento actual (puede estar en el pasado). */
  previousExpires: string | null | undefined;
  /** Cantidad de unidades (1 = un período). */
  periods: number;
  unit: PeriodUnit;
  /** Fecha de pago / ahora, solo si no hay previousExpires. */
  paidAt?: string | null;
  /** Día preferido 1–31 guardado en la licencia (anti-deriva fin de mes). */
  billingAnchorDay?: number | null;
  /** Reloj de referencia (tests). */
  now?: Date;
};

export type RenewalResult = {
  previous_expires_at: string | null;
  new_expires_at: string;
  period_start: string;
  period_end: string;
  periods: number;
  period_unit: PeriodUnit;
  months_added: number;
  anchor_ymd: string;
  /** Día 1–31 a persistir en licenses.billing_anchor_day. */
  billing_anchor_day: number;
};

const ART = "America/Argentina/Buenos_Aires";

/** Día civil ART de un instante ISO. */
export function artYmd(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) throw new Error("Fecha inválida");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ART,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Fin del día ART (23:59:59.999) como ISO UTC. */
export function endOfArtDayIso(ymd: string): string {
  const [y, m, day] = ymd.split("-").map(Number);
  // 23:59:59.999 ART = 02:59:59.999 UTC del día siguiente (UTC−3).
  const utc = Date.UTC(y, m - 1, day + 1, 2, 59, 59, 999);
  return new Date(utc).toISOString();
}

/** Inicio del día ART (00:00:00.000) como ISO UTC. */
export function startOfArtDayIso(ymd: string): string {
  const [y, m, day] = ymd.split("-").map(Number);
  // 00:00 ART = 03:00 UTC mismo día.
  return new Date(Date.UTC(y, m - 1, day, 3, 0, 0, 0)).toISOString();
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function clampDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.floor(day)));
}

/**
 * Desde el año-mes de `fromYmd`, suma `months` y aplica `preferredDay`
 * (o el día de fromYmd si no se pasa), clamp al último día del mes destino.
 */
export function addCalendarMonths(
  fromYmd: string,
  months: number,
  preferredDay?: number | null,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd)) {
    throw new Error(`YMD inválido: ${fromYmd}`);
  }
  if (!Number.isInteger(months) || months < 0) {
    throw new Error("months debe ser un entero ≥ 0");
  }
  const [y0, m0, d0] = fromYmd.split("-").map(Number);
  const day = clampDay(preferredDay ?? d0);
  const total = y0 * 12 + (m0 - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const d = Math.min(day, daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function monthsForUnit(unit: PeriodUnit): number {
  if (unit === "quarter") return 3;
  if (unit === "year") return 12;
  return 1;
}

/**
 * Resuelve el nuevo vencimiento según las reglas A–D.
 * Si hay previousExpires (vigente o vencido), siempre ancla ahí.
 * Solo si no hay vencimiento previo, ancla en paidAt/now.
 */
export function resolveRenewalExpiry(input: RenewalInput): RenewalResult {
  const periods = Math.max(1, Math.floor(Number(input.periods) || 1));
  const monthsPer = monthsForUnit(input.unit);
  const monthsAdded = periods * monthsPer;
  const now = input.now ?? new Date();

  let previous: string | null = null;
  let fromYmd: string;
  let billingDay: number;

  if (input.previousExpires) {
    const prev = new Date(input.previousExpires);
    if (Number.isNaN(prev.getTime())) throw new Error("previousExpires inválido");
    previous = prev.toISOString();
    fromYmd = artYmd(prev);
    billingDay = clampDay(input.billingAnchorDay ?? Number(fromYmd.slice(8, 10)));
  } else {
    const paid = input.paidAt ? new Date(input.paidAt) : now;
    if (Number.isNaN(paid.getTime())) throw new Error("paidAt inválido");
    fromYmd = artYmd(paid);
    billingDay = clampDay(input.billingAnchorDay ?? Number(fromYmd.slice(8, 10)));
  }

  const newYmd = addCalendarMonths(fromYmd, monthsAdded, billingDay);
  const newExpires = endOfArtDayIso(newYmd);
  const periodStart = previous
    ? startOfArtDayIso(artYmd(previous))
    : startOfArtDayIso(fromYmd);

  return {
    previous_expires_at: previous,
    new_expires_at: newExpires,
    period_start: periodStart,
    period_end: newExpires,
    periods,
    period_unit: input.unit,
    months_added: monthsAdded,
    anchor_ymd: fromYmd,
    billing_anchor_day: billingDay,
  };
}

/** Preview sin escribir: mismos inputs que un pago completo. */
export function previewRenewal(input: RenewalInput): RenewalResult {
  return resolveRenewalExpiry(input);
}
