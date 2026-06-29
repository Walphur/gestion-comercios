import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageHeader, Card, Button, PageContent } from "../components/ui";
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

type TopPeriod = "today" | "week";

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

  return (
    <div className="min-h-full">
      <PageHeader title={`Buenos días, ${businessName}`} />

      <div className="border-b border-[var(--color-panel-border)] bg-[var(--color-panel)] px-6 pb-4 lg:px-8">
        <StatusBar
          cashOpen={cashOpenId != null}
          salesCount={salesToday.todayCount}
          salesTotal={salesToday.todayTotal}
          currency={currency}
          alerts={alertCount}
        />
      </div>

      <PageContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            {features.pos && (
              <KpiCard
                icon={<Receipt className="text-brand-600" size={22} />}
                label="Ventas de hoy"
                value={formatMoney(salesToday.todayTotal, currency)}
                hint={`${salesToday.todayCount} venta${salesToday.todayCount === 1 ? "" : "s"}`}
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
                  <Button variant="secondary" className="!py-1.5 !text-xs">
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

          <Card className="flex flex-col">
            <p className="text-sm font-semibold text-ink">Ventas últimos 7 días</p>
            <div className="mt-4 flex flex-1 items-end justify-between gap-1.5" style={{ minHeight: 120 }}>
              {chart.length === 0 && (
                <p className="text-sm text-ink-muted">Sin ventas en la semana.</p>
              )}
              {chart.map((row) => {
                const h = Math.max(8, (row.total / maxChart) * 100);
                const day = row.day.slice(8, 10);
                return (
                  <div key={row.day} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full max-w-[2.5rem] rounded-t-md bg-brand-500/80"
                      style={{ height: `${h}%`, minHeight: 8 }}
                      title={formatMoney(row.total, currency)}
                    />
                    <span className="text-[10px] text-ink-muted">{day}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {features.stock && lowStockItems.length > 0 && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Stock crítico</p>
                <Link to="/stock" className="text-xs font-medium text-brand-700 hover:underline">
                  Ver todo
                </Link>
              </div>
              <ul className="space-y-2 text-sm">
                {lowStockItems.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="truncate text-ink">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-amber-700">{p.stock} u.</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {features.pos && (
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">Más vendidos</p>
                <div className="inline-flex rounded-lg border border-[var(--color-panel-border)] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setTopPeriod("today")}
                    className={`rounded-md px-2 py-1 font-medium ${
                      topPeriod === "today" ? "bg-brand-600 text-white" : "text-ink-muted"
                    }`}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopPeriod("week")}
                    className={`rounded-md px-2 py-1 font-medium ${
                      topPeriod === "week" ? "bg-brand-600 text-white" : "text-ink-muted"
                    }`}
                  >
                    7 días
                  </button>
                </div>
              </div>
              {topSellers.length === 0 ? (
                <p className="text-sm text-ink-muted">Todavía no hay ventas en este período.</p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {topSellers.map((row, i) => (
                    <li key={row.name} className="flex justify-between gap-2">
                      <span className="truncate text-ink">
                        {i + 1}. {row.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-muted">{row.qty} u.</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}

          {features.pos && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Últimas ventas</p>
                <Link to="/ventas" className="text-xs font-medium text-brand-700 hover:underline">
                  Ver todas
                </Link>
              </div>
              {recentSales.length === 0 ? (
                <p className="text-sm text-ink-muted">Aún no registraste ventas.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {recentSales.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span className="text-ink-muted">
                        {formatTime(s.created_at)} · {formatPaymentMethod(s.payment_method)}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
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
          <Card>
            <p className="mb-3 text-sm font-semibold text-ink">Taller hoy</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-sm">
              <WorkshopStat label="En reparación" value={workshop.ordersInProgress} to="/ordenes" />
              <WorkshopStat label="Espera repuestos" value={workshop.ordersWaitingParts} to="/ordenes" />
              <WorkshopStat label="Listos" value={workshop.ordersReady} to="/ordenes" />
              <WorkshopStat label="Turnos hoy" value={workshop.appointmentsToday} to="/turnos" />
              <WorkshopStat label="Presupuestos" value={workshop.quotesPending} to="/presupuestos" />
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${cashOpen ? "bg-green-500" : "bg-ink-muted/40"}`}
        />
        Caja {cashOpen ? "abierta" : "cerrada"}
      </span>
      <span>·</span>
      <span>
        {salesCount} venta{salesCount === 1 ? "" : "s"} · {formatMoney(salesTotal, currency)}
      </span>
      {alerts > 0 && (
        <>
          <span>·</span>
          <span className="text-amber-700">{alerts} alerta{alerts === 1 ? "" : "s"} de stock</span>
        </>
      )}
    </span>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/40">
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium text-ink-muted">{label}</p>
            <p className="font-display text-xl font-semibold tabular-nums text-ink">{value}</p>
          </div>
        </div>
        {action}
      </div>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

function WorkshopStat({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to} className="rounded-lg border border-[var(--color-panel-border)] px-3 py-2 hover:bg-brand-50/50">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </Link>
  );
}
