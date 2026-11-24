import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Inbox,
  MessageCircle,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Boxes,
  Users,
  Settings,
} from "lucide-react";
import {
  PageHeader,
  Button,
  PageContent,
  EmptyState,
  StatCard,
  SectionCard,
  StatusBadge,
} from "../components/ui";
import DashboardSnake from "../components/DashboardSnake";
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
import { getPeriodProfit, type SalesByDayRow } from "../db/reports";
import { getExpenseSummary, monthBounds } from "../db/expenses";
import type { Product } from "../types";
import type { Sale } from "../types";
import { formatMoney, formatTime, todayYmd } from "../lib/format";
import { formatPaymentMethod } from "../lib/paymentLabels";
import { rubroUsesWorkshopFlow } from "../config/workshop";
import {
  getWorkshopDashboardStats,
  type WorkshopDashboardStats,
} from "../db/workshopDashboard";
import { useRescheduleAlerts } from "../hooks/useRescheduleAlerts";
import FirstStepsCard from "../components/FirstStepsCard";
import HomeNotices from "../components/HomeNotices";
import ClinicFrontDesk from "../components/ClinicFrontDesk";
import DailySummaryModal from "../components/reports/DailySummaryModal";
import { getSetting } from "../db/settings";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";

type TopPeriod = "today" | "week";
type TrendDir = "up" | "down" | "neutral";

export default function Dashboard() {
  const { businessName, currency, features, isProModuleActive, rubroDef } = useAppConfig();
  const { can } = useAuth();
  const { reportsFull } = usePlanEntitlements();
  const showProfits = can("view_profits");
  const showDailySummary = can("view_reports") && features.reports;
  const [dailyOpen, setDailyOpen] = useState(false);
  const [bizWhatsApp, setBizWhatsApp] = useState<string | null>(null);

  function openDailySummary() {
    getSetting("print_whatsapp")
      .then((v) => setBizWhatsApp(v?.trim() || null))
      .catch(() => setBizWhatsApp(null))
      .finally(() => setDailyOpen(true));
  }

  const [salesToday, setSalesToday] = useState({ todayTotal: 0, todayCount: 0 });
  const [profitToday, setProfitToday] = useState(0);
  const [monthRealProfit, setMonthRealProfit] = useState<number | null>(null);
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
  const clinic = rubroDef.id === "clinica";
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
      const today = todayYmd();
      const month = monthBounds(today);
      Promise.all([getPeriodProfit({ from: month.from, to: today }), getExpenseSummary(month.from, month.to)])
        .then(([p, e]) => setMonthRealProfit(p.profit - e.total))
        .catch(console.error);
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
      <PageHeader
        title={`Buenos días, ${businessName}`}
        subtitle={clinic ? "Mostrador del consultorio" : "Resumen del local para arrancar el día"}
        filters={
          !clinic ? (
            <StatusBar
              cashOpen={cashOpenId != null}
              salesCount={salesToday.todayCount}
              salesTotal={salesToday.todayTotal}
              currency={currency}
              alerts={alertCount}
            />
          ) : undefined
        }
      />

      <PageContent className="space-y-6 md:space-y-7">
        <FirstStepsCard />
        {!clinic && <HomeNotices hasSales={recentSales.length > 0} />}
        {isProModuleActive("appointments") && rescheduleCount > 0 && (
          <div className="rounded-2xl border border-[var(--color-warning)]/40 bg-[var(--color-warning-bg)] px-4 py-3 shadow-[var(--shadow-sm)]">
            <Link to="/turnos" className="flex items-center gap-3 text-sm font-medium text-ink">
              <CalendarClock size={20} className="shrink-0 text-[var(--color-warning)]" />
              <span className="min-w-0 flex-1">
                {rescheduleCount === 1
                  ? "1 cliente quiere reprogramar un turno por WhatsApp"
                  : `${rescheduleCount} clientes quieren reprogramar turnos por WhatsApp`}
              </span>
              <ArrowUpRight size={16} className="shrink-0 opacity-70" />
            </Link>
          </div>
        )}
        {!clinic && (
        <>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:col-span-2">
            {features.pos && (
              <StatCard
                featured
                className="sm:col-span-2"
                icon={Receipt}
                label="Ventas de hoy"
                value={formatMoney(salesToday.todayTotal, currency)}
                detail={`${salesToday.todayCount} venta${salesToday.todayCount === 1 ? "" : "s"}`}
                delta={weekTrend?.label}
                deltaTone={weekTrend?.dir ?? "neutral"}
                footer={
                  showDailySummary ? (
                    <Button variant="secondary" size="sm" className="shrink-0" onClick={openDailySummary}>
                      <MessageCircle size={14} /> Resumen hoy
                    </Button>
                  ) : undefined
                }
              />
            )}
            {showProfits && features.pos && (
              <StatCard
                icon={TrendingUp}
                label="Ganancia estimada"
                value={formatMoney(profitToday, currency)}
                detail={
                  monthRealProfit != null
                    ? `Este mes: ganancia real estimada ${formatMoney(monthRealProfit, currency)}`
                    : "Según costos cargados"
                }
              />
            )}
            <StatCard
              icon={Wallet}
              label="Caja"
              value={cashOpenId != null ? "Abierta" : "Cerrada"}
              detail={cashOpenId != null ? `Turno #${cashOpenId}` : "Abrí turno para vender"}
              footer={
                <Link to="/caja">
                  <Button variant="secondary" size="sm">
                    {cashOpenId != null ? "Ir a caja" : "Abrir turno"}
                  </Button>
                </Link>
              }
            />
            {features.stock && (
              <StatCard
                icon={AlertTriangle}
                label="Alertas de stock"
                value={String(lowStockCount)}
                detail={
                  expiringCount > 0
                    ? `${expiringCount} por vencer (14 días)`
                    : "Productos bajo mínimo"
                }
              />
            )}
          </div>

          <SectionCard
            title="Ventas · 7 días"
            description="Evolución diaria"
            icon={BarChart3}
            actions={
              <div className="text-right">
                <p className="font-display text-lg font-bold tabular-nums tracking-tight text-ink">
                  {formatMoney(weekTotal, currency)}
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Total semana</p>
              </div>
            }
            className="flex h-full flex-col"
          >
            <div className="flex min-h-[140px] flex-1 items-end justify-between gap-2">
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
                    <div key={row.day} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                      <span className="max-w-full truncate text-[10px] font-medium tabular-nums text-ink-muted">
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
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
          {features.stock && lowStockItems.length > 0 && (
            <SectionCard
              title="Stock crítico"
              actions={
                <Link to="/stock" className="text-xs font-semibold text-brand-700 hover:underline">
                  Ver todo
                </Link>
              }
            >
              <ul className="space-y-1.5 text-sm">
                {lowStockItems.map((p) => (
                  <li
                    key={p.id}
                    className="flex justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-50/50 dark:hover:bg-brand-950/30"
                  >
                    <span className="min-w-0 truncate text-ink">{p.name}</span>
                    <span className="shrink-0 tabular-nums font-semibold text-[var(--color-warning)]">
                      {p.stock} u.
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {features.pos && (
            <SectionCard
              title="Más vendidos"
              actions={
                <div className="app-tabs" role="tablist" aria-label="Período más vendidos">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={topPeriod === "today"}
                    className={`app-tabs__tab ${topPeriod === "today" ? "is-active" : ""}`}
                    onClick={() => setTopPeriod("today")}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={topPeriod === "week"}
                    className={`app-tabs__tab ${topPeriod === "week" ? "is-active" : ""}`}
                    onClick={() => setTopPeriod("week")}
                  >
                    7 días
                  </button>
                </div>
              }
            >
              {topSellers.length === 0 ? (
                <EmptyState
                  compact
                  icon={Inbox}
                  title="Sin ventas en este período"
                  description="Los productos más vendidos aparecerán aquí."
                />
              ) : (
                <ol className="space-y-1.5 text-sm">
                  {topSellers.map((row, i) => (
                    <li
                      key={row.name}
                      className="flex justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-50/50 dark:hover:bg-brand-950/30"
                    >
                      <span className="min-w-0 truncate text-ink">
                        <span className="mr-1.5 font-semibold text-brand-600">{i + 1}.</span>
                        {row.name}
                      </span>
                      <span className="shrink-0 tabular-nums font-medium text-ink-muted">{row.qty} u.</span>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
          )}

          {features.pos && (
            <SectionCard
              title="Últimas ventas"
              actions={
                <Link to="/ventas" className="text-xs font-semibold text-brand-700 hover:underline">
                  Ver todas
                </Link>
              }
            >
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
                <ul className="space-y-1.5 text-sm">
                  {recentSales.map((s) => (
                    <li
                      key={s.id}
                      className="flex justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-50/50 dark:hover:bg-brand-950/30"
                    >
                      <span className="min-w-0 truncate text-ink-muted">
                        {formatTime(s.created_at)} · {formatPaymentMethod(s.payment_method)}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">
                        {formatMoney(s.total, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}
        </div>
        </>
        )}

        {showWorkshop && workshop && !clinic && (
          <SectionCard title="Taller hoy">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <WorkshopStat label="En reparación" value={workshop.ordersInProgress} to="/ordenes" />
              <WorkshopStat label="Espera repuestos" value={workshop.ordersWaitingParts} to="/ordenes" />
              <WorkshopStat label="Listos" value={workshop.ordersReady} to="/ordenes" />
              <WorkshopStat label="Turnos hoy" value={workshop.appointmentsToday} to="/turnos" />
              <WorkshopStat label="Presupuestos" value={workshop.quotesPending} to="/presupuestos" />
            </div>
          </SectionCard>
        )}

        {clinic ? (
          <ClinicFrontDesk />
        ) : (
        <section aria-label="Accesos rápidos">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Accesos rápidos</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
            {features.pos && (
              <Link to="/pos" className="dashboard-hero dashboard-hero--pos">
                <ShoppingCart size={26} />
                <span>Vender</span>
              </Link>
            )}
            {features.products && (
              <Link to="/productos?nuevo=1" className="dashboard-hero dashboard-hero--products">
                <Package size={26} />
                <span>Productos</span>
              </Link>
            )}
            {features.stock && (
              <Link to="/stock" className="dashboard-hero dashboard-hero--stock">
                <Boxes size={26} />
                <span>Stock</span>
              </Link>
            )}
            <Link to="/caja" className="dashboard-hero dashboard-hero--cash">
              <Wallet size={26} />
              <span>Caja</span>
            </Link>
            {features.customers && (
              <Link to="/clientes" className="dashboard-hero dashboard-hero--customers">
                <Users size={26} />
                <span>Clientes</span>
              </Link>
            )}
            {can("view_reports") && features.reports && reportsFull && (
              <Link to="/reportes" className="dashboard-hero dashboard-hero--reports">
                <BarChart3 size={26} />
                <span>Reportes</span>
              </Link>
            )}
            <Link to="/configuracion" className="dashboard-hero dashboard-hero--settings">
              <Settings size={26} />
              <span>Config</span>
            </Link>
          </div>
        </section>
        )}

        {!clinic && <DashboardSnake />}
      </PageContent>

      {showDailySummary && !clinic && (
        <DailySummaryModal
          open={dailyOpen}
          onClose={() => setDailyOpen(false)}
          businessName={businessName}
          currency={currency}
          showProfit={showProfits}
          bizWhatsApp={bizWhatsApp}
        />
      )}
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
    <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
      <StatusBadge tone={cashOpen ? "success" : "neutral"}>
        Caja {cashOpen ? "abierta" : "cerrada"}
      </StatusBadge>
      <StatusBadge tone="brand">
        {salesCount} venta{salesCount === 1 ? "" : "s"} · {formatMoney(salesTotal, currency)}
      </StatusBadge>
      {alerts > 0 && (
        <StatusBadge tone="warning">
          {alerts} alerta{alerts === 1 ? "" : "s"} de stock
        </StatusBadge>
      )}
    </div>
  );
}

function WorkshopStat({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link
      to={to}
      className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-3 py-2.5 transition-all hover:border-brand-300 hover:bg-brand-50/50 hover:shadow-sm dark:hover:bg-brand-950/30"
    >
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-display text-xl font-bold tabular-nums tracking-tight text-ink">{value}</p>
    </Link>
  );
}
