import { formatMoney, formatQty } from "./format";
import type { MoneyInflow } from "../db/moneyInflow";
import type {
  PeriodComparison,
  PeriodProfit,
  SalesByDayRow,
  SalesByHourRow,
  SalesByPaymentRow,
  TopProductRow,
  VoidedSalesSummary,
} from "../db/reports";

export type InsightTone = "up" | "down" | "warn" | "info" | "trophy";

export interface ReportInsight {
  id: string;
  tone: InsightTone;
  /** Título corto. */
  title: string;
  /** Descripción con contexto. */
  description: string;
  /** Valor que respalda la observación (texto ya formateado). */
  value?: string;
  /** Tab o ruta relativa para profundizar. */
  actionTab?: string;
  actionLabel?: string;
}

/** Observaciones determinísticas a partir de datos reales del período. Sin IA. */
export function buildReportInsights(input: {
  currency: string;
  periodLabel: string;
  totals: { count: number; total: number; avg_ticket: number };
  comparison: PeriodComparison | null;
  profit: PeriodProfit | null;
  expensesTotal?: number;
  inflow: MoneyInflow | null;
  top: TopProductRow[];
  byDay: SalesByDayRow[];
  byHour: SalesByHourRow[];
  byPay: SalesByPaymentRow[];
  voided?: VoidedSalesSummary | null;
  unitsSold?: number;
}): ReportInsight[] {
  const {
    currency,
    periodLabel,
    totals,
    comparison,
    profit,
    expensesTotal = 0,
    inflow,
    top,
    byDay,
    byHour,
    byPay,
    voided,
    unitsSold,
  } = input;
  const money = (n: number) => formatMoney(n, currency);
  const out: ReportInsight[] = [];

  if (totals.count === 0) {
    return [
      {
        id: "empty",
        tone: "info",
        title: "Sin ventas en el período",
        description: `En ${periodLabel.toLowerCase()} no hay ventas registradas. Cuando cobres, acá vas a ver cómo viene el negocio.`,
      },
    ];
  }

  if (comparison && comparison.previous_total > 0) {
    const pct = comparison.change_pct;
    if (Math.abs(pct) >= 1) {
      out.push({
        id: "evolution",
        tone: pct >= 0 ? "up" : "down",
        title: pct >= 0 ? "Las ventas subieron" : "Las ventas bajaron",
        description: `Respecto del período anterior comparable (${money(comparison.previous_total)} → ${money(comparison.current_total)}).`,
        value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
        actionTab: "daily",
        actionLabel: "Ver por día",
      });
    }
  } else if (comparison && comparison.previous_total <= 0 && comparison.current_total > 0) {
    out.push({
      id: "evolution-new",
      tone: "up",
      title: "Primer movimiento comparable",
      description: `Hay ventas en este período y el anterior no tenía movimiento.`,
      value: money(comparison.current_total),
    });
  }

  if (inflow && inflow.onAccount > 0.005) {
    out.push({
      id: "pending",
      tone: "warn",
      title: "Cuentas pendientes",
      description: `${inflow.onAccountCount} ${
        inflow.onAccountCount === 1 ? "venta" : "ventas"
      } a fiado no ingresaron plata en el período.`,
      value: money(inflow.onAccount),
      actionTab: "debtors",
      actionLabel: "Ver deudores",
    });
  }

  if (inflow && inflow.totalIn > 0 && totals.total > 0) {
    const ratio = (inflow.totalIn / totals.total) * 100;
    if (ratio < 70 && inflow.onAccount > 0) {
      out.push({
        id: "cash-gap",
        tone: "warn",
        title: "Poco cobrado vs vendido",
        description: `Solo entró el ${ratio.toFixed(0)}% de lo vendido. El resto quedó a cuenta o se cobró después.`,
        value: `${money(inflow.totalIn)} de ${money(totals.total)}`,
        actionTab: "payments",
        actionLabel: "Ver cobranzas",
      });
    } else if (inflow.debtPayments > 0.005) {
      out.push({
        id: "debt-collected",
        tone: "info",
        title: "Cobros de fiado viejo",
        description: `${inflow.debtPaymentsCount} ${
          inflow.debtPaymentsCount === 1 ? "cobro" : "cobros"
        } de deudas anteriores.`,
        value: money(inflow.debtPayments),
        actionTab: "payments",
        actionLabel: "Ver medios",
      });
    }
  }

  if (top[0] && top[0].total > 0) {
    const share = totals.total > 0 ? (top[0].total / totals.total) * 100 : 0;
    out.push({
      id: "top-product",
      tone: "trophy",
      title: "Producto más fuerte",
      description: `${top[0].name} · ${formatQty(top[0].qty)} unid.${
        share >= 15 ? ` · ${share.toFixed(0)}% del total` : ""
      }`,
      value: money(top[0].total),
      actionTab: "products",
      actionLabel: "Ver productos",
    });
  }

  if (byDay.length > 0) {
    const best = byDay.reduce((a, b) => (b.total > a.total ? b : a));
    const worst = byDay.reduce((a, b) => (b.total < a.total ? b : a));
    if (best.total > 0) {
      out.push({
        id: "best-day",
        tone: "info",
        title: "Mejor día",
        description: `${best.day} · ${best.count} ${best.count === 1 ? "venta" : "ventas"}`,
        value: money(best.total),
        actionTab: "daily",
        actionLabel: "Ver días",
      });
    }
    if (byDay.length >= 2 && worst.day !== best.day && worst.total < best.total) {
      out.push({
        id: "weak-day",
        tone: "info",
        title: "Día más flojo",
        description: `${worst.day} · ${worst.count} ${worst.count === 1 ? "venta" : "ventas"}`,
        value: money(worst.total),
        actionTab: "daily",
      });
    }
  }

  if (byHour.length > 0) {
    const bestH = byHour.reduce((a, b) => (b.total > a.total ? b : a));
    if (bestH.total > 0) {
      out.push({
        id: "best-hour",
        tone: "info",
        title: "Horario pico",
        description: `Mayor actividad alrededor de las ${bestH.hour}.`,
        value: money(bestH.total),
        actionTab: "hours",
        actionLabel: "Ver por hora",
      });
    }
  }

  if (profit && profit.revenue > 0) {
    const partial = profit.cost <= 0.005;
    out.push({
      id: "margin",
      tone: partial ? "warn" : profit.margin_pct >= 30 ? "up" : profit.margin_pct >= 10 ? "info" : "warn",
      title: partial ? "Margen parcial" : "Margen bruto estimado",
      description: partial
        ? "Faltan costos cargados en productos; el margen no es confiable."
        : `Ganancia bruta ${money(profit.profit)} sobre ventas (costo actual; sin restar gastos).`,
      value: `${profit.margin_pct.toFixed(1)}%`,
      actionTab: "result",
      actionLabel: "Ver resultado",
    });
  }

  if (profit && expensesTotal > 0.005) {
    const result = profit.profit - expensesTotal;
    const prevHint = expensesTotal > profit.profit;
    out.push({
      id: "expenses-vs-margin",
      tone: prevHint ? "warn" : "info",
      title: prevHint ? "Gastos altos vs margen" : "Resultado después de gastos",
      description: prevHint
        ? `Los gastos del período (${money(expensesTotal)}) superan la ganancia bruta estimada.`
        : `Margen ${money(profit.profit)} menos gastos ${money(expensesTotal)}.`,
      value: money(result),
      actionTab: "result",
      actionLabel: "Ver resultado",
    });
  }

  if (voided && voided.count > 0) {
    out.push({
      id: "voided",
      tone: "warn",
      title: "Anulaciones",
      description: `${voided.count} ${voided.count === 1 ? "venta anulada" : "ventas anuladas"} en el período (no entran en el neto).`,
      value: money(voided.total),
    });
  }

  if (byPay.length > 0 && totals.total > 0) {
    const topPay = byPay[0];
    const share = (topPay.total / totals.total) * 100;
    if (share >= 40) {
      out.push({
        id: "pay-method",
        tone: "info",
        title: "Medio dominante",
        description: `${topPay.payment_method.replace(/_/g, " ")} concentra buena parte de las ventas.`,
        value: `${share.toFixed(0)}% · ${money(topPay.total)}`,
        actionTab: "payments",
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
          title: delta >= 0 ? "Ticket promedio subió" : "Ticket promedio bajó",
          description: `${money(prevAvg)} → ${money(totals.avg_ticket)}`,
          value: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`,
        });
      }
    }
  }

  if (unitsSold != null && unitsSold > 0 && totals.count > 0) {
    // Solo como refuerzo si hay pocos insights
    if (out.length < 4) {
      out.push({
        id: "units",
        tone: "info",
        title: "Unidades vendidas",
        description: `${formatQty(unitsSold)} unidades en ${totals.count} operaciones.`,
        value: formatQty(unitsSold),
        actionTab: "products",
      });
    }
  }

  // Priorizar: evolution, pending, cash-gap, expenses, top, ticket, voided…
  const priority = [
    "evolution",
    "evolution-new",
    "pending",
    "cash-gap",
    "expenses-vs-margin",
    "voided",
    "ticket",
    "margin",
    "top-product",
    "best-day",
    "best-hour",
    "pay-method",
    "debt-collected",
    "weak-day",
    "units",
  ];
  out.sort((a, b) => {
    const ia = priority.indexOf(a.id);
    const ib = priority.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return out.slice(0, 6);
}
