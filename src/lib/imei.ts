/** Deja solo el código: sin espacios, guiones ni barras. */
export function normalizeUnitCode(raw: string): string {
  return raw.replace(/[\s\-/.]/g, "").trim().toUpperCase();
}

export function looksLikeImei(code: string): boolean {
  return /^\d{15}$/.test(code);
}

/** Dígito verificador de Luhn (el que usa el IMEI). */
export function luhnValid(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < code.length; i++) {
    let d = Number(code[code.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export type UnitCodeCheck = "ok" | "imei_bad_check" | "imei_bad_length" | "empty";

export function checkUnitCode(code: string, kind: "imei" | "serial"): UnitCodeCheck {
  if (!code) return "empty";
  if (kind === "serial") return "ok";
  if (!looksLikeImei(code)) return "imei_bad_length";
  return luhnValid(code) ? "ok" : "imei_bad_check";
}

export function unitCodeWarning(check: UnitCodeCheck): string | null {
  if (check === "imei_bad_length") return "El IMEI tiene 15 números. Revisalo o cargalo como número de serie.";
  if (check === "imei_bad_check") return "Este IMEI no pasa la verificación. Revisá que esté bien escrito.";
  return null;
}

export function addMonthsYmd(fromYmd: string, months: number): string {
  const [y, m, d] = fromYmd.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${mm}-${dd}`;
}

/** Días que faltan hasta la fecha (negativo si ya pasó). */
export function daysUntilYmd(ymd: string, todayYmdValue: string): number {
  const [y1, m1, d1] = todayYmdValue.split("-").map(Number);
  const [y2, m2, d2] = ymd.slice(0, 10).split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

export const UNIT_CONDITION_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  usado: "Usado",
  reacondicionado: "Reacondicionado",
};

export const UNIT_STATUS_LABELS: Record<string, string> = {
  in_stock: "En stock",
  reserved: "Reservada",
  sold: "Vendida",
  returned: "Devuelta / en garantía",
  cancelled: "Anulada",
};
