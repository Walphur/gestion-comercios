import { useEffect, useState } from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import { PageHeader, Card } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import {
  getPeriodTotals,
  getSalesByDay,
  getSalesByEmployee,
  getSalesByPayment,
  getTopProducts,
  type SalesByDayRow,
  type SalesByEmployeeRow,
  type SalesByPaymentRow,
  type TopProductRow,
} from "../db/reports";
import { formatMoney } from "../lib/format";

const DAYS_OPTIONS = [7, 14, 30] as const;

export default function Reports() {
  const { currency } = useAppConfig();
  const [days, setDays] = useState<number>(30);
  const [totals, setTotals] = useState({ count: 0, total: 0, avg_ticket: 0 });
  const [byDay, setByDay] = useState<SalesByDayRow[]>([]);
  const [byPay, setByPay] = useState<SalesByPaymentRow[]>([]);
  const [top, setTop] = useState<TopProductRow[]>([]);
  const [byEmployee, setByEmployee] = useState<SalesByEmployeeRow[]>([]);

  useEffect(() => {
    Promise.all([
      getPeriodTotals(days),
      getSalesByDay(Math.min(days, 14)),
      getSalesByPayment(days),
      getTopProducts(days, 8),
      getSalesByEmployee(days),
    ]).then(([t, d, p, topP, emp]) => {
      setTotals(t);
      setByDay(d);
      setByPay(p);
      setTop(topP);
      setByEmployee(emp);
    });
  }, [days]);

  const maxDay = Math.max(...byDay.map((d) => d.total), 1);

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Ventas y rendimiento del período"
        actions={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            {DAYS_OPTIONS.map((d) => (
              <option key={d} value={d}>
                Últimos {d} días
              </option>
            ))}
          </select>
        }
      />

      <div className="grid gap-5 p-8 lg:grid-cols-3">
        <Card className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100">
            <TrendingUp className="text-brand-600" size={22} />
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
        <Card>
          <p className="text-sm text-ink-muted">Medios de pago</p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink">{byPay.length}</p>
          <p className="text-xs text-ink-muted">tipos usados</p>
        </Card>
      </div>

      <div className="grid gap-6 px-8 pb-8 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80">
            <BarChart3 size={16} /> Ventas por día
          </h2>
          <div className="space-y-2">
            {byDay.map((d) => (
              <div key={d.day} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-ink-muted">{d.day}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${(d.total / maxDay) * 100}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right tabular-nums font-medium">
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
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80">
            Por medio de pago
          </h2>
          <ul className="space-y-2 text-sm">
            {byPay.map((p) => (
              <li key={p.payment_method} className="flex justify-between gap-4">
                <span className="capitalize text-ink">{p.payment_method}</span>
                <span className="tabular-nums font-medium">
                  {formatMoney(p.total, currency)}{" "}
                  <span className="text-ink-muted">({p.count})</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80">
            Desempeño por empleado
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-xs text-ink-muted">
                <th className="pb-2">Empleado</th>
                <th className="pb-2 text-right">Ventas</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {byEmployee.map((e) => (
                <tr key={e.user_id ?? "none"} className="border-b border-brand-50">
                  <td className="py-2">{e.display_name}</td>
                  <td className="py-2 text-right tabular-nums">{e.count}</td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatMoney(e.total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {byEmployee.length === 0 && (
            <p className="text-sm text-ink-muted">Sin ventas por empleado en el período.</p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-brand-700/80">
            Productos más vendidos
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-xs text-ink-muted">
                <th className="pb-2">Producto</th>
                <th className="pb-2 text-right">Unidades</th>
                <th className="pb-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {top.map((t) => (
                <tr key={t.name} className="border-b border-brand-50">
                  <td className="py-2">{t.name}</td>
                  <td className="py-2 text-right tabular-nums">{t.qty}</td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatMoney(t.total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {top.length === 0 && (
            <p className="text-sm text-ink-muted">Sin datos de productos.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
