import { getPeriodProfit, getPeriodTotals, type PeriodProfit } from "../db/reports";
import { getExpenseSummary, type ExpenseSummary } from "../db/expenses";
import { getMoneyInflow, type MoneyInflow } from "../db/moneyInflow";
import { getSetting } from "../db/settings";
import { formatMoney, todayYmd } from "./format";
import type { PrintableTable } from "./prints/reportDocument";
import { openWhatsApp, openWhatsAppShare } from "./openExternal";

export interface DailySummary {
  ymd: string;
  dateLabel: string;
  count: number;
  total: number;
  avgTicket: number;
  inflow: MoneyInflow;
  expenses: ExpenseSummary;
  /** Solo para quien ve ganancias. */
  profit: PeriodProfit | null;
}

/** Lo de hoy, de todas las cajas. */
export async function loadDailySummary(withProfit: boolean): Promise<DailySummary> {
  const ymd = todayYmd();
  const window = { from: ymd, to: ymd };
  const [totals, inflow, expenses, profit] = await Promise.all([
    getPeriodTotals(window, "consolidado"),
    getMoneyInflow(window, "consolidado"),
    getExpenseSummary(ymd, ymd),
    withProfit ? getPeriodProfit(window, "consolidado") : Promise.resolve(null),
  ]);
  return {
    ymd,
    dateLabel: new Date().toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    count: totals.count,
    total: totals.total,
    avgTicket: totals.avg_ticket,
    inflow,
    expenses,
    profit,
  };
}

export function buildDailySummaryMessage(businessName: string, currency: string, s: DailySummary): string {
  const money = (n: number) => formatMoney(n, currency);
  const lines = [
    `Resumen del dia - ${businessName}`,
    s.dateLabel,
    "",
    `Ventas: ${s.count}`,
    `Total vendido: ${money(s.total)}`,
  ];
  if (s.count > 0) lines.push(`Ticket promedio: ${money(s.avgTicket)}`);

  if (s.inflow.places.length > 0) {
    lines.push("", "Donde entro la plata:");
    for (const p of s.inflow.places) {
      const detail = p.lines.map((l) => `${l.label} ${money(l.total)}`).join(", ");
      const single = p.lines.length === 1 && !p.lines[0].fromDebt && p.lines[0].label === p.label;
      lines.push(`- ${p.label}: ${money(p.total)}${single ? "" : ` (${detail})`}`);
    }
    lines.push(`Total que entro: ${money(s.inflow.totalIn)}`);
  }
  if (s.inflow.onAccount > 0) {
    lines.push(`Quedo a cuenta (fiado): ${money(s.inflow.onAccount)}`);
  }
  if (s.expenses.total > 0) lines.push(`Gastos: ${money(s.expenses.total)}`);
  if (s.profit) lines.push(`Ganancia estimada: ${money(s.profit.profit)}`);

  lines.push("", "Walqo - Waltech");
  return lines.join("\n");
}

/** Tabla de «¿Dónde entró la plata?» para imprimir: la cuenta y debajo cada medio. */
export function inflowPrintTable(inflow: MoneyInflow, currency: string): PrintableTable {
  const money = (n: number) => formatMoney(n, currency);
  const rows: string[][] = [];
  for (const p of inflow.places) {
    rows.push([p.label, "", "", money(p.total)]);
    for (const l of p.lines) rows.push(["", l.label, String(l.count), money(l.total)]);
  }
  rows.push(["Total que entró", "", "", money(inflow.totalIn)]);
  if (inflow.onAccount > 0) {
    rows.push(["Quedó a cuenta (fiado)", "", String(inflow.onAccountCount), money(inflow.onAccount)]);
  }
  return {
    heading: "¿Dónde entró la plata?",
    columns: [{ label: "Cuenta" }, { label: "Medio" }, { label: "Cant.", num: true }, { label: "Total", num: true }],
    rows,
  };
}

/** Al WhatsApp del comercio si está cargado; si no, WhatsApp abre para elegir el chat. */
export async function shareDailySummary(message: string): Promise<{ copied: boolean }> {
  const phone = (await getSetting("print_whatsapp"))?.trim();
  if (phone) {
    try {
      const r = await openWhatsApp(phone, message);
      return { copied: r.copied };
    } catch {
      /* si el número falla, cae al share genérico */
    }
  }
  return openWhatsAppShare(message);
}
