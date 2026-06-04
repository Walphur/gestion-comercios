import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Clock, Layers, Package, TrendingUp, Users } from "lucide-react";
import { PageHeader, Card, Button } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import {
  getPeriodComparison,
  getPeriodProfit,
  getPeriodTotals,
  getProductSalesByDay,
  getSalesByCategory,
  getSalesByDay,
  getSalesByEmployee,
  getSalesByHour,
  getSalesByPayment,
  getTopProducts,
  PERIOD_LABELS,
  periodToDays,
  type PeriodProfit,
  type PeriodComparison,
  type ProductSalesByDayRow,
  type ReportPeriod,
  type SalesByCategoryRow,
  type SalesByDayRow,
  type SalesByEmployeeRow,
  type SalesByHourRow,
  type SalesByPaymentRow,
  type TopProductRow,
} from "../db/reports";
import { formatMoney } from "../lib/format";

type TabId = "summary" | "daily" | "products" | "categories" | "hours";

const PERIODS: ReportPeriod[] = ["week", "month", "quarter", "year"];

export default function Reports() {
  const { currency } = useAppConfig();
  const { can } = useAuth();
  const showProfit = can("view_profits");
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [tab, setTab] = useState<TabId>("summary");
  const days = periodToDays(period);

  const [totals, setTotals] = useState({ count: 0, total: 0, avg_ticket: 0 });
  const [comparison, setComparison] = useState<PeriodComparison | null>(null);
  const [profit, setProfit] = useState<PeriodProfit | null>(null);
  const [byDay, setByDay] = useState<SalesByDayRow[]>([]);
  const [byPay, setByPay] = useState<SalesByPaymentRow[]>([]);
  const [top, setTop] = useState<TopProductRow[]>([]);
  const [byEmployee, setByEmployee] = useState<SalesByEmployeeRow[]>([]);
  const [byCategory, setByCategory] = useState<SalesByCategoryRow[]>([]);
  const [byHour, setByHour] = useState<SalesByHourRow[]>([]);
  const [productByDay, setProductByDay] = useState<ProductSalesByDayRow[]>([]);

  useEffect(() => {
    Promise.all([
      getPeriodTotals(days),
      getPeriodComparison(days),
      getSalesByDay(days),
      getSalesByPayment(days),
      getTopProducts(days, 12),
      getSalesByEmployee(days),
      getSalesByCategory(days),
      getSalesByHour(days),
      getProductSalesByDay(days, 250),
    ]).then(([t, cmp, d, p, topP, emp, cat, hrs, pbd]) => {
      setTotals(t);
      setComparison(cmp);
      setByDay(d);
      setByPay(p);
      setTop(topP);
      setByEmployee(emp);
      setByCategory(cat);
      setByHour(hrs);
      setProductByDay(pbd);
    });
  }, [days]);

  useEffect(() => {
    if (!showProfit) {
      setProfit(null);
      return;
    }
    getPeriodProfit(days).then(setProfit);
  }, [days, showProfit]);

  const maxDay = Math.max(...byDay.map((d) => d.total), 1);
  const maxHour = Math.max(...byHour.map((h) => h.total), 1);

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: "summary", label: "Resumen", icon: <TrendingUp size={14} /> },
    { id: "daily", label: "Por día", icon: <BarChart3 size={14} /> },
    { id: "products", label: "Productos / día", icon: <Package size={14} /> },
    { id: "categories", label: "Categorías", icon: <Layers size={14} /> },
    { id: "hours", label: "Por hora", icon: <Clock size={14} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Ventas, productos y estadísticas del período"
        actions={
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
            className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-ink outline-none focus:border-brand-500"
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        }
      />

      <div className="px-8 pt-6 pb-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? "primary" : "secondary"}
              onClick={() => setTab(t.id)}
              className="!py-1.5 !text-xs"
            >
              {t.icon} {t.label}
            </Button>
          ))}
        </div>
      </div>

      {tab === "summary" && (
        <>
          <div
            className={`grid gap-5 p-8 ${showProfit && profit ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
          >
            <Card className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100 dark:bg-brand-900/40 dark:ring-brand-800">
                <TrendingUp className="text-brand-600 dark:text-brand-300" size={22} />
              </div>
              <div>
                <p className="text-sm text-ink-muted">Total vendido</p>
                <p className="font-display text-2xl font-semibold text-ink">
                  {formatMoney(totals.total, currency)}
                </p>
                <p className="text-xs text-ink-muted">{totals.count} ventas</p>
              </div>
            </Card>
            <Card>
              <p className="text-sm text-ink-muted">Ticket promedio</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink">
                {formatMoney(totals.avg_ticket, currency)}
              </p>
            </Card>
            {comparison && (
              <Card>
                <p className="text-sm text-ink-muted">vs período anterior</p>
                <p
                  className={`mt-1 font-display text-2xl font-semibold ${
                    comparison.change_pct >= 0 ? "text-brand-700 dark:text-brand-300" : "text-red-600"
                  }`}
                >
                  {comparison.change_pct >= 0 ? "+" : ""}
                  {comparison.change_pct.toFixed(1)}%
                </p>
                <p className="text-xs text-ink-muted">
                  Antes: {formatMoney(comparison.previous_total, currency)}
                </p>
              </Card>
            )}
            <Card>
              <p className="text-sm text-ink-muted">Medios de pago</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink">{byPay.length}</p>
              <p className="text-xs text-ink-muted">tipos usados</p>
            </Card>
            {showProfit && profit && (
              <Card className="border-brand-200 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-900/30">
                <p className="text-sm text-ink-muted">Ganancia estimada</p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink">
                  {formatMoney(profit.profit, currency)}
                </p>
                <p className="text-xs text-ink-muted">
                  Margen {profit.margin_pct.toFixed(1)}% · Costo{" "}
                  {formatMoney(profit.cost, currency)}
                </p>
              </Card>
            )}
          </div>

          <div className="grid gap-6 px-8 pb-8 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80 dark:text-brand-300/90">
                <BarChart3 size={16} /> Ventas por día
              </h2>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {byDay.map((d) => (
                  <div key={d.day} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-ink-muted">{d.day}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900/50">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(d.total / maxDay) * 100}%` }}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right tabular-nums font-medium text-ink">
                      {formatMoney(d.total, currency)}
                    </span>
                    <span className="w-8 shrink-0 text-right text-ink-muted">{d.count}</span>
                  </div>
                ))}
                {byDay.length === 0 && (
                  <p className="text-sm text-ink-muted">Sin ventas en el período.</p>
                )}
              </div>
            </Card>

            <Card>
              <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80 dark:text-brand-300/90">
                Por medio de pago
              </h2>
              <ul className="space-y-2 text-sm">
                {byPay.map((p) => (
                  <li key={p.payment_method} className="flex justify-between gap-4">
                    <span className="capitalize text-ink">{p.payment_method}</span>
                    <span className="tabular-nums font-medium text-ink">
                      {formatMoney(p.total, currency)}{" "}
                      <span className="text-ink-muted">({p.count})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80 dark:text-brand-300/90">
                <Users size={16} /> Por empleado
              </h2>
              <div className="data-table-wrap border-0 shadow-none">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th className="text-right">Ventas</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byEmployee.map((e) => (
                      <tr key={e.user_id ?? "none"}>
                        <td>{e.display_name}</td>
                        <td className="text-right tabular-nums">{e.count}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatMoney(e.total, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {byEmployee.length === 0 && (
                <p className="text-sm text-ink-muted">Sin ventas por empleado.</p>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80 dark:text-brand-300/90">
                Más vendidos
              </h2>
              <div className="data-table-wrap border-0 shadow-none">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="text-right">Unid.</th>
                      <th className="text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((t) => (
                      <tr key={t.name}>
                        <td>{t.name}</td>
                        <td className="text-right tabular-nums">{t.qty}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatMoney(t.total, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === "daily" && (
        <div className="p-8">
          <Card>
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80">
              Ventas totales por día
            </h2>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Día</th>
                    <th className="text-right">Operaciones</th>
                    <th className="text-right">Total vendido</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-sm text-ink-muted">
                        Sin ventas en {PERIOD_LABELS[period].toLowerCase()}.
                      </td>
                    </tr>
                  ) : (
                    byDay.map((d) => (
                      <tr key={d.day}>
                        <td>{d.day}</td>
                        <td className="text-right tabular-nums">{d.count}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatMoney(d.total, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "products" && (
        <div className="p-8">
          <Card>
            <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80">
              Ventas parciales por producto y día
            </h2>
            <p className="mb-4 text-xs text-ink-muted">
              Detalle de unidades e importe vendido cada día (hasta 250 líneas).
            </p>
            <div className="data-table-wrap max-h-[32rem] overflow-y-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Producto</th>
                    <th className="text-right">Cant.</th>
                    <th className="text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {productByDay.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-sm text-ink-muted">
                        Sin líneas de venta en el período.
                      </td>
                    </tr>
                  ) : (
                    productByDay.map((r) => (
                      <tr key={`${r.day}-${r.name}`}>
                        <td className="cell-muted">{r.day}</td>
                        <td>{r.name}</td>
                        <td className="text-right tabular-nums">{r.qty}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatMoney(r.total, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "categories" && (
        <div className="p-8">
          <Card>
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80">
              Ventas por categoría
            </h2>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th className="text-right">Unidades</th>
                    <th className="text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-sm text-ink-muted">
                        Sin ventas por categoría.
                      </td>
                    </tr>
                  ) : (
                    byCategory.map((c) => (
                      <tr key={c.category_name}>
                        <td>{c.category_name}</td>
                        <td className="text-right tabular-nums">{c.qty}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatMoney(c.total, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "hours" && (
        <div className="p-8">
          <Card>
            <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80">
              <Clock size={16} /> Ventas por hora del día
            </h2>
            <div className="space-y-2">
              {byHour.map((h) => (
                <div key={h.hour} className="flex items-center gap-3 text-sm">
                  <span className="w-14 shrink-0 text-ink-muted">{h.hour}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900/50">
                    <div
                      className="h-full rounded-full bg-brand-400"
                      style={{ width: `${(h.total / maxHour) * 100}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right tabular-nums font-medium text-ink">
                    {formatMoney(h.total, currency)}
                  </span>
                  <span className="w-8 shrink-0 text-right text-ink-muted">{h.count}</span>
                </div>
              ))}
              {byHour.length === 0 && (
                <p className="text-sm text-ink-muted">Sin datos horarios.</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
