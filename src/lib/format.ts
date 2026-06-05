export function formatMoney(value: number, currency = "$"): string {
  return `${currency} ${value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatQty(value: number): string {
  return Number.isInteger(value)
    ? value.toString()
    : value.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

const UNIT_SHORT: Record<string, string> = {
  unidad: "u.",
  unidades: "u.",
  kg: "kg",
  kilogramo: "kg",
  g: "g",
  gramo: "g",
  bolsa: "bolsa",
  saco: "saco",
  servicio: "serv.",
  práctica: "práct.",
  sesión: "ses.",
  juego: "juego",
  litro: "L",
  litros: "L",
  ml: "ml",
  pack: "pack",
  caja: "caja",
};

export function formatUnitShort(unit: string): string {
  const key = unit.trim().toLowerCase();
  return UNIT_SHORT[key] ?? (unit.length > 6 ? unit.slice(0, 5) + "." : unit);
}

export function formatDateShort(iso: string): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/** Hora local desde datetime SQLite `YYYY-MM-DD HH:mm:ss`. */
export function formatTime(iso: string): string {
  if (!iso || iso.length < 16) return "—";
  return iso.slice(11, 16);
}

export function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
