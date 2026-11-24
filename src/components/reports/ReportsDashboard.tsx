import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Clock,
  CreditCard,
  Package,
  Receipt,
  Sparkles,
  Trophy,
  TrendingUp,
  Users,
  Wallet,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Card, Button, EmptyState } from "../ui";
import MoneyInflowCard from "./MoneyInflowCard";
import EvolutionChart from "./charts/EvolutionChart";
import DonutChart, { donutColor } from "./charts/DonutChart";
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
  inflow: MoneyInflow | null;
  inflowNotes: string[];
  byDay: SalesByDayRow[];
  collectedByDay: SalesByDayRow[];
  byPay: SalesByPaymentRow[];
  byEmployee: SalesByEmployeeRow[];
  byHour: SalesByHourRow[];
  top: TopProductRow[];
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

function TrendBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
        up
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
      }`}
    >
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
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
  tone = "brand",
  trend,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
  tone?: "brand" | "green" | "amber" | "rose" | "blue";
  trend?: number | null;
}) {
  const toneCls = {
    brand: "bg-brand-500/15 text-brand-600 dark:text-brand-300 border-brand-500/20",
    green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/20",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25",
    rose: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/20",
    blue: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/20",
  }[tone];
  return (
    <Card variant="kpi" className={`min-w-0 border ${toneCls.split(" ").slice(-1)[0]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`inline-flex rounded-lg p-2 ${toneCls}`}>
          <Icon size={16} />
        </div>
        {trend != null && Number.isFinite(trend) ? <TrendBadge pct={trend} /> : null}
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-1 break-all text-xl font-bold tabular-nums text-ink sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
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
  inflow,
  inflowNotes,
  byDay,
  collectedByDay,
  byPay,
  byEmployee,
  byHour,
  top,
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
    inflow,
    top,
    byDay,
    byHour,
    byPay,
  });

  const pending = inflow?.onAccount ?? 0;
  const pendingCount = inflow?.onAccountCount ?? 0;
  const moneyIn = inflow?.totalIn ?? 0;

  const maxDay = Math.max(...byDay.map((d) => d.total), 1);

  return (
    <div className="space-y-5">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={TrendingUp}
          label="Ventas totales"
          value={money(totals.total)}
          hint={`${totals.count} ${totals.count === 1 ? "operación" : "operaciones"} · ${scopeLabel}`}
          tone="brand"
          trend={comparison?.previous_total ? comparison.change_pct : null}
        />
        <KpiCard
          icon={Banknote}
          label="Dinero ingresado"
          value={money(moneyIn)}
          hint={
            inflow
              ? `Cobradas ${money(inflow.salesCollected)} · Fiado cobrado ${money(inflow.debtPayments)}`
              : "Ventas cobradas + cobros de fiado"
          }
          tone="green"
        />
        {showProfit ? (
          <button type="button" onClick={onOpenResult} className="min-w-0 text-left">
            <KpiCard
              icon={Wallet}
              label="Ganancia estimada"
              value={money(profit?.profit ?? 0)}
              hint={
                profit
                  ? `Margen ${profit.margin_pct.toFixed(1)}% · sin gastos del negocio`
                  : "Con el costo cargado hoy"
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
        <KpiCard
          icon={Users}
          label="Pendiente de cobro"
          value={money(pending)}
          hint={
            pendingCount > 0
              ? `${pendingCount} ${pendingCount === 1 ? "venta fiada" : "ventas fiadas"} en el período`
              : "Nada quedó a cuenta en el período"
          }
          tone="rose"
        />
        <KpiCard
          icon={Receipt}
          label="Ticket promedio"
          value={money(totals.avg_ticket)}
          hint={totals.count > 0 ? `Sobre ${totals.count} ventas` : "Sin operaciones"}
          tone="blue"
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card variant="elevated" className="min-w-0 border-brand-500/15">
          <h2 className="report-section-title mb-1 flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-600" /> Evolución del negocio
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            Ventas del día vs dinero que realmente entró (cobrado + cobros de fiado).
          </p>
          <EvolutionChart
            points={evolution}
            currency={currency}
            changePct={comparison?.previous_total ? comparison.change_pct : null}
          />
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card variant="elevated" className="min-w-0 flex-1">
            <h2 className="report-section-title mb-3 flex items-center gap-2">
              <Sparkles size={16} className="text-brand-600" /> Análisis del período
            </h2>
            <ul className="space-y-2.5">
              {insights.map((ins) => {
                const Icon = TONE_ICON[ins.tone];
                return (
                  <li key={ins.id} className="flex gap-2.5 text-sm text-ink">
                    <span
                      className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONE_CLASS[ins.tone]}`}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 leading-snug">{ins.text}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card variant="elevated" className="min-w-0">
            <h2 className="report-section-title mb-3">Acciones rápidas</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                size="sm"
                className="justify-between"
                onClick={() => navigate("/ventas")}
              >
                Ver ventas del día <ArrowRight size={14} />
              </Button>
              {features.customers ? (
                <Button variant="secondary" size="sm" className="justify-between" onClick={onOpenDebtors}>
                  Clientes deudores <ArrowRight size={14} />
                </Button>
              ) : null}
              {features.expenses ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="justify-between"
                  onClick={() => navigate("/gastos")}
                >
                  Gastos <ArrowRight size={14} />
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                className="justify-between"
                onClick={onOpenPayments}
              >
                Detalle de cobranzas <ArrowRight size={14} />
              </Button>
              <Button variant="secondary" size="sm" className="justify-between" onClick={onOpenProducts}>
                Productos más vendidos <ArrowRight size={14} />
              </Button>
              <Button variant="secondary" size="sm" className="justify-between" onClick={onOpenHours}>
                Actividad por hora <ArrowRight size={14} />
              </Button>
              {showProfit ? (
                <Button variant="secondary" size="sm" className="justify-between" onClick={onOpenResult}>
                  Ver resultado <ArrowRight size={14} />
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {inflow ? <MoneyInflowCard inflow={inflow} currency={currency} notes={inflowNotes} /> : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card variant="elevated" className="min-w-0 lg:col-span-1">
          <h2 className="report-section-title mb-3 flex items-center gap-2">
            <Package size={16} className="text-brand-600" /> Más vendidos
          </h2>
          {top.length === 0 ? (
            <EmptyState compact icon={Package} title="Sin productos" description="Cuando haya ventas, aparece el ranking." />
          ) : (
            <ol className="space-y-2">
              {top.slice(0, 5).map((t, i) => (
                <li
                  key={t.name}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--color-panel-border)] px-3 py-2"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-xs font-bold text-brand-700 dark:text-brand-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                    <p className="text-xs text-ink-muted">{formatQty(t.qty)} unid.</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{money(t.total)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card variant="elevated" className="min-w-0">
          <h2 className="report-section-title mb-3 flex items-center gap-2">
            <CreditCard size={16} className="text-brand-600" /> Medios de pago
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

        <Card variant="elevated" className="min-w-0">
          <h2 className="report-section-title mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-600" /> Ventas por día
          </h2>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {byDay.length === 0 ? (
              <EmptyState compact icon={BarChart3} title="Sin ventas" description="La evolución diaria aparece acá." />
            ) : (
              byDay.slice(0, 12).map((d) => (
                <div key={d.day} className="flex items-center gap-2 text-sm">
                  <span className="w-[4.5rem] shrink-0 text-ink-muted">{d.day.slice(5)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-500/15">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${(d.total / maxDay) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-ink">
                    {money(d.total)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card variant="elevated">
          <h2 className="report-section-title mb-3 flex items-center gap-2">
            <Users size={16} className="text-brand-600" /> Por empleado
          </h2>
          {byEmployee.length === 0 ? (
            <EmptyState compact icon={Users} title="Sin datos" description="El desglose por cajero aparece con ventas." />
          ) : (
            <ul className="space-y-2">
              {byEmployee.map((e) => (
                <li
                  key={e.user_id ?? e.display_name}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-panel-border)] px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-ink">{e.display_name}</span>
                  <span className="shrink-0 tabular-nums text-ink-muted">{e.count} · {money(e.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card variant="elevated">
          <h2 className="report-section-title mb-3 flex items-center gap-2">
            <Clock size={16} className="text-brand-600" /> Actividad por hora
          </h2>
          {byHour.length === 0 ? (
            <EmptyState compact icon={Clock} title="Sin datos" description="La distribución horaria aparece con ventas." />
          ) : (
            <div className="space-y-2">
              {(() => {
                const maxH = Math.max(...byHour.map((h) => h.total), 1);
                return byHour.map((h) => (
                  <div key={h.hour} className="flex items-center gap-2 text-sm">
                    <span className="w-12 shrink-0 text-ink-muted">{h.hour}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-500/15">
                      <div
                        className="h-full rounded-full bg-brand-400"
                        style={{ width: `${(h.total / maxH) * 100}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{money(h.total)}</span>
                  </div>
                ));
              })()}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
