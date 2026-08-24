import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Info,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageContent,
  PageHeader,
  SummaryTotalCard,
} from "../components/ui";
import PlanUpsellNotice from "../components/PlanUpsellNotice";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { getIntelligenceBundle, type IntelligenceSnapshot } from "../db/intelligence";
import type { AlertEvaluationResult } from "../db/intelligence/alertTypes";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import { formatMoney } from "../lib/format";
import { BusinessAlertsPanel } from "../components/BusinessAlertsPanel";

function formatPctSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function TrendBadge({ value, label }: { value: number; label: string }) {
  const up = value > 0.5;
  const down = value < -0.5;
  const Icon = up ? TrendingUp : down ? TrendingDown : Info;
  const tone = up ? "text-emerald-600 dark:text-emerald-400" : down ? "text-red-600 dark:text-red-400" : "text-ink-muted";
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${tone}`}>
      <Icon size={14} />
      <span>{label}: {formatPctSigned(value)}</span>
    </span>
  );
}

function CompactList({
  title,
  empty,
  children,
  href,
  linkLabel,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <Card className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
        {href && linkLabel && (
          <Link to={href} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
            {linkLabel}
          </Link>
        )}
      </div>
      {children ?? <p className="text-sm text-ink-muted">{empty}</p>}
    </Card>
  );
}

export default function BusinessIntelligence() {
  const { currency, features, isProModuleActive } = useAppConfig();
  const { can } = useAuth();
  const { businessIntelligence } = usePlanEntitlements();
  const showProfits = can("view_profits");
  const [snap, setSnap] = useState<IntelligenceSnapshot | null>(null);
  const [alertResult, setAlertResult] = useState<AlertEvaluationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessIntelligence) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getIntelligenceBundle(
      {
        includeQuotes: isProModuleActive("quotes"),
        includeCash: true,
      },
      {
        showProfits,
        featuresStock: features.stock,
        featuresCustomers: features.customers,
      },
    )
      .then(({ snapshot, alerts }) => {
        setSnap(snapshot);
        setAlertResult(alerts);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [businessIntelligence, isProModuleActive, showProfits, features.stock, features.customers]);

  if (!businessIntelligence) {
    return (
      <PageContent>
        <PageHeader title="Inteligencia de Negocio" />
        <PlanUpsellNotice feature="businessIntelligence" />
      </PageContent>
    );
  }

  if (loading) {
    return (
      <PageContent>
        <PageHeader title="Inteligencia de Negocio" />
        <p className="text-ink-muted">Calculando métricas…</p>
      </PageContent>
    );
  }

  if (error || !snap) {
    return (
      <PageContent>
        <PageHeader title="Inteligencia de Negocio" />
        <Alert variant="danger">{error ?? "No se pudieron cargar las métricas."}</Alert>
      </PageContent>
    );
  }

  const lanStale =
    snap.freshness.enabled &&
    (snap.freshness.pendingEvents > 0 ||
      snap.freshness.status !== "connected" ||
      snap.freshness.conflictCount > 0);

  return (
    <PageContent className="min-w-0 space-y-4">
      <PageHeader
        title="Inteligencia de Negocio"
        subtitle="Resumen para decisiones — datos locales, sin asistente de IA"
        actions={
          <Link
            to="/reportes"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] px-3 py-2 text-sm font-semibold text-ink hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
          >
            Ver reportes detallados
          </Link>
        }
      />

      {lanStale && (
        <Alert variant="warning">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            Sync LAN activo: los números pueden actualizarse cuando termine la sincronización
            {snap.freshness.pendingEvents > 0 ? ` (${snap.freshness.pendingEvents} pendientes)` : ""}.
          </span>
        </Alert>
      )}

      {alertResult && (
        <BusinessAlertsPanel
          alerts={alertResult.alerts}
          critical_count={alertResult.critical_count}
          warning_count={alertResult.warning_count}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTotalCard
          totalLabel="Ventas hoy"
          total={formatMoney(snap.salesToday.total, currency)}
          lines={[
            { label: "Operaciones", value: String(snap.salesToday.count) },
            { label: "Unidades", value: String(Math.round(snap.salesToday.units_sold)) },
            { label: "Ticket prom.", value: formatMoney(snap.salesToday.avg_ticket, currency) },
          ]}
        />
        <SummaryTotalCard
          totalLabel="Ventas 30 días"
          total={formatMoney(snap.salesPeriod.total, currency)}
          lines={[
            { label: "Unidades", value: String(Math.round(snap.salesPeriod.units_sold)) },
            { label: "Ticket prom.", value: formatMoney(snap.salesPeriod.avg_ticket, currency) },
          ]}
        />
        {showProfits && (
          <SummaryTotalCard
            totalLabel="Utilidad estimada (30d)"
            total={formatMoney(snap.profitPeriod.profit, currency)}
            lines={[
              { label: "Margen est.", value: `${snap.profitPeriod.margin_pct.toFixed(1)}%` },
              { label: "Ingresos", value: formatMoney(snap.profitPeriod.revenue, currency) },
            ]}
          />
        )}
        <SummaryTotalCard
          totalLabel="Stock bajo mínimo"
          total={String(snap.inventory.low_stock_count)}
          lines={[
            { label: "Productos activos", value: String(snap.inventory.total_products) },
            { label: "Valor inventario", value: formatMoney(snap.inventory.stock_value, currency) },
          ]}
        />
      </div>

      {showProfits && (
        <Alert variant="info">
          <Info size={16} className="shrink-0" />
          <span>{snap.profitPeriod.estimation_note}</span>
        </Alert>
      )}

      <Card className="min-w-0">
        <h3 className="mb-2 font-display text-sm font-semibold text-ink">Comparación 30 días vs período anterior</h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <TrendBadge value={snap.salesComparison.revenue_change_pct} label="Facturación" />
          <TrendBadge value={snap.salesComparison.units_change_pct} label="Unidades" />
          <TrendBadge value={snap.salesComparison.ticket_change_pct} label="Ticket prom." />
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Si sube la facturación pero bajan las unidades, el crecimiento puede venir de aumentos de precio.
        </p>
      </Card>

      {features.stock && (
        <section className="grid gap-3 lg:grid-cols-2">
          <CompactList
            title="Stock bajo mínimo"
            empty="Ningún producto bajo el mínimo."
            href="/productos"
            linkLabel="Productos"
          >
            {snap.stock.low_stock.length > 0 && (
              <ul className="space-y-2 text-sm">
                {snap.stock.low_stock.map((p) => (
                  <li key={p.product_id} className="flex justify-between gap-2">
                    <Link to={`/productos/${p.product_id}`} className="min-w-0 truncate hover:underline">
                      {p.name}
                    </Link>
                    <span className="shrink-0 tabular-nums text-ink-muted">
                      {p.stock} / mín. {p.min_stock}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CompactList>

          <CompactList
            title="Cobertura estimada baja (7 días)"
            empty="Sin productos con consumo reciente y poca cobertura."
            href="/stock"
            linkLabel="Stock"
          >
            {snap.stock.estimated_low_coverage.length > 0 && (
              <>
                <p className="mb-2 text-xs text-ink-muted">
                  Estimación según ventas de los últimos 7 días. No usar para calcular cantidades de compra.
                </p>
                <ul className="space-y-2 text-sm">
                  {snap.stock.estimated_low_coverage.map((p) => (
                    <li key={p.product_id} className="flex justify-between gap-2">
                      <Link to={`/productos/${p.product_id}`} className="min-w-0 truncate hover:underline">
                        {p.name}
                      </Link>
                      <span className="shrink-0 tabular-nums text-ink-muted">
                        ~{p.estimated_days_cover?.toFixed(1)} d · {Math.round(p.units_sold_7d)} u/7d
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CompactList>

          <CompactList
            title="Sin movimiento (60 días)"
            empty="Todos los productos tuvieron ventas recientes."
            href="/productos"
            linkLabel="Productos"
          >
            {snap.stock.slow_moving.length > 0 && (
              <ul className="space-y-2 text-sm">
                {snap.stock.slow_moving.map((p) => (
                  <li key={p.product_id} className="flex justify-between gap-2">
                    <Link to={`/productos/${p.product_id}`} className="min-w-0 truncate hover:underline">
                      {p.name}
                    </Link>
                    <span className="shrink-0 tabular-nums text-ink-muted">Stock {p.stock}</span>
                  </li>
                ))}
              </ul>
            )}
          </CompactList>

          <CompactList
            title="Mayor movimiento (30 días)"
            empty="Sin ventas por producto en el período."
            href="/reportes"
            linkLabel="Reportes"
          >
            {snap.stock.top_movement.length > 0 && (
              <ul className="space-y-2 text-sm">
                {snap.stock.top_movement.map((p) => (
                  <li key={p.product_id} className="flex justify-between gap-2">
                    <Link to={`/productos/${p.product_id}`} className="min-w-0 truncate hover:underline">
                      {p.name}
                    </Link>
                    <span className="shrink-0 tabular-nums text-ink-muted">{Math.round(p.units_sold)} u.</span>
                  </li>
                ))}
              </ul>
            )}
          </CompactList>
        </section>
      )}

      {features.customers && (
        <section className="grid gap-3 lg:grid-cols-2">
          <Card className="min-w-0">
            <div className="mb-3 flex items-center gap-2">
              <Users size={18} />
              <h3 className="font-display text-sm font-semibold text-ink">Clientes</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">Activos: {snap.customers.activity.active}</Badge>
              <Badge variant="warning">En riesgo: {snap.customers.activity.at_risk}</Badge>
              <Badge variant="neutral">Inactivos: {snap.customers.activity.inactive}</Badge>
            </div>
            <p className="mt-3 text-sm text-ink-muted">
              Últimos 30 días: {snap.customers.recurrence.new_customers} nuevos ·{" "}
              {snap.customers.recurrence.returning_customers} recurrentes ·{" "}
              {snap.customers.recurrence.repeat_in_period} con 2+ compras
            </p>
            <Link to="/clientes" className="mt-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400">
              Ver clientes <ArrowUpRight size={14} />
            </Link>
          </Card>

          <CompactList title="Clientes con deuda" empty="Sin saldos pendientes." href="/clientes" linkLabel="Clientes">
            {snap.customers.with_debt.length > 0 && (
              <ul className="space-y-2 text-sm">
                {snap.customers.with_debt.map((c) => (
                  <li key={c.customer_id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="shrink-0 tabular-nums">{formatMoney(c.balance, currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CompactList>
        </section>
      )}

      {snap.cash && (
        <Card className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Wallet size={18} />
            <h3 className="font-display text-sm font-semibold text-ink">Caja — esta PC</h3>
          </div>
          <p className="mb-3 text-xs text-ink-muted">
            Los arqueos no se sincronizan entre equipos; solo reflejan sesiones de esta caja.
          </p>
          <p className="text-sm">
            Últimos 30 días: {snap.cash.summary.with_difference} arqueo(s) con diferencia · neto{" "}
            {formatMoney(snap.cash.summary.net_difference, currency)}
          </p>
          <Link to="/caja" className="mt-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400">
            Ir a caja <ArrowUpRight size={14} />
          </Link>
        </Card>
      )}

      {snap.quotes && (
        <Card className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Package size={18} />
            <h3 className="font-display text-sm font-semibold text-ink">Presupuestos (Pro)</h3>
          </div>
          <p className="mb-2 text-xs text-ink-muted">
            Pueden demorar en reflejarse si usás sync Drive entre PCs.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral">Pendientes: {snap.quotes.summary.pending}</Badge>
            <Badge variant="warning">Por vencer: {snap.quotes.summary.expiring_soon}</Badge>
            <Badge variant="neutral">Sin seguimiento: {snap.quotes.summary.stale_sent}</Badge>
          </div>
          {snap.quotes.pending.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {snap.quotes.pending.slice(0, 5).map((q) => (
                <li key={q.quote_id}>
                  <Link to={`/presupuestos/${q.quote_id}`} className="hover:underline">
                    #{q.quote_number}
                  </Link>
                  {" · "}
                  {formatMoney(q.total, currency)}
                  {q.customer_name ? ` · ${q.customer_name}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {showProfits && snap.margin.worst_sold.length > 0 && (
        <CompactList title="Margen estimado bajo en ventas (30d)" empty="" href="/productos" linkLabel="Productos">
          <ul className="space-y-2 text-sm">
            {snap.margin.worst_sold.map((p) => (
              <li key={p.product_id} className="flex justify-between gap-2">
                <Link to={`/productos/${p.product_id}`} className="min-w-0 truncate hover:underline">
                  {p.name}
                </Link>
                <span className="shrink-0 tabular-nums text-ink-muted">
                  {p.margin_pct.toFixed(1)}% · {Math.round(p.units_sold)} u.
                </span>
              </li>
            ))}
          </ul>
        </CompactList>
      )}

      {!features.stock && !features.customers && snap.stock.low_stock.length === 0 && (
        <EmptyState title="Sin módulos adicionales" description="Activá stock o clientes para más métricas." />
      )}
    </PageContent>
  );
}
