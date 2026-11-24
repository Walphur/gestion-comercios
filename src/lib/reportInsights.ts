import { formatMoney, formatQty } from "./format";
import type { MoneyInflow } from "../db/moneyInflow";
import type {
  PeriodComparison,
  PeriodProfit,
  SalesByDayRow,
  SalesByHourRow,
  SalesByPaymentRow,
  TopProductRow,
} from "../db/reports";

export type InsightTone = "up" | "down" | "warn" | "info" | "trophy";

export interface ReportInsight {
  id: string;
  tone: InsightTone;
  text: string;
}

/** Observaciones determinísticas a partir de datos reales del período. Sin IA. */
export function buildReportInsights(input: {
  currency: string;
  periodLabel: string;
  totals: { count: number; total: number; avg_ticket: number };
  comparison: PeriodComparison | null;
  profit: PeriodProfit | null;
  inflow: MoneyInflow | null;
  top: TopProductRow[];
  byDay: SalesByDayRow[];
  byHour: SalesByHourRow[];
  byPay: SalesByPaymentRow[];
}): ReportInsight[] {
  const { currency, periodLabel, totals, comparison, profit, inflow, top, byDay, byHour, byPay } = input;
  const money = (n: number) => formatMoney(n, currency);
  const out: ReportInsight[] = [];

  if (totals.count === 0) {
    return [
      {
        id: "empty",
        tone: "info",
        text: `En ${periodLabel.toLowerCase()} no hay ventas registradas. Cuando cobres, acá vas a ver cómo viene el negocio.`,
      },
    ];
  }

  if (comparison && comparison.previous_total > 0) {
    const pct = comparison.change_pct;
    if (Math.abs(pct) >= 1) {
      out.push({
        id: "evolution",
        tone: pct >= 0 ? "up" : "down",
        text:
          pct >= 0
            ? `Las ventas subieron ${pct.toFixed(1)}% frente al período anterior (${money(comparison.previous_total)} → ${money(comparison.current_total)}).`
            : `Las ventas bajaron ${Math.abs(pct).toFixed(1)}% frente al período anterior (${money(comparison.previous_total)} → ${money(comparison.current_total)}).`,
      });
    }
  } else if (comparison && comparison.previous_total <= 0 && comparison.current_total > 0) {
    out.push({
      id: "evolution-new",
      tone: "up",
      text: `Hay ventas en este período (${money(comparison.current_total)}) y el anterior no tenía movimiento comparable.`,
    });
  }

  if (inflow && inflow.onAccount > 0.005) {
    out.push({
      id: "pending",
      tone: "warn",
      text: `Quedó a cuenta ${money(inflow.onAccount)} en ${inflow.onAccountCount} ${
        inflow.onAccountCount === 1 ? "venta" : "ventas"
      } a fiado (no entró plata).`,
    });
  }

  if (inflow && inflow.totalIn > 0 && totals.total > 0) {
    const ratio = (inflow.totalIn / totals.total) * 100;
    if (ratio < 70 && inflow.onAccount > 0) {
      out.push({
        id: "cash-gap",
        tone: "warn",
        text: `Solo entró el ${ratio.toFixed(0)}% de lo vendido (${money(inflow.totalIn)} de ${money(totals.total)}). El resto quedó a cuenta o se cobró después.`,
      });
    } else if (inflow.debtPayments > 0.005) {
      out.push({
        id: "debt-collected",
        tone: "info",
        text: `Se cobraron ${money(inflow.debtPayments)} de fiado viejo en ${inflow.debtPaymentsCount} ${
          inflow.debtPaymentsCount === 1 ? "cobro" : "cobros"
        }.`,
      });
    }
  }

  if (top[0] && top[0].total > 0) {
    const share = totals.total > 0 ? (top[0].total / totals.total) * 100 : 0;
    out.push({
      id: "top-product",
      tone: "trophy",
      text: `Más vendido: ${top[0].name} (${formatQty(top[0].qty)} · ${money(top[0].total)}${
        share >= 15 ? `, ${share.toFixed(0)}% del total` : ""
      }).`,
    });
  }

  if (byDay.length > 0) {
    const best = byDay.reduce((a, b) => (b.total > a.total ? b : a));
    if (best.total > 0) {
      out.push({
        id: "best-day",
        tone: "info",
        text: `El día más fuerte fue el ${best.day}: ${money(best.total)} en ${best.count} ${
          best.count === 1 ? "venta" : "ventas"
        }.`,
      });
    }
  }

  if (byHour.length > 0) {
    const bestH = byHour.reduce((a, b) => (b.total > a.total ? b : a));
    if (bestH.total > 0) {
      out.push({
        id: "best-hour",
        tone: "info",
        text: `Mayor actividad alrededor de las ${bestH.hour} (${money(bestH.total)}).`,
      });
    }
  }

  if (profit && profit.revenue > 0) {
    out.push({
      id: "margin",
      tone: profit.margin_pct >= 30 ? "up" : profit.margin_pct >= 10 ? "info" : "warn",
      text: `Margen estimado ${profit.margin_pct.toFixed(1)}% (ganancia ${money(profit.profit)} sobre ventas, con el costo cargado hoy; sin restar gastos del negocio).`,
    });
  }

  if (byPay.length > 0 && totals.total > 0) {
    const topPay = byPay[0];
    const share = (topPay.total / totals.total) * 100;
    if (share >= 40) {
      out.push({
        id: "pay-method",
        tone: "info",
        text: `El medio más usado fue ${topPay.payment_method.replace(/_/g, " ")} (${share.toFixed(0)}% · ${money(topPay.total)}).`,
      });
    }
  }

  if (totals.count >= 3 && totals.avg_ticket > 0 && comparison && comparison.previous_count >= 3) {
    const prevAvg =
      comparison.previous_count > 0 ? comparison.previous_total / comparison.previous_count : 0;
    if (prevAvg > 0) {
      const delta = ((totals.avg_ticket - prevAvg) / prevAvg) * 100;
      if (Math.abs(delta) >= 5) {
        out.push({
          id: "ticket",
          tone: delta >= 0 ? "up" : "down",
          text: `El ticket promedio ${delta >= 0 ? "subió" : "bajó"} ${Math.abs(delta).toFixed(1)}%: ${money(
            prevAvg,
          )} → ${money(totals.avg_ticket)}.`,
        });
      }
    }
  }

  return out.slice(0, 6);
}
