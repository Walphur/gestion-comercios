import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AlertTriangle,
  Banknote,
  BarChart3,
  Clock,
  CreditCard,
  Info,
  Package,
  Receipt,
  ReceiptText,
  Scale,
  Sparkles,
  Trophy,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Card, Button, EmptyState } from "../ui";
import MoneyInflowCard from "./MoneyInflowCard";
import EvolutionChart from "./charts/EvolutionChart";
import DonutChart, { donutColor } from "./charts/DonutChart";
import { ReportIcon, ReportIconBadge } from "./ReportIcon";
import { formatMoney, formatQty } from "../../lib/format";
import { formatPaymentMethod } from "../../lib/paymentLabels";
import { buildReportInsights, type InsightTone } from "../../lib/reportInsights";
import type { MoneyInflow } from "../../db/moneyInflow";
import type {
  PeriodComparison,
  PeriodProfit,
  SalesByDayRow,
  SalesByEmployeeRow,
  SalesByHourRow,
  SalesByPaymentRow,
  TopProductRow,
  VoidedSalesSummary,
} from "../../db/reports";

interface Props {
  currency: string;
  periodLabel: string;
  scopeLabel: string;
  cashierName: string | null;
  totals: { count: number; total: number; avg_ticket: number };
  comparison: PeriodComparison | null;
  profit: PeriodProfit | null;
  showProfit: boolean;
  expensesTotal: number;
  inflow: MoneyInflow | null;
  inflowNotes: string[];
  byDay: SalesByDayRow[];
  collectedByDay: SalesByDayRow[];
  byPay: SalesByPaymentRow[];
  byEmployee: SalesByEmployeeRow[];
  byHour: SalesByHourRow[];
  top: TopProductRow[];
  voided: VoidedSalesSummary | null;
  unitsSold: number;
  debtorsCount: number;
  onOpenTab: (tab: string) => void;
  onOpenResult: () => void;
  onOpenDebtors: () => void;
  onOpenPayments: () => void;
  onOpenProducts: () => void;
  onOpenHours: () => void;
  features: { customers: boolean; expenses: boolean };
}

const TONE_ICON: Record<InsightTone, typeof TrendingUp> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  warn: AlertTriangle,
  info: Info,
  trophy: Trophy,
};

const TONE_CLASS: Record<InsightTone, string> = {
  up: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10",
  down: "text-rose-600 dark:text-rose-300 bg-rose-500/10",
  warn: "text-amber-700 dark:text-amber-300 bg-amber-500/10",
  info: "text-brand-600 dark:text-brand-300 bg-brand-500/10",
  trophy: "text-amber-700 dark:text-amber-200 bg-amber-500/15",
};

function formatDayShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso.slice(5);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? m[2]}`;
}

function Sparkline({ values, tone = "brand" }: { values: number[]; tone?: "brand" | "green" | "amber" | "rose" | "blue" }) {
  if (values.length < 2) return null;
  const w = 64;
  const h = 22;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke =
    tone === "green"
      ? "var(--color-emerald-500, #10b981)"
      : tone === "rose"
        ? "var(--color-rose-500, #f43f5e)"
        : tone === "amber"
          ? "var(--color-amber-500, #f59e0b)"
          : tone === "blue"
            ? "var(--color-sky-500, #0ea5e9)"
            : "var(--color-brand-500)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-5 w-16 shrink-0 opacity-80" aria-hidden>
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={pts} />
    </svg>
  );
}

function TrendBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
        up
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      }`}
    >
      {up ? <ArrowUpRight size={11} strokeWidth={1.75} /> : <ArrowDownRight size={11} strokeWidth={1.75} />}
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  detail,
  tone = "brand",
  trend,
  spark,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
  detail?: string;
  tone?: "brand" | "green" | "amber" | "rose" | "blue";
  trend?: number | null;
  spark?: number[];
}) {
  return (
    <Card variant="kpi" className="report-kpi min-w-0">
      <div className="flex items-start justify-between gap-1.5">
        <ReportIconBadge icon={Icon} size="sm" tone={tone} />
        <div className="flex flex-col items-end gap-1">
          {trend != null && Number.isFinite(trend) ? <TrendBadge pct={trend} /> : null}
          {spark && spark.length >= 2 ? <Sparkline values={spark} tone={tone} /> : null}
        </div>
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="kpi-value report-kpi__value mt-0.5 break-all text-ink">{value}</p>
      {hint ? <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-muted">{hint}</p> : null}
      {detail ? (
        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink-muted/90" title={detail}>
          {detail}
        </p>
      ) : null}
    </Card>
  );
}

/** Dashboard de Resumen: KPIs, evolución, insights y desgloses. */
export default function ReportsDashboard({
  currency,
  periodLabel,
  scopeLabel,
  cashierName,
  totals,
  comparison,
  profit,
  showProfit,
  expensesTotal,
  inflow,
  inflowNotes,
  byDay,
  collectedByDay,
  byPay,
  byEmployee,
  byHour,
  top,
  voided,
  unitsSold,
  debtorsCount,
  onOpenTab,
  onOpenResult,
  onOpenDebtors,
  onOpenPayments,
  onOpenProducts,
  onOpenHours,
  features,
}: Props) {
  const navigate = useNavigate();
  const money = (n: number) => formatMoney(n, currency);
  const collectedMap = new Map(collectedByDay.map((d) => [d.day, d.total]));
  const evolution = [...byDay]
    .map((d) => ({
      day: d.day,
      sales: d.total,
      collected: collectedMap.get(d.day) ?? 0,
    }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const insights = buildReportInsights({
    currency,
    periodLabel,
    totals,
    comparison,
    profit,
    expensesTotal,
    inflow,
    top,
    byDay,
    byHour,
    byPay,
    voided,
    unitsSold,
  });

  const pending = inflow?.onAccount ?? 0;
  const pendingCount = inflow?.onAccountCount ?? 0;
  const moneyIn = inflow?.totalIn ?? 0;
  const maxDay = Math.max(...byDay.map((d) => d.total), 1);

  const salesSpark = [...byDay].sort((a, b) => (a.day < b.day ? -1 : 1)).map((d) => d.total);
  const collectedSpark = [...collectedByDay].sort((a, b) => (a.day < b.day ? -1 : 1)).map((d) => d.total);

  const prevTicket =
    comparison && comparison.previous_count > 0
      ? comparison.previous_total / comparison.previous_count
      : null;
  const ticketTrend =
    prevTicket && prevTicket > 0 && totals.avg_ticket > 0
      ? ((totals.avg_ticket - prevTicket) / prevTicket) * 100
      : null;

  const daysWithSales = byDay.filter((d) => d.total > 0).length;
  const avgDaily = daysWithSales > 0 ? totals.total / daysWithSales : 0;
  const estimatedResult = profit ? profit.profit - expensesTotal : null;
  const costPartial = profit != null && profit.revenue > 0 && profit.cost <= 0.005;

  return (
    <div className="report-dashboard space-y-4">
      <div className="report-dashboard__kpis grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 min-[1366px]:grid-cols-5 xl:grid-cols-5">
        <KpiCard
          icon={TrendingUp}
          label="Ventas totales"
          value={money(totals.total)}
          hint={`${totals.count} ${totals.count === 1 ? "operación" : "operaciones"}${
            unitsSold > 0 ? ` · ${formatQty(unitsSold)} unid.` : ""
          }`}
          detail={
            voided && voided.count > 0
              ? `Neto vigente · ${voided.count} anulada${voided.count === 1 ? "" : "s"} (${money(voided.total)})`
              : daysWithSales > 0
                ? `Promedio diario ${money(avgDaily)} · ${scopeLabel}`
                : scopeLabel
          }
          tone="brand"
          trend={comparison?.previous_total ? comparison.change_pct : null}
          spark={salesSpark}
        />
        <KpiCard
          icon={Banknote}
          label="Dinero ingresado"
          value={money(moneyIn)}
          hint={
            inflow
              ? `Cobradas ${money(inflow.salesCollected)} · Deudas ${money(inflow.debtPayments)}`
              : "Ventas cobradas + cobros de fiado"
          }
          detail="No es lo mismo que ventas: es plata que realmente entró."
          tone="green"
          spark={collectedSpark}
        />
        {showProfit ? (
          <button type="button" onClick={onOpenResult} className="min-w-0 text-left">
            <KpiCard
              icon={Wallet}
              label="Ganancia estimada"
              value={money(profit?.profit ?? 0)}
              hint={
                profit
                  ? costPartial
                    ? "Parcial: faltan costos cargados"
                    : `Margen bruto ${profit.margin_pct.toFixed(1)}% · COGS ${money(profit.cost)}`
                  : "Con el costo cargado hoy"
              }
              detail={
                estimatedResult != null
                  ? `Resultado est. tras gastos: ${money(estimatedResult)} (no es ganancia neta contable)`
                  : "Sin restar todos los conceptos del negocio"
              }
              tone="amber"
            />
          </button>
        ) : (
          <KpiCard
            icon={Receipt}
            label="Operaciones"
            value={String(totals.count)}
            hint={cashierName ? `Cajero: ${cashierName}` : periodLabel}
            tone="blue"
          />
        )}
        <button
          type="button"
          onClick={features.customers ? onOpenDebtors : undefined}
          className={`min-w-0 text-left ${features.customers ? "" : "pointer-events-none"}`}
        >
          <KpiCard
            icon={CreditCard}
            label="Pendiente de cobro"
            value={money(pending)}
            hint={
              pendingCount > 0
                ? `${pendingCount} ${pendingCount === 1 ? "venta fiada" : "ventas fiadas"} en el período`
                : "Nada quedó a cuenta en el período"
            }
            detail={
              debtorsCount > 0
                ? `${debtorsCount} ${debtorsCount === 1 ? "cliente" : "clientes"} con deuda hoy`
                : undefined
            }
            tone="rose"
          />
        </button>
        <KpiCard
          icon={BarChart3}
          label="Ticket promedio"
          value={money(totals.avg_ticket)}
          hint={totals.count > 0 ? `Sobre ${totals.count} ventas` : "Sin operaciones"}
          detail={
            prevTicket != null && prevTicket > 0
              ? `Período anterior: ${money(prevTicket)}`
              : undefined
          }
          tone="blue"
          trend={ticketTrend}
        />
      </div>

      <div className="report-dashboard__main grid min-w-0 gap-3 min-[1366px]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card variant="elevated" className="report-dashboard__evolution min-w-0 border-brand-500/15 !p-4">
          <h2 className="report-section-title mb-0.5 flex items-center gap-2">
            <ReportIcon icon={BarChart3} size="md" className="text-brand-600" /> Evolución del negocio
          </h2>
          <p className="mb-2 text-[11px] text-ink-muted">
            Ventas del día vs dinero que realmente entró (cobrado + cobros de fiado).
          </p>
          <EvolutionChart
            points={evolution}
            currency={currency}
            changePct={comparison?.previous_total ? comparison.change_pct : null}
          />
        </Card>

        <div className="flex min-w-0 flex-col gap-3">
          <Card variant="elevated" className="report-dashboard__insights min-w-0 flex-1 !p-4">
            <h2 className="report-section-title mb-2 flex items-center gap-2">
              <ReportIcon icon={Sparkles} size="md" className="text-brand-600" /> WalQo Insights
            </h2>
            <ul className="space-y-2">
              {insights.map((ins) => {
                const Icon = TONE_ICON[ins.tone];
                return (
                  <li key={ins.id} className="flex gap-2.5 text-[13px] text-ink">
                    <span
                      className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${TONE_CLASS[ins.tone]}`}
                    >
                      <ReportIcon icon={Icon} size="sm" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <p className="font-semibold leading-snug text-ink">{ins.title}</p>
                        {ins.value ? (
                          <span className="text-[11px] font-semibold tabular-nums text-ink-muted">{ins.value}</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{ins.description}</p>
                      {ins.actionTab ? (
                        <button
                          type="button"
                          className="mt-1 text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-300"
                          onClick={() => {
                            const dest = ins.actionTab;
                            if (!dest) return;
                            if (dest === "result") onOpenResult();
                            else if (dest === "debtors") onOpenDebtors();
                            else if (dest === "payments") onOpenPayments();
                            else if (dest === "products") onOpenProducts();
                            else if (dest === "hours") onOpenHours();
                            else onOpenTab(dest);
                          }}
                        >
                          {ins.actionLabel ?? "Ver detalle"} →
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card variant="elevated" className="report-dashboard__actions min-w-0 !p-3.5">
            <h2 className="report-section-title mb-2">Acciones rápidas</h2>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  {
                    key: "ventas",
                    label: "Ventas del día",
                    icon: Receipt,
                    onClick: () => navigate("/ventas"),
                    show: true,
                  },
                  {
                    key: "debtors",
                    label: "Deudores",
                    icon: Users,
                    onClick: onOpenDebtors,
                    show: features.customers,
                  },
                  {
                    key: "gastos",
                    label: "Gastos",
                    icon: ReceiptText,
                    onClick: () => navigate("/gastos"),
                    show: features.expenses,
                  },
                  {
                    key: "pay",
                    label: "Cobranzas",
                    icon: Wallet,
                    onClick: onOpenPayments,
                    show: true,
                  },
                  {
                    key: "top",
                    label: "Más vendidos",
                    icon: Package,
                    onClick: onOpenProducts,
                    show: true,
                  },
                  {
                    key: "hour",
                    label: "Por hora",
                    icon: Clock,
                    onClick: onOpenHours,
                    show: true,
                  },
                  {
                    key: "result",
                    label: "Resultado",
                    icon: Scale,
                    onClick: onOpenResult,
                    show: showProfit,
                  },
                ] as const
              )
                .filter((a) => a.show)
                .map((a) => (
                  <Button
                    key={a.key}
                    variant="secondary"
                    size="sm"
                    className="h-8 justify-between gap-1 px-2.5 text-xs"
                    onClick={a.onClick}
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                      <ReportIcon icon={a.icon} size="sm" className="text-ink-muted" />
                      <span className="truncate">{a.label}</span>
                    </span>
                    <ArrowRight size={12} strokeWidth={1.75} className="shrink-0 opacity-60" />
                  </Button>
                ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="report-dashboard__breakdown grid min-w-0 gap-3 lg:grid-cols-3">
        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <ReportIcon icon={Package} size="md" className="text-brand-600" /> Más vendidos
          </h2>
          {top.length === 0 ? (
            <EmptyState compact icon={Package} title="Sin productos" description="Cuando haya ventas, aparece el ranking." />
          ) : (
            <ol className="space-y-1.5">
              {top.slice(0, 5).map((t, i) => (
                <li
                  key={t.name}
                  className="flex min-w-0 items-center gap-2.5 rounded-lg border border-[var(--color-panel-border)] px-2.5 py-1.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-500/15 text-[11px] font-bold text-brand-700 dark:text-brand-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                    <p className="text-[11px] text-ink-muted">{formatQty(t.qty)} unid.</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{money(t.total)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <ReportIcon icon={CreditCard} size="md" className="text-brand-600" /> Medios de pago
          </h2>
          {byPay.length === 0 ? (
            <EmptyState compact icon={CreditCard} title="Sin cobros" description="Aparecen al registrar ventas." />
          ) : (
            <DonutChart
              currency={currency}
              slices={byPay.map((p, i) => ({
                key: p.payment_method,
                label: formatPaymentMethod(p.payment_method),
                value: p.total,
                color: donutColor(i),
              }))}
            />
          )}
        </Card>

        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <ReportIcon icon={BarChart3} size="md" className="text-brand-600" /> Ventas por día
          </h2>
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {byDay.length === 0 ? (
              <EmptyState compact icon={BarChart3} title="Sin ventas" description="La evolución diaria aparece acá." />
            ) : (
              byDay.slice(0, 12).map((d) => (
                <div key={d.day} className="flex items-center gap-2 text-sm">
                  <span className="w-[4.25rem] shrink-0 text-[12px] text-ink-muted">{formatDayShort(d.day)}</span>
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-500/15">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${(d.total / maxDay) * 100}%` }}
                    />
                  </div>
                  <span className="w-[5.5rem] shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">
                    {money(d.total)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="report-dashboard__ops grid min-w-0 gap-3 lg:grid-cols-2">
        <Card variant="elevated" className="!p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <ReportIcon icon={Users} size="md" className="text-brand-600" /> Por empleado
          </h2>
          {byEmployee.length === 0 ? (
            <EmptyState compact icon={Users} title="Sin datos" description="El desglose por cajero aparece con ventas." />
          ) : (
            <ul className="space-y-1.5">
              {byEmployee.map((e) => (
                <li
                  key={e.user_id ?? e.display_name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-panel-border)] px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-ink">{e.display_name}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">
                    {e.count} · {money(e.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card variant="elevated" className="!p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <ReportIcon icon={Clock} size="md" className="text-brand-600" /> Actividad por hora
          </h2>
          {byHour.length === 0 ? (
            <EmptyState compact icon={Clock} title="Sin datos" description="La distribución horaria aparece con ventas." />
          ) : (
            <div className="space-y-1.5">
              {(() => {
                const maxH = Math.max(...byHour.map((h) => h.total), 1);
                return byHour.map((h) => (
                  <div key={h.hour} className="flex items-center gap-2 text-sm">
                    <span className="w-11 shrink-0 text-[12px] text-ink-muted">{h.hour}</span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-500/15">
                      <div
                        className="h-full rounded-full bg-brand-400"
                        style={{ width: `${(h.total / maxH) * 100}%` }}
                      />
                    </div>
                    <span className="w-[5.5rem] shrink-0 text-right text-[13px] font-semibold tabular-nums">
                      {money(h.total)}
                    </span>
                  </div>
                ));
              })()}
            </div>
          )}
        </Card>
      </div>

      {inflow ? <MoneyInflowCard inflow={inflow} currency={currency} notes={inflowNotes} /> : null}
    </div>
  );
}
