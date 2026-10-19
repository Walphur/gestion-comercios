import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HandCoins } from "lucide-react";
import { Card, DataTableShell, EmptyState, PageContent, PageHeader } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { listCommissions, type CommissionRow } from "../db/commissions";
import { formatMoney, formatQty, todayYmd } from "../lib/format";
import { showUserError } from "../lib/notice";

type Period = "today" | "week" | "month" | "last_month" | "custom";

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mes" },
  { id: "last_month", label: "Mes pasado" },
  { id: "custom", label: "Elegir fechas" },
];

function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function periodRange(period: Period): { from: string; to: string } {
  const now = new Date();
  if (period === "week") {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { from: ymd(monday), to: ymd(now) };
  }
  if (period === "month") {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  }
  if (period === "last_month") {
    return {
      from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  const today = todayYmd();
  return { from: today, to: today };
}

function pct(n: number): string {
  return `${Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
}

const DATE_INPUT =
  "min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-ink";

export default function Commissions() {
  const { currency } = useAppConfig();
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState(() => periodRange("month"));
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const range = period === "custom" ? custom : periodRange(period);

  useEffect(() => {
    if (range.from > range.to) return;
    let cancelled = false;
    setLoading(true);
    listCommissions(range.from, range.to)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => showUserError(e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          services: acc.services + r.services_total,
          products: acc.products + r.products_total,
          commission: acc.commission + r.commission,
        }),
        { services: 0, products: 0, commission: 0 },
      ),
    [rows],
  );

  const professionals = rows.filter((r) => r.resource_id != null);
  const unassigned = rows.find((r) => r.resource_id == null);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Comisiones"
        subtitle="Cuánto le toca a cada profesional según lo que cobró. Se calcula con lo cobrado y los descuentos, sin propinas ni ventas anuladas."
      />
      <PageContent className="min-w-0 space-y-4">
        <Card>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  period === p.id
                    ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-200"
                    : "border-[var(--color-panel-border)] text-ink-muted hover:border-brand-400"
                }`}
              >
                {p.label}
              </button>
            ))}
            {period === "custom" && (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <input
                  type="date"
                  aria-label="Desde"
                  value={custom.from}
                  onChange={(e) => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
                      setCustom((c) => ({ ...c, from: e.target.value }));
                    }
                  }}
                  className={DATE_INPUT}
                />
                <span className="text-sm text-ink-muted">a</span>
                <input
                  type="date"
                  aria-label="Hasta"
                  value={custom.to}
                  onChange={(e) => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
                      setCustom((c) => ({ ...c, to: e.target.value }));
                    }
                  }}
                  className={DATE_INPUT}
                />
              </div>
            )}
          </div>
          {range.from > range.to && (
            <p className="mt-2 text-sm text-red-600">La fecha «desde» es posterior a «hasta».</p>
          )}
        </Card>

        {loading ? (
          <p className="text-sm text-ink-muted">Cargando…</p>
        ) : professionals.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="Todavía no hay profesionales"
            description="Cargalos con su porcentaje en Configuración y elegí quién atendió al cobrar en el punto de venta."
            action={
              <Link to="/admin" className="text-sm font-semibold text-brand-600 dark:text-brand-300">
                Ir a Configuración
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <Card>
                <p className="text-xs text-ink-muted">Servicios cobrados</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {formatMoney(totals.services, currency)}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-ink-muted">Productos vendidos</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {formatMoney(totals.products, currency)}
                </p>
              </Card>
              <Card>
                <p className="text-xs text-ink-muted">Total de comisiones</p>
                <p className="mt-1 text-xl font-semibold text-brand-600 dark:text-brand-300">
                  {formatMoney(totals.commission, currency)}
                </p>
              </Card>
            </div>

            <DataTableShell>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Profesional</th>
                    <th className="text-right">Servicios</th>
                    <th className="hidden text-right md:table-cell">Cobrado en servicios</th>
                    <th className="hidden text-right lg:table-cell">Productos</th>
                    <th className="text-right">Comisión</th>
                  </tr>
                </thead>
                <tbody>
                  {professionals.map((r) => (
                    <tr key={r.resource_id}>
                      <td className="min-w-0">
                        <p className="truncate font-medium text-ink">{r.name}</p>
                        <p className="truncate text-xs text-ink-muted">
                          Serv. {pct(r.commission_service_pct)} · Prod. {pct(r.commission_product_pct)}
                          {!r.active ? " · inactivo" : ""}
                        </p>
                      </td>
                      <td className="text-right tabular-nums">{formatQty(r.services_count)}</td>
                      <td className="hidden text-right tabular-nums md:table-cell">
                        {formatMoney(r.services_total, currency)}
                      </td>
                      <td className="hidden text-right tabular-nums lg:table-cell">
                        {formatMoney(r.products_total, currency)}
                      </td>
                      <td className="text-right font-semibold tabular-nums text-ink">
                        {formatMoney(r.commission, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>

            {unassigned && (
              <p className="text-sm text-ink-muted">
                {unassigned.sales_count} venta{unassigned.sales_count === 1 ? "" : "s"} sin
                profesional ({formatMoney(unassigned.services_total + unassigned.products_total, currency)}
                ). Para que cuenten, elegí «Atendió» al cobrar.
              </p>
            )}
          </>
        )}
      </PageContent>
    </div>
  );
}
