/**
 * SLA de cocina (KDS): tiempo objetivo vs demora.
 * Usa products.duration_min (minutos de preparación) cuando está cargado.
 */

export type KitchenSlaTone = "ontime" | "delayed" | "very_delayed";

/** Si el producto no tiene duración, la cocina usa este objetivo (minutos). */
export const DEFAULT_KDS_TARGET_MIN = 15;

export function parseKitchenTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso.replace(" ", "T")).getTime();
  return Number.isFinite(t) ? t : null;
}

export function elapsedMinutes(createdAt: string, now: number): number {
  const t = parseKitchenTime(createdAt);
  if (t == null) return 0;
  return Math.max(0, (now - t) / 60_000);
}

/** Objetivo del ticket: el plato más lento de la comanda (max duration_min). */
export function ticketTargetMin(
  items: { duration_min?: number | null }[],
): number | null {
  let max = 0;
  for (const item of items) {
    const d = item.duration_min;
    if (d != null && d > 0 && d > max) max = Math.round(d);
  }
  return max > 0 ? max : null;
}

export function effectiveTargetMin(targetMin: number | null | undefined): number {
  return targetMin != null && targetMin > 0 ? targetMin : DEFAULT_KDS_TARGET_MIN;
}

/**
 * a tiempo: debajo del objetivo
 * demorado: llegó o pasó el objetivo, hasta 1,5×
 * muy demorado: 1,5× el objetivo o más
 */
export function kitchenSlaTone(
  elapsedMin: number,
  targetMin: number | null | undefined,
): KitchenSlaTone {
  const target = effectiveTargetMin(targetMin);
  if (elapsedMin < target) return "ontime";
  if (elapsedMin < target * 1.5) return "delayed";
  return "very_delayed";
}

export function kitchenSlaLabel(tone: KitchenSlaTone): string {
  if (tone === "delayed") return "Demorado";
  if (tone === "very_delayed") return "Muy demorado";
  return "A tiempo";
}

export function formatKitchenAge(elapsedMin: number): string {
  const min = Math.floor(elapsedMin);
  if (min < 1) return "<1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const KDS_MUTE_KEY = "walqo_kds_mute";

export function isKdsMuted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KDS_MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setKdsMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (muted) window.localStorage.setItem(KDS_MUTE_KEY, "1");
    else window.localStorage.removeItem(KDS_MUTE_KEY);
  } catch {
    /* private mode */
  }
}

/** Sonido de cocina / salón: respeta mute KDS y prefers-reduced-motion. */
export function kitchenAlertSoundAllowed(opts?: { ignoreMute?: boolean }): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if (!opts?.ignoreMute && isKdsMuted()) return false;
  return true;
}
