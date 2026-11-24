import { formatDateShort, shiftYmd, todayYmd } from "./format";
import { monthBounds } from "../db/expenses";
import type { ReportWindow } from "../db/reports";

/** Períodos del selector unificado de Reportes. */
export type ReportPeriodChoice =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "this_week"
  | "prev_week"
  | "this_month"
  | "prev_month"
  | "this_year"
  | "prev_year"
  | "custom";

export const REPORT_PERIOD_OPTIONS: { id: ReportPeriodChoice; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "last_7", label: "Últimos 7 días" },
  { id: "last_30", label: "Últimos 30 días" },
  { id: "this_week", label: "Esta semana" },
  { id: "prev_week", label: "Semana anterior" },
  { id: "this_month", label: "Este mes" },
  { id: "prev_month", label: "Mes anterior" },
  { id: "this_year", label: "Este año" },
  { id: "prev_year", label: "Año anterior" },
  { id: "custom", label: "Personalizado" },
];

/** Lunes de la semana local (YYYY-MM-DD) que contiene `ymd`. */
export function weekMonday(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  const day = d.getDay(); // 0=dom … 6=sáb
  const back = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - back);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function yearBounds(ymd: string): { from: string; to: string } {
  const y = ymd.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export function resolveReportPeriod(
  choice: ReportPeriodChoice,
  customFrom: string,
  customTo: string,
  today = todayYmd(),
): { range: { from: string; to: string }; baseWindow: ReportWindow; periodLabel: string } {
  if (choice === "today" || choice === "yesterday") {
    const day = choice === "today" ? today : shiftYmd(today, -1);
    const r = { from: day, to: day };
    return { range: r, baseWindow: r, periodLabel: choice === "today" ? "Hoy" : "Ayer" };
  }
  if (choice === "last_7") {
    const r = { from: shiftYmd(today, -6), to: today };
    return { range: r, baseWindow: r, periodLabel: "Últimos 7 días" };
  }
  if (choice === "last_30") {
    const r = { from: shiftYmd(today, -29), to: today };
    return { range: r, baseWindow: r, periodLabel: "Últimos 30 días" };
  }
  if (choice === "this_week") {
    const from = weekMonday(today);
    const r = { from, to: today };
    return { range: r, baseWindow: r, periodLabel: "Esta semana" };
  }
  if (choice === "prev_week") {
    const thisMon = weekMonday(today);
    const from = shiftYmd(thisMon, -7);
    const to = shiftYmd(thisMon, -1);
    const r = { from, to };
    return { range: r, baseWindow: r, periodLabel: "Semana anterior" };
  }
  if (choice === "this_month") {
    const r = { from: monthBounds(today).from, to: today };
    return { range: r, baseWindow: r, periodLabel: "Este mes" };
  }
  if (choice === "prev_month") {
    const r = monthBounds(shiftYmd(monthBounds(today).from, -1));
    return { range: r, baseWindow: r, periodLabel: "Mes anterior" };
  }
  if (choice === "this_year") {
    const y = yearBounds(today);
    const r = { from: y.from, to: today };
    return { range: r, baseWindow: r, periodLabel: "Este año" };
  }
  if (choice === "prev_year") {
    const y = Number(today.slice(0, 4)) - 1;
    const r = { from: `${y}-01-01`, to: `${y}-12-31` };
    return { range: r, baseWindow: r, periodLabel: "Año anterior" };
  }
  // custom
  const [from, to] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
  const r = { from: from || today, to: to || today };
  return {
    range: r,
    baseWindow: r,
    periodLabel: `Del ${formatDateShort(r.from)} al ${formatDateShort(r.to)}`,
  };
}
