import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Inbox,
  Package,
  Receipt,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageHeader, Card, Button, PageContent, EmptyState } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { getTodaySummary } from "../db/sales";
import { getProductStats } from "../db/products";
import { countExpiringProducts } from "../db/expiry";
import { getOpenCashSessionId } from "../db/cash";
import {
  getTodayProfit,
  getTopSellers,
  getRecentSales,
  getWeekSalesChart,
  listLowStockProducts,
  type TopSellerRow,
} from "../db/dashboard";
import type { SalesByDayRow } from "../db/reports";
import type { Product } from "../types";
import type { Sale } from "../types";
import { formatMoney, formatTime } from "../lib/format";
import { formatPaymentMethod } from "../lib/paymentLabels";
import { rubroUsesWorkshopFlow } from "../config/workshop";
import {
  getWorkshopDashboardStats,
  type WorkshopDashboardStats,
} from "../db/workshopDashboard";
import { useRescheduleAlerts } from "../hooks/useRescheduleAlerts";

type TopPeriod = "today" | "week";
type TrendDir = "up" | "down" | "neutral";

export default function Dashboard() {
  const { businessName, currency, features, isProModuleActive, rubroDef } = useAppConfig();
  const { can } = useAuth();
  const showProfits = can("view_profits");

  const [salesToday, setSalesToday] = useState({ todayTotal: 0, todayCount: 0 });
  const [profitToday, setProfitToday] = useState(0);
  const [cashOpenId, setCashOpenId] = useState<number | null>(null);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [lowStockItems, setLowStockItems] = useState<Product[]>([]);
  const [expiringCount, setExpiringCount] = useState(0);
  const [topPeriod, setTopPeriod] = useState<TopPeriod>("today");
  const [topSellers, setTopSellers] = useState<TopSellerRow[]>([]);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [chart, setChart] = useState<SalesByDayRow[]>([]);
  const [workshop, setWorkshop] = useState<WorkshopDashboardStats | null>(null);

  const showWorkshop =
    rubroUsesWorkshopFlow(rubroDef.id) &&
    (isProModuleActive("service_orders") || isProModuleActive("appointments"));
  const { count: rescheduleCount } = useRescheduleAlerts(isProModuleActive("appointments"));

  useEffect(() => {
    getTodaySummary().then(setSalesToday).catch(console.error);
    getOpenCashSessionId().then(setCashOpenId).catch(console.error);
    getProductStats().then((s) => setLowStockCount(s.lowStock)).catch(console.error);
    listLowStockProducts(5).then(setLowStockItems).catch(console.error);
    countExpiringProducts(14).then(setExpiringCount).catch(console.error);
    getRecentSales(8).then(setRecentSales).catch(console.error);
    getWeekSalesChart().then(setChart).catch(console.error);
    if (showProfits) {
      getTodayProfit().then((p) => setProfitToday(p.profit)).catch(console.error);
    }
    if (showWorkshop) {
      getWorkshopDashboardStats().then(setWorkshop).catch(console.error);
    }
  }, [showProfits, showWorkshop]);

  useEffect(() => {
    getTopSellers(topPeriod === "today" ? 1 : 7, 5).then(setTopSellers).catch(console.error);
  }, [topPeriod]);

  const alertCount = lowStockCount + (features.stock && expiringCount > 0 ? expiringCount : 0);
  const maxChart = Math.max(...chart.map((c) => c.total), 1);
  const weekTotal = useMemo(() => chart.reduce((sum, row) => sum + row.total, 0), [chart]);

  const weekTrend = useMemo((): { label: string; dir: TrendDir } | null => {
    if (chart.length < 2) return null;
    const last = chart[chart.length - 1]?.total ?? 0;
    const prev = chart[chart.length - 2]?.total ?? 0;
    if (prev === 0 && last === 0) return null;
    if (prev === 0) return { label: "Actividad nueva hoy", dir: "up" };
    const pct = ((last - prev) / prev) * 100;
    return {
      label: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs día anterior`,
      dir: pct > 0 ? "up" : pct < 0 ? "down" : "neutral",
    };
  }, [chart]);

  return (
    <div className="min-h-full">
      <PageHeader title={`Buenos días, ${businessName}`} />

      <div className="border-b border-[var(--color-panel-border)] bg-[var(--color-panel)] px-6 pb-5 pt-2 lg:px-8">
        <StatusBar
          cashOpen={cashOpenId != null}
          salesCount={salesToday.todayCount}
          salesTotal={salesToday.todayTotal}
          currency={currency}
          alerts={alertCount}
        />
      </div>

      <PageContent className="space-y-8">
        {isProModuleActive("appointments") && rescheduleCount > 0 && (
          <Card className="border-amber-400/40 bg-amber-50/70 dark:bg-amber-950/25">
            <Link
              to="/turnos"
              className="flex items-center gap-3 text-sm font-medium text-amber-900 dark:text-amber-100"
            >
              <CalendarClock size={20} className="shrink-0 text-amber-700 dark:text-amber-300" />
              <span className="flex-1">
                {rescheduleCount === 1
                  ? "1 cliente quiere reprogramar un turno por WhatsApp"
                  : `${rescheduleCount} clientes quieren reprogramar turnos por WhatsApp`}
              </span>
              <ArrowUpRight size={16} className="shrink-0 opacity-70" />
            </Link>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            {features.pos && (
              <KpiCard
                featured
                icon={<Receipt className="text-brand-600" size={24} />}
                label="Ventas de hoy"
                value={formatMoney(salesToday.todayTotal, currency)}
                hint={`${salesToday.todayCount} venta${salesToday.todayCount === 1 ? "" : "s"}`}
                trend={weekTrend?.label}
                trendDir={weekTrend?.dir}
              />
            )}
            {showProfits && features.pos && (
              <KpiCard
                icon={<TrendingUp className="text-brand-600" size={22} />}
                label="Ganancia estimada"
                value={formatMoney(profitToday, currency)}
                hint="Según costos cargados"
              />
            )}
            <KpiCard
              icon={<Wallet className="text-brand-600" size={22} />}
              label="Caja"
              value={cashOpenId != null ? "Abierta" : "Cerrada"}
              hint={cashOpenId != null ? `Turno #${cashOpenId}` : "Abrí turno para vender"}
              action={
                <Link to="/caja">
                  <Button variant="secondary" size="sm">
                    {cashOpenId != null ? "Ir a caja" : "Abrir turno"}
                  </Button>
                </Link>
              }
            />
            {features.stock && (
              <KpiCard
                icon={<AlertTriangle className="text-amber-600" size={22} />}
                label="Alertas de stock"
                value={String(lowStockCount)}
                hint={
                  expiringCount > 0
                    ? `${expiringCount} por vencer (14 días)`
                    : "Productos bajo mínimo"
                }
              />
            )}
          </div>

          <Card variant="elevated" className="flex flex-col">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="panel-section-title">Ventas · 7 días</p>
                <p className="mt-0.5 text-xs text-ink-muted">Evolución diaria</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold tabular-nums tracking-tight text-ink">
                  {formatMoney(weekTotal, currency)}
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Total semana</p>
              </div>
            </div>
            <div className="flex flex-1 items-end justify-between gap-2" style={{ minHeight: 140 }}>
              {chart.length === 0 ? (
                <EmptyState
                  compact
                  icon={BarChart3}
                  title="Sin ventas esta semana"
                  description="Cuando registres ventas, verás el gráfico aquí."
                />
              ) : (
                chart.map((row, index) => {
                  const barPx = Math.max(10, Math.round((row.total / maxChart) * 96));
                  const day = row.day.slice(8, 10);
                  const isToday = index === chart.length - 1;
                  return (
                    <div key={row.day} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                      <span className="text-[10px] font-medium tabular-nums text-ink-muted">
                        {row.total > 0 ? formatMoney(row.total, currency).replace(/\s/g, "") : ""}
                      </span>
                      <div
                        className={`chart-bar ${isToday ? "" : "chart-bar--muted"}`}
                        style={{ height: barPx }}
                        title={`${day}: ${formatMoney(row.total, currency)}`}
                      />
                      <span
                        className={`text-[10px] font-semibold ${isToday ? "text-brand-700" : "text-ink-muted"}`}
                      >
                        {day}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {features.stock && lowStockItems.length > 0 && (
            <Card variant="elevated">
              <PanelHeader title="Stock crítico" to="/stock" linkLabel="Ver todo" />
              <ul className="space-y-2.5 text-sm">
                {lowStockItems.map((p) => (
                  <li
                    key={p.id}
                    className="flex justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-50/50 dark:hover:bg-brand-950/30"
                  >
                    <span className="truncate text-ink">{p.name}</span>
                    <span className="shrink-0 tabular-nums font-semibold text-amber-700">{p.stock} u.</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {features.pos && (
            <Card variant="elevated">
              <div className="mb-4 flex items-center justify-between gap-2">
                <p className="panel-section-title">Más vendidos</p>
                <div className="inline-flex rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setTopPeriod("today")}
                    className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                      topPeriod === "today" ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopPeriod("week")}
                    className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                      topPeriod === "week" ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    7 días
                  </button>
                </div>
              </div>
              {topSellers.length === 0 ? (
                <EmptyState
                  compact
                  icon={Inbox}
                  title="Sin ventas en este período"
                  description="Los productos más vendidos aparecerán aquí."
                />
              ) : (
                <ol className="space-y-2.5 text-sm">
                  {topSellers.map((row, i) => (
                    <li
                      key={row.name}
                      className="flex justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-50/50 dark:hover:bg-brand-950/30"
                    >
                      <span className="truncate text-ink">
                        <span className="mr-1.5 font-semibold text-brand-600">{i + 1}.</span>
                        {row.name}
                      </span>
                      <span className="shrink-0 tabular-nums font-medium text-ink-muted">{row.qty} u.</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}

          {features.pos && (
            <Card variant="elevated">
              <PanelHeader title="Últimas ventas" to="/ventas" linkLabel="Ver todas" />
              {recentSales.length === 0 ? (
                <EmptyState
                  compact
                  icon={Receipt}
                  title="Aún no hay ventas"
                  description="Tu historial reciente se mostrará acá."
                  action={
                    <Link to="/pos">
                      <Button size="sm">Ir al punto de venta</Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {recentSales.map((s) => (
                    <li
                      key={s.id}
                      className="flex justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-50/50 dark:hover:bg-brand-950/30"
                    >
                      <span className="text-ink-muted">
                        {formatTime(s.created_at)} · {formatPaymentMethod(s.payment_method)}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">
                        {formatMoney(s.total, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        {showWorkshop && workshop && (
          <Card variant="elevated">
            <p className="panel-section-title mb-4">Taller hoy</p>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <WorkshopStat label="En reparación" value={workshop.ordersInProgress} to="/ordenes" />
              <WorkshopStat label="Espera repuestos" value={workshop.ordersWaitingParts} to="/ordenes" />
              <WorkshopStat label="Listos" value={workshop.ordersReady} to="/ordenes" />
              <WorkshopStat label="Turnos hoy" value={workshop.appointmentsToday} to="/turnos" />
              <WorkshopStat label="Presupuestos" value={workshop.quotesPending} to="/presupuestos" />
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {features.pos && (
            <Link to="/pos" className="dashboard-hero">
              <ShoppingCart size={28} />
              <span>Vender</span>
            </Link>
          )}
          {features.products && (
            <Link to="/productos?nuevo=1" className="dashboard-hero">
              <Package size={28} />
              <span>Cargar producto</span>
            </Link>
          )}
          <Link to="/caja" className="dashboard-hero dashboard-hero--secondary">
            <Wallet size={28} />
            <span>Caja</span>
          </Link>
        </div>
      </PageContent>
    </div>
  );
}

function StatusBar({
  cashOpen,
  salesCount,
  salesTotal,
  currency,
  alerts,
}: {
  cashOpen: boolean;
  salesCount: number;
  salesTotal: number;
  currency: string;
  alerts: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
          cashOpen
            ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${cashOpen ? "bg-green-500" : "bg-slate-400"}`} />
        Caja {cashOpen ? "abierta" : "cerrada"}
      </span>
      <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-950/40 dark:text-brand-200">
        {salesCount} venta{salesCount === 1 ? "" : "s"} · {formatMoney(salesTotal, currency)}
      </span>
      {alerts > 0 && (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {alerts} alerta{alerts === 1 ? "" : "s"} de stock
        </span>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  action,
  featured = false,
  trend,
  trendDir = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  action?: ReactNode;
  featured?: boolean;
  trend?: string;
  trendDir?: TrendDir;
}) {
  return (
    <Card
      variant={featured ? "kpi-featured" : "kpi"}
      className={`flex flex-col gap-2 ${featured ? "sm:col-span-2" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/40 ${
              featured ? "h-12 w-12" : "h-10 w-10"
            }`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
            <p className="kpi-value">{value}</p>
            {trend && (
              <span className={`kpi-trend kpi-trend--${trendDir}`}>
                {trendDir === "up" && <ArrowUpRight size={12} strokeWidth={2.5} />}
                {trendDir === "down" && <TrendingDown size={12} strokeWidth={2.5} />}
                {trend}
              </span>
            )}
          </div>
        </div>
        {action}
      </div>
      {hint && <p className="text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </Card>
  );
}

function PanelHeader({ title, to, linkLabel }: { title: string; to: string; linkLabel: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <p className="panel-section-title">{title}</p>
      <Link to={to} className="text-xs font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline">
        {linkLabel}
      </Link>
    </div>
  );
}

function WorkshopStat({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-[var(--color-panel-border)] px-3 py-2.5 transition-all hover:border-brand-300 hover:bg-brand-50/50 hover:shadow-sm dark:hover:bg-brand-950/30"
    >
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-xl font-bold tabular-nums tracking-tight text-ink">{value}</p>
    </Link>
  );
}
