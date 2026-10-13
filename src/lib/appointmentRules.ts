/** Reglas de un turno: profesional habilitado, horario del local y superposición. */

export type StaffVerdict = "ok" | "missing-staff" | "not-allowed" | "need-resource";

export function resourceAllowed(
  allowed: number[] | null,
  resourceId: number | null,
  explicit: boolean,
): StaffVerdict {
  if (!allowed) return "ok";
  if (allowed.length === 0) return explicit ? "missing-staff" : "ok";
  if (!resourceId) return "need-resource";
  return allowed.includes(resourceId) ? "ok" : "not-allowed";
}

export function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && endA > startB;
}

export function sameResource(
  idA: number | null | undefined,
  nameA: string | null | undefined,
  idB: number | null | undefined,
  nameB: string | null | undefined,
): boolean {
  if (idA && idB) return idA === idB;
  const left = (nameA ?? "").trim();
  const right = (nameB ?? "").trim();
  return Boolean(left && right && left === right);
}

function minutesOf(value: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function inside(startMin: number, endMin: number, open: string, close: string): boolean {
  const openMin = minutesOf(open);
  const closeMin = minutesOf(close);
  if (openMin == null || closeMin == null) return false;
  return startMin >= openMin && endMin <= closeMin;
}

/** Sin horario cargado, no se bloquea. Con horario, el turno tiene que entrar en un turno del día. */
export function slotInsideHours(start: string, end: string, hoursJson: string | null | undefined): boolean {
  if (!hoursJson?.trim()) return true;
  let data: {
    days?: number[];
    open?: string;
    close?: string;
    open2?: string;
    close2?: string;
    byDay?: Record<string, { open?: string; close?: string; open2?: string; close2?: string }>;
  };
  try {
    data = JSON.parse(hoursJson) as typeof data;
  } catch {
    return true;
  }
  if (!Array.isArray(data.days) || !data.open || !data.close) return true;
  const when = new Date(start.replace(" ", "T"));
  if (Number.isNaN(when.getTime())) return false;
  const day = when.getDay();
  if (!data.days.includes(day)) return false;
  const special = data.byDay?.[String(day)];
  const open = special?.open || data.open;
  const close = special?.close || data.close;
  const open2 = special?.open2 || data.open2;
  const close2 = special?.close2 || data.close2;
  const startMin = minutesOf(start.slice(11, 16));
  const endMin = minutesOf(end.slice(11, 16));
  if (startMin == null || endMin == null || endMin <= startMin) return false;
  if (inside(startMin, endMin, open, close)) return true;
  if (open2 && close2 && inside(startMin, endMin, open2, close2)) return true;
  return false;
}
