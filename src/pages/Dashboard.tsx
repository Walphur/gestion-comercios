import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Package, AlertTriangle, Wallet, ShoppingCart, Receipt } from "lucide-react";
import { PageHeader, Card } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { getProductStats, type ProductStats } from "../db/products";
import { getTodaySummary, type SalesSummary } from "../db/sales";
import { formatMoney } from "../lib/format";

export default function Dashboard() {
  const { businessName, rubroDef, currency, features } = useAppConfig();
  const [stats, setStats] = useState<ProductStats>({ total: 0, lowStock: 0, stockValue: 0 });
  const [sales, setSales] = useState<SalesSummary>({ todayTotal: 0, todayCount: 0 });

  useEffect(() => {
    getProductStats().then(setStats).catch(console.error);
    getTodaySummary().then(setSales).catch(console.error);
  }, []);

  return (
    <div>
      <PageHeader title={`Hola, ${businessName}`} subtitle={`Estás trabajando en modo ${rubroDef.label}.`} />
      <div className="p-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.pos && (
            <StatCard
              icon={<Receipt className="text-emerald-600" />}
              label="Ventas de hoy"
              value={`${sales.todayCount} · ${formatMoney(sales.todayTotal, currency)}`}
            />
          )}
          <StatCard
            icon={<Package className="text-indigo-600" />}
            label="Productos activos"
            value={stats.total.toString()}
          />
          <StatCard
            icon={<AlertTriangle className="text-amber-500" />}
            label="Con stock bajo"
            value={stats.lowStock.toString()}
          />
          <StatCard
            icon={<Wallet className="text-emerald-600" />}
            label="Valor del stock (costo)"
            value={formatMoney(stats.stockValue, currency)}
          />
        </div>

        <h2 className="mt-10 mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.pos && (
            <QuickLink to="/pos" icon={<ShoppingCart />} title="Abrir caja" desc="Empezar a vender" />
          )}
          {features.products && (
            <QuickLink to="/productos" icon={<Package />} title="Productos" desc="Agregar o editar artículos" />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="flex items-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">{icon}</div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
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
      className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
        {icon}
      </div>
      <div>
        <p className="font-medium text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{desc}</p>
      </div>
    </Link>
  );
}
