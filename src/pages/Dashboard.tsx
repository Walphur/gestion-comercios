import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Package, AlertTriangle, Wallet, ShoppingCart, Receipt, CalendarClock } from "lucide-react";
import { countExpiringProducts } from "../db/expiry";
import { PageHeader, Card } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { getProductStats, type ProductStats } from "../db/products";
import { getTodaySummary, type SalesSummary } from "../db/sales";
import { formatMoney } from "../lib/format";

export default function Dashboard() {
  const { businessName, rubroDef, currency, features } = useAppConfig();
  const [stats, setStats] = useState<ProductStats>({ total: 0, lowStock: 0, stockValue: 0 });
  const [sales, setSales] = useState<SalesSummary>({ todayTotal: 0, todayCount: 0 });
  const [expiringCount, setExpiringCount] = useState(0);

  useEffect(() => {
    getProductStats().then(setStats).catch(console.error);
    getTodaySummary().then(setSales).catch(console.error);
    countExpiringProducts(14).then(setExpiringCount).catch(console.error);
  }, []);

  return (
    <div>
      <PageHeader title={`Hola, ${businessName}`} subtitle={`Estás trabajando en modo ${rubroDef.label}.`} />
      <div className="p-8">
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

        <h2 className="mt-10 mb-4 font-display text-xs font-semibold uppercase tracking-widest text-brand-700/70">
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
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100">
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
    <Link
      to={to}
      className="flex items-center gap-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm transition-all hover:border-brand-300 hover:bg-brand-50/60 hover:shadow-md hover:shadow-brand-900/5"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
        {icon}
      </div>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-muted">{desc}</p>
      </div>
    </Link>
  );
}
