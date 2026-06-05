import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Package,
  AlertTriangle,
  Wallet,
  ShoppingCart,
  Receipt,
  CalendarClock,
  Upload,
  Wrench,
  ClipboardList,
  Car,
} from "lucide-react";
import { countExpiringProducts } from "../db/expiry";
import { PageHeader, Card } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { getProductStats, type ProductStats } from "../db/products";
import { getTodaySummary, type SalesSummary } from "../db/sales";
import { formatMoney } from "../lib/format";
import { rubroUsesWorkshopFlow } from "../config/workshop";
import {
  getWorkshopDashboardStats,
  type WorkshopDashboardStats,
} from "../db/workshopDashboard";

export default function Dashboard() {
  const { businessName, rubroDef, currency, features, isProModuleActive } = useAppConfig();
  const [stats, setStats] = useState<ProductStats>({ total: 0, lowStock: 0, stockValue: 0 });
  const [sales, setSales] = useState<SalesSummary>({ todayTotal: 0, todayCount: 0 });
  const [expiringCount, setExpiringCount] = useState(0);
  const [workshop, setWorkshop] = useState<WorkshopDashboardStats | null>(null);
  const showWorkshop =
    rubroUsesWorkshopFlow(rubroDef.id) &&
    (isProModuleActive("service_orders") || isProModuleActive("appointments"));

  useEffect(() => {
    getProductStats().then(setStats).catch(console.error);
    getTodaySummary().then(setSales).catch(console.error);
    countExpiringProducts(14).then(setExpiringCount).catch(console.error);
    if (showWorkshop) {
      getWorkshopDashboardStats().then(setWorkshop).catch(console.error);
    }
  }, [showWorkshop]);

  return (
    <div>
      <PageHeader title={`Hola, ${businessName}`} subtitle={`Estás trabajando en modo ${rubroDef.label}.`} />
      <div className="p-8">
        {stats.total > 30 && (
          <p className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-ink">
            ¿Tenés productos de más que no usás? En{" "}
            <Link to="/productos" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
              Productos
            </Link>{" "}
            usá «Quitar catálogo masivo» para dejar solo lo que cargaste vos.
          </p>
        )}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.pos && (
            <StatCard
              icon={<Receipt className="text-brand-600" />}
              label="Ventas de hoy"
              value={`${sales.todayCount} · ${formatMoney(sales.todayTotal, currency)}`}
            />
          )}
          <StatCard
            icon={<Package className="text-brand-600" />}
            label="Productos activos"
            value={stats.total.toString()}
          />
          <StatCard
            icon={<AlertTriangle className="text-brand-700" />}
            label="Con stock bajo"
            value={stats.lowStock.toString()}
          />
          <StatCard
            icon={<Wallet className="text-brand-700" />}
            label="Valor del stock (costo)"
            value={formatMoney(stats.stockValue, currency)}
          />
          {features.stock && expiringCount > 0 && (
            <Link to="/stock" className="block">
              <StatCard
                icon={<CalendarClock className="text-amber-600" />}
                label="Por vencer (14 días)"
                value={expiringCount.toString()}
              />
            </Link>
          )}
        </div>

        {showWorkshop && workshop && (
          <>
            <h2 className="mt-10 mb-4 font-display text-xs font-semibold uppercase tracking-widest text-ink-muted">
              Taller hoy
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Link to="/ordenes" className="block">
                <StatCard
                  icon={<Wrench className="text-amber-600" />}
                  label="En reparación"
                  value={String(workshop.ordersInProgress)}
                />
              </Link>
              <Link to="/ordenes" className="block">
                <StatCard
                  icon={<Package className="text-orange-600" />}
                  label="Espera repuestos"
                  value={String(workshop.ordersWaitingParts)}
                />
              </Link>
              <Link to="/ordenes" className="block">
                <StatCard
                  icon={<Car className="text-emerald-600" />}
                  label="Listos para retiro"
                  value={String(workshop.ordersReady)}
                />
              </Link>
              <Link to="/turnos" className="block">
                <StatCard
                  icon={<CalendarClock className="text-brand-600" />}
                  label="Turnos hoy"
                  value={String(workshop.appointmentsToday)}
                />
              </Link>
              <Link to="/presupuestos" className="block">
                <StatCard
                  icon={<ClipboardList className="text-brand-700" />}
                  label="Presupuestos pendientes"
                  value={String(workshop.quotesPending)}
                />
              </Link>
            </div>
          </>
        )}

        <h2 className="mt-10 mb-4 font-display text-xs font-semibold uppercase tracking-widest text-ink-muted">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.pos && (
            <>
              <QuickLink to="/caja" icon={<Wallet />} title="Abrir caja" desc="Turno antes de vender" />
              <QuickLink to="/pos" icon={<ShoppingCart />} title="Punto de venta" desc="Registrar ventas" />
            </>
          )}
          {features.products && (
            <QuickLink to="/productos" icon={<Package />} title="Productos" desc="Agregar o editar artículos" />
          )}
          {showWorkshop && isProModuleActive("service_orders") && (
            <QuickLink to="/ordenes" icon={<Wrench />} title="Órdenes de servicio" desc="Tablero del taller" />
          )}
          {showWorkshop && isProModuleActive("appointments") && (
            <QuickLink to="/turnos" icon={<CalendarClock />} title="Agenda" desc="Turnos del día" />
          )}
          {showWorkshop && isProModuleActive("quotes") && (
            <QuickLink
              to="/presupuestos"
              icon={<ClipboardList />}
              title="Presupuestos"
              desc="Cotizaciones y aprobaciones"
            />
          )}
          {features.products && rubroDef.id === "kiosco" && (
            <QuickLink
              to="/productos?abrir=supermercado"
              icon={<Upload />}
              title="Módulo super (opcional)"
              desc="~190.000 productos si tenés el módulo"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="flex items-center gap-4">
      <div className="stat-icon">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <p className="font-display text-2xl font-semibold text-ink">{value}</p>
      </div>
    </Card>
  );
}

function QuickLink({
  to,
  icon,
  title,
  desc,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link to={to} className="quick-link">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300">
        {icon}
      </div>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-muted">{desc}</p>
      </div>
    </Link>
  );
}
