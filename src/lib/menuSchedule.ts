/**
 * Disponibilidad por horario del menú del día (`products.menu_schedule`).
 * No es happy hour ni lista de precios: solo “se puede pedir ahora”.
 *
 * JSON: `{ "days": number[], "from": "HH:MM", "to": "HH:MM" }`
 * `days`: 0=domingo … 6=sábado (mismo que `Date.getDay()` y el form gastro).
 * Zona: reloj local del dispositivo del comercio (Desktop o Web).
 */

export type MenuSchedule = {
  days: number[];
  from: string;
  to: string;
};

export type MenuScheduleAvailability = {
  /** Se puede vender / mostrar como pedible. */
  available: boolean;
  /** Config inválida o ausente: no ocultamos el producto. */
  invalid: boolean;
  /** Tiene programación aplicada (días + rango válidos). */
  scheduled: boolean;
  /** Texto corto para UI (español). */
  label: string | null;
};

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseMenuSchedule(raw: string | null | undefined): MenuSchedule | null {
  if (raw == null || !String(raw).trim()) return null;
  try {
    const j = JSON.parse(String(raw)) as Partial<MenuSchedule>;
    if (!j || typeof j !== "object") return null;
    const days = Array.isArray(j.days)
      ? j.days.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
      : [];
    const from = typeof j.from === "string" ? j.from.trim() : "";
    const to = typeof j.to === "string" ? j.to.trim() : "";
    if (!days.length || !TIME_RE.test(from) || !TIME_RE.test(to)) return null;
    return { days: [...new Set(days)].sort((a, b) => a - b), from, to };
  } catch {
    return null;
  }
}

/** Minutos desde 00:00; null si el string no es HH:MM válido. */
export function parseTimeToMinutes(hhmm: string): number | null {
  const m = TIME_RE.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * ¿`nowMin` cae dentro de [from, to)?
 * Inclusivo en `from`, exclusivo en `to` (evita doble venta en el borde superior).
 * Si from === to → ventana vacía (nunca disponible por horario).
 * Si cruza medianoche (from > to): disponible si now >= from OR now < to.
 */
export function isTimeWithinRange(nowMin: number, fromMin: number, toMin: number): boolean {
  if (fromMin === toMin) return false;
  if (fromMin < toMin) {
    return nowMin >= fromMin && nowMin < toMin;
  }
  // Cruza medianoche: ej. 22:00–02:00
  return nowMin >= fromMin || nowMin < toMin;
}

function formatRangeLabel(from: string, to: string): string {
  return `${from}–${to}`;
}

/**
 * Evalúa disponibilidad. Sin schedule o schedule inválido → available (no ocultar).
 * Solo aplica lógica si hay JSON válido (típico: menú del día con horario).
 */
export function evaluateMenuSchedule(
  raw: string | null | undefined,
  now: Date = new Date(),
): MenuScheduleAvailability {
  if (raw == null || !String(raw).trim()) {
    return { available: true, invalid: false, scheduled: false, label: null };
  }
  const schedule = parseMenuSchedule(raw);
  if (!schedule) {
    return {
      available: true,
      invalid: true,
      scheduled: false,
      label: "Horario de carta inválido — se vende igual",
    };
  }
  const fromMin = parseTimeToMinutes(schedule.from);
  const toMin = parseTimeToMinutes(schedule.to);
  if (fromMin == null || toMin == null) {
    return {
      available: true,
      invalid: true,
      scheduled: false,
      label: "Horario de carta inválido — se vende igual",
    };
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const range = formatRangeLabel(schedule.from, schedule.to);
  const today = now.getDay();
  const yesterday = (today + 6) % 7;

  let available = false;
  if (fromMin < toMin) {
    // Ventana mismo día.
    available = schedule.days.includes(today) && isTimeWithinRange(nowMin, fromMin, toMin);
  } else if (fromMin > toMin) {
    // Cruza medianoche: tramo nocturno cuenta el día de apertura; madrugada, el de ayer.
    if (nowMin >= fromMin) {
      available = schedule.days.includes(today);
    } else if (nowMin < toMin) {
      available = schedule.days.includes(yesterday);
    } else {
      available = false;
    }
  }
  // from === to → nunca (ya cubierto por isTimeWithinRange / rama vacía)

  if (available) {
    return {
      available: true,
      invalid: false,
      scheduled: true,
      label: `Disponible ${range}`,
    };
  }
  const dayListed =
    fromMin > toMin
      ? schedule.days.includes(today) || schedule.days.includes(yesterday)
      : schedule.days.includes(today);
  if (!dayListed) {
    return {
      available: false,
      invalid: false,
      scheduled: true,
      label: `Fuera de día · horario ${range}`,
    };
  }
  return {
    available: false,
    invalid: false,
    scheduled: true,
    label: `Fuera de horario (${range})`,
  };
}

/** Atajo para productos con `menu_schedule` (menú del día u otros con JSON). */
export function isProductAvailableByMenuSchedule(
  product: { menu_schedule?: string | null },
  now: Date = new Date(),
): MenuScheduleAvailability {
  return evaluateMenuSchedule(product.menu_schedule ?? null, now);
}
