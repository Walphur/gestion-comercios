import {
  BarChart3,
  Clock,
  CreditCard,
  Layers,
  MapPin,
  Monitor,
  Package,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { Card, EmptyState } from "../ui";
import MoneyInflowCard from "./MoneyInflowCard";
import EvolutionChart from "./charts/EvolutionChart";
import DonutChart, { donutColor } from "./charts/DonutChart";
import { ReportGridList } from "./ReportPanels";
import { formatDateShort, formatMoney, formatQty } from "../../lib/format";
import { formatPaymentMethod } from "../../lib/paymentLabels";
import type { MoneyInflow } from "../../db/moneyInflow";
import type {
  ProductSalesByDayRow,
  ReportRegisterRow,
  SalesByCategoryRow,
  SalesByDayRow,
  SalesByEmployeeRow,
  SalesByHourRow,
  SalesByPaymentRow,
  SalesByTableRow,
  SalesByWaiterRow,
} from "../../db/reports";

function formatDayShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso.slice(5);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? m[2]}`;
}

function moneyOf(currency: string) {
  return (n: number) => formatMoney(n, currency);
}

function ShareBar({ pct }: { pct: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-500/15">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${w}%` }} />
    </div>
  );
}

function HourActivityList({
  rows,
  currency,
  emptyTitle,
  emptyDescription,
}: {
  rows: SalesByHourRow[];
  currency: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const money = moneyOf(currency);
  const max = Math.max(...rows.map((h) => h.total), 1);
  if (rows.length === 0) {
    return <EmptyState compact icon={Clock} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="space-y-1.5">
      {rows.map((h) => (
        <div key={h.hour} className="flex min-w-0 items-center gap-2 text-sm">
          <span className="w-11 shrink-0 text-[12px] text-ink-muted">{h.hour}</span>
          <ShareBar pct={(h.total / max) * 100} />
          <span className="w-[5.5rem] shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">
            {money(h.total)}
          </span>
          <span className="w-7 shrink-0 text-right text-[12px] text-ink-muted">{h.count}</span>
        </div>
      ))}
    </div>
  );
}

function RankRows({
  rows,
  currency,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
}: {
  rows: { key: string; name: string; count: number; total: number; hint?: string }[];
  currency: string;
  emptyIcon: typeof Users;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const money = moneyOf(currency);
  const max = Math.max(...rows.map((r) => r.total), 1);
  if (rows.length === 0) {
    return <EmptyState compact icon={EmptyIcon} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <ol className="space-y-1.5">
      {rows.map((r, i) => (
        <li
          key={r.key}
          className="flex min-w-0 items-center gap-2.5 rounded-lg border border-[var(--color-panel-border)] px-2.5 py-1.5"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-500/15 text-[11px] font-bold text-brand-700 dark:text-brand-300">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{r.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <ShareBar pct={(r.total / max) * 100} />
              <span className="shrink-0 text-[11px] text-ink-muted">
                {r.hint ?? `${r.count} ${r.count === 1 ? "venta" : "ventas"}`}
              </span>
            </div>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{money(r.total)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Ventas → Por día: evolución + lista. */
export function DailySalesPanel({
  byDay,
  collectedByDay,
  currency,
  periodLabel,
  totals,
}: {
  byDay: SalesByDayRow[];
  collectedByDay: SalesByDayRow[];
  currency: string;
  periodLabel: string;
  totals: { total: number; count: number };
}) {
  const money = moneyOf(currency);
  const collectedMap = new Map(collectedByDay.map((d) => [d.day, d.total]));
  const evolution = [...byDay]
    .map((d) => ({
      day: d.day,
      sales: d.total,
      collected: collectedMap.get(d.day) ?? 0,
    }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const maxDay = Math.max(...byDay.map((d) => d.total), 1);

  return (
    <div className="report-detail space-y-3">
      <div className="grid min-w-0 gap-2.5 sm:grid-cols-3">
        <Card variant="kpi" className="report-kpi min-w-0 !p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Total vendido</p>
          <p className="kpi-value report-kpi__value mt-0.5 break-all text-ink">{money(totals.total)}</p>
        </Card>
        <Card variant="kpi" className="report-kpi min-w-0 !p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Operaciones</p>
          <p className="kpi-value report-kpi__value mt-0.5 text-ink">{totals.count}</p>
        </Card>
        <Card variant="kpi" className="report-kpi min-w-0 !p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Días con venta</p>
          <p className="kpi-value report-kpi__value mt-0.5 text-ink">{byDay.length}</p>
        </Card>
      </div>

      <div className="grid min-w-0 gap-3 min-[1366px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card variant="elevated" className="min-w-0 border-brand-500/15 !p-4">
          <h2 className="report-section-title mb-0.5 flex items-center gap-2">
            <BarChart3 size={15} className="text-brand-600" /> Evolución diaria
          </h2>
          <p className="mb-2 text-[11px] text-ink-muted">Ventas del día vs dinero cobrado.</p>
          <EvolutionChart points={evolution} currency={currency} />
        </Card>

        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <BarChart3 size={15} className="text-brand-600" /> Por día
          </h2>
          {byDay.length === 0 ? (
            <EmptyState
              compact
              icon={BarChart3}
              title={`Sin ventas en ${periodLabel.toLowerCase()}`}
              description="El detalle diario se completará cuando registres ventas."
            />
          ) : (
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {byDay.map((d) => (
                <div key={d.day} className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="w-[4.25rem] shrink-0 text-[12px] text-ink-muted">{formatDayShort(d.day)}</span>
                  <ShareBar pct={(d.total / maxDay) * 100} />
                  <span className="w-8 shrink-0 text-right text-[11px] text-ink-muted">{d.count}</span>
                  <span className="w-[5.5rem] shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">
                    {money(d.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {byDay.length > 0 && (
        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-3">Detalle por día</h2>
          <ReportGridList
            columns={[
              { label: "Día" },
              { label: "Operaciones", num: true },
              { label: "Total", num: true },
            ]}
            rows={byDay.map((d) => [formatDateShort(d.day), String(d.count), money(d.total)])}
          />
        </Card>
      )}
    </div>
  );
}

/** Ventas → Productos / día. */
export function ProductsByDayPanel({
  rows,
  currency,
  totals,
}: {
  rows: ProductSalesByDayRow[];
  currency: string;
  totals: { total: number };
}) {
  const money = moneyOf(currency);
  const byProduct = new Map<string, { qty: number; total: number }>();
  for (const r of rows) {
    const cur = byProduct.get(r.name) ?? { qty: 0, total: 0 };
    cur.qty += r.qty;
    cur.total += r.total;
    byProduct.set(r.name, cur);
  }
  const ranking = [...byProduct.entries()]
    .map(([name, v]) => ({ key: name, name, count: Math.round(v.qty * 1000) / 1000, total: v.total, hint: `${formatQty(v.qty)} unid.` }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return (
    <div className="report-detail space-y-3">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <Package size={15} className="text-brand-600" /> Ranking del período
          </h2>
          <p className="mb-2 text-[11px] text-ink-muted">
            Top 10 por importe · total {money(totals.total)}
          </p>
          <RankRows
            rows={ranking}
            currency={currency}
            emptyIcon={Package}
            emptyTitle="Sin líneas de venta"
            emptyDescription="El detalle por producto aparecerá cuando haya movimientos."
          />
        </Card>

        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-1 flex items-center gap-2">
            <Package size={15} className="text-brand-600" /> Producto × día
          </h2>
          <p className="mb-3 text-[11px] text-ink-muted">Hasta 250 líneas del período filtrado.</p>
          {rows.length === 0 ? (
            <EmptyState
              compact
              icon={Package}
              title="Sin líneas de venta"
              description="El detalle por producto y día aparecerá cuando haya movimientos."
            />
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <ReportGridList
                columns={[
                  { label: "Día", width: "minmax(0, 5.5rem)" },
                  { label: "Producto" },
                  { label: "Cant.", num: true },
                  { label: "Importe", num: true },
                ]}
                rows={rows.map((r) => [
                  formatDateShort(r.day),
                  r.name,
                  formatQty(r.qty),
                  money(r.total),
                ])}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Ventas → Categorías. */
export function CategoriesPanel({
  rows,
  currency,
}: {
  rows: SalesByCategoryRow[];
  currency: string;
}) {
  const money = moneyOf(currency);
  const total = rows.reduce((a, r) => a + r.total, 0);

  return (
    <div className="report-detail space-y-3">
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <Card variant="elevated" className="min-w-0 border-brand-500/15 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <Layers size={15} className="text-brand-600" /> Distribución
          </h2>
          {rows.length === 0 ? (
            <EmptyState
              compact
              icon={Layers}
              title="Sin ventas por categoría"
              description="Asigná categorías a tus productos para ver este desglose."
            />
          ) : (
            <DonutChart
              currency={currency}
              slices={rows.map((c, i) => ({
                key: c.category_name,
                label: c.category_name,
                value: c.total,
                color: donutColor(i),
              }))}
            />
          )}
        </Card>

        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <Layers size={15} className="text-brand-600" /> Por categoría
          </h2>
          {rows.length === 0 ? (
            <EmptyState
              compact
              icon={Layers}
              title="Sin ventas por categoría"
              description="Asigná categorías a tus productos para ver este desglose."
            />
          ) : (
            <>
              <ReportGridList
                columns={[
                  { label: "Categoría" },
                  { label: "Unidades", num: true },
                  { label: "Importe", num: true },
                ]}
                rows={rows.map((c) => [c.category_name, formatQty(c.qty), money(c.total)])}
              />
              <p className="mt-3 text-right text-sm text-ink-muted">
                Total: <strong className="tabular-nums text-ink">{money(total)}</strong>
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Ventas → Por hora. */
export function HoursSalesPanel({ rows, currency }: { rows: SalesByHourRow[]; currency: string }) {
  return (
    <Card variant="elevated" className="min-w-0 !p-4">
      <h2 className="report-section-title mb-2.5 flex items-center gap-2">
        <Clock size={15} className="text-brand-600" /> Ventas por hora del día
      </h2>
      <p className="mb-3 text-[11px] text-ink-muted">Suma de todas las ventas del período, agrupadas por hora.</p>
      <HourActivityList
        rows={rows}
        currency={currency}
        emptyTitle="Todavía no hay ventas por hora"
        emptyDescription="La distribución por hora del día se mostrará cuando haya ventas."
      />
    </Card>
  );
}

/** Ventas → Por mesa (gastro). */
export function TablesSalesPanel({ rows, currency }: { rows: SalesByTableRow[]; currency: string }) {
  const money = moneyOf(currency);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const ranking = rows.map((r) => ({
    key: `${r.table_number}-${r.zone ?? ""}`,
    name: r.table_label,
    count: r.count,
    total: r.total,
    hint: r.zone?.trim() ? `${r.count} cuentas · ${r.zone}` : `${r.count} cuentas`,
  }));

  return (
    <div className="report-detail space-y-3">
      <Card variant="elevated" className="min-w-0 !p-4">
        <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="report-section-title flex items-center gap-2">
              <MapPin size={15} className="text-brand-600" /> Ventas por mesa
            </h2>
            <p className="mt-1 text-[11px] text-ink-muted">
              Solo cuentas cobradas desde el salón. El total es el mismo que en Ventas.
            </p>
          </div>
          {rows.length > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Total mesas</p>
              <p className="text-lg font-bold tabular-nums text-ink">{money(total)}</p>
            </div>
          )}
        </div>
        <RankRows
          rows={ranking}
          currency={currency}
          emptyIcon={MapPin}
          emptyTitle="Todavía no hay ventas de mesa"
          emptyDescription="Cuando cobres mesas, acá vas a ver cuánto hizo cada una."
        />
      </Card>
      {rows.length > 0 && (
        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-3">Detalle</h2>
          <ReportGridList
            columns={[
              { label: "Mesa" },
              { label: "Zona", width: "minmax(0, 8rem)" },
              { label: "Cuentas", num: true },
              { label: "Prom. comensales", num: true },
              { label: "Total", num: true },
            ]}
            rows={rows.map((r) => [
              r.table_label,
              r.zone?.trim() || "—",
              String(r.count),
              r.avg_guests != null && r.avg_guests > 0
                ? formatQty(Math.round(r.avg_guests * 10) / 10)
                : "—",
              money(r.total),
            ])}
          />
        </Card>
      )}
    </div>
  );
}

/** Ventas → Por mozo (gastro). */
export function WaitersSalesPanel({ rows, currency }: { rows: SalesByWaiterRow[]; currency: string }) {
  const money = moneyOf(currency);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const ranking = rows.map((r) => ({
    key: r.waiter_key || r.waiter_name,
    name: r.waiter_name,
    count: r.count,
    total: r.total,
    hint: `${r.count} ${r.count === 1 ? "cuenta" : "cuentas"}`,
  }));

  return (
    <div className="report-detail space-y-3">
      <Card variant="elevated" className="min-w-0 !p-4">
        <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="report-section-title flex items-center gap-2">
              <UserRound size={15} className="text-brand-600" /> Ventas por mozo
            </h2>
            <p className="mt-1 text-[11px] text-ink-muted">
              Según el mozo asignado en la mesa (no quien cobró en caja).
            </p>
          </div>
          {rows.length > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Total</p>
              <p className="text-lg font-bold tabular-nums text-ink">{money(total)}</p>
            </div>
          )}
        </div>
        <RankRows
          rows={ranking}
          currency={currency}
          emptyIcon={UserRound}
          emptyTitle="Todavía no hay ventas con mozo"
          emptyDescription="Asigná un mozo al abrir o atender la mesa para verlo acá."
        />
      </Card>
    </div>
  );
}

/** Finanzas → Medios de pago + inflow. */
export function PaymentsFinancePanel({
  byPay,
  inflow,
  currency,
  inflowNotes,
}: {
  byPay: SalesByPaymentRow[];
  inflow: MoneyInflow | null;
  currency: string;
  inflowNotes: string[];
}) {
  const money = moneyOf(currency);
  const total = byPay.reduce((a, p) => a + p.total, 0);
  const max = Math.max(...byPay.map((p) => p.total), 1);

  return (
    <div className="report-detail space-y-3">
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <Card variant="elevated" className="min-w-0 border-brand-500/15 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <CreditCard size={15} className="text-brand-600" /> Medios de pago
          </h2>
          {byPay.length === 0 ? (
            <EmptyState
              compact
              icon={CreditCard}
              title="Todavía no hay cobros"
              description="Cuando registres ventas, vas a ver cuánto entró por cada medio de pago."
            />
          ) : (
            <DonutChart
              currency={currency}
              slices={byPay.map((p, i) => ({
                key: p.payment_method,
                label: formatPaymentMethod(p.payment_method),
                value: p.total,
                color: donutColor(i),
              }))}
            />
          )}
        </Card>

        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <Wallet size={15} className="text-brand-600" /> Detalle por medio
          </h2>
          {byPay.length === 0 ? (
            <EmptyState
              compact
              icon={Wallet}
              title="Sin cobros"
              description="Aparecen al registrar ventas."
            />
          ) : (
            <ul className="space-y-1.5">
              {byPay.map((p) => (
                <li
                  key={p.payment_method}
                  className="flex min-w-0 items-center gap-2.5 rounded-lg border border-brand-500/10 bg-brand-500/5 px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium capitalize text-ink">
                      {formatPaymentMethod(p.payment_method)}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <ShareBar pct={(p.total / max) * 100} />
                      <span className="shrink-0 text-[11px] text-ink-muted">
                        {p.count} · {total > 0 ? `${((p.total / total) * 100).toFixed(0)}%` : "0%"}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{money(p.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {inflow ? <MoneyInflowCard inflow={inflow} currency={currency} notes={inflowNotes} /> : null}
    </div>
  );
}

/** Operación → Por empleado. */
export function EmployeesOpsPanel({
  rows,
  currency,
}: {
  rows: SalesByEmployeeRow[];
  currency: string;
}) {
  const money = moneyOf(currency);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const ranking = rows.map((e) => ({
    key: String(e.user_id ?? e.display_name),
    name: e.display_name,
    count: e.count,
    total: e.total,
  }));

  return (
    <div className="report-detail space-y-3">
      <Card variant="elevated" className="min-w-0 !p-4">
        <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
          <h2 className="report-section-title flex items-center gap-2">
            <Users size={15} className="text-brand-600" /> Por empleado
          </h2>
          {rows.length > 0 && (
            <p className="text-sm text-ink-muted">
              Total: <strong className="tabular-nums text-ink">{money(total)}</strong>
            </p>
          )}
        </div>
        <RankRows
          rows={ranking}
          currency={currency}
          emptyIcon={Users}
          emptyTitle="Sin ventas por empleado"
          emptyDescription="El desglose por cajero se mostrará cuando haya ventas registradas."
        />
      </Card>
    </div>
  );
}

/** Operación → Por caja / PC. */
export function RegistersOpsPanel({
  rows,
  currency,
  registerLabel,
}: {
  rows: ReportRegisterRow[];
  currency: string;
  registerLabel: (row: ReportRegisterRow) => string;
}) {
  const money = moneyOf(currency);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const ranking = rows.map((r) => ({
    key: r.device_code,
    name: registerLabel(r),
    count: r.count,
    total: r.total,
  }));

  return (
    <Card variant="elevated" className="min-w-0 !p-4">
      <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="report-section-title flex items-center gap-2">
            <Monitor size={15} className="text-brand-600" /> Por caja / PC
          </h2>
          <p className="mt-1 text-[11px] text-ink-muted">Aporte de cada PC en el período (vista consolidada).</p>
        </div>
        {rows.length > 0 && (
          <p className="text-sm text-ink-muted">
            Total: <strong className="tabular-nums text-ink">{money(total)}</strong>
          </p>
        )}
      </div>
      <RankRows
        rows={ranking}
        currency={currency}
        emptyIcon={Monitor}
        emptyTitle="Sin datos por caja"
        emptyDescription="Con varias PCs sincronizadas vas a ver el aporte de cada una."
      />
    </Card>
  );
}

/** Operación → Actividad por hora. */
export function HoursOpsPanel({ rows, currency }: { rows: SalesByHourRow[]; currency: string }) {
  return (
    <Card variant="elevated" className="min-w-0 !p-4">
      <h2 className="report-section-title mb-2.5 flex items-center gap-2">
        <Clock size={15} className="text-brand-600" /> Actividad operativa por hora
      </h2>
      <p className="mb-3 text-[11px] text-ink-muted">Misma distribución horaria, pensada para ver picos de caja.</p>
      <HourActivityList
        rows={rows}
        currency={currency}
        emptyTitle="Todavía no hay ventas por hora"
        emptyDescription="La distribución por hora del día se mostrará cuando haya ventas."
      />
    </Card>
  );
}
