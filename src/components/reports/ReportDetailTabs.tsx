import {
  BarChart3,
  Clock,
  CreditCard,
  Landmark,
  Layers,
  MapPin,
  Monitor,
  Package,
  Palette,
  Ruler,
  Shirt,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { Card, EmptyState } from "../ui";
import MoneyInflowCard from "./MoneyInflowCard";
import EvolutionChart from "./charts/EvolutionChart";
import DonutChart, { donutColor } from "./charts/DonutChart";
import { ReportGridList } from "./ReportPanels";
import { ReportIcon } from "./ReportIcon";
import { formatDateShort, formatMoney, formatQty } from "../../lib/format";
import { formatPaymentMethod } from "../../lib/paymentLabels";
import type { MoneyInflow } from "../../db/moneyInflow";
import type {
  ClosedCashDiffSummary,
  CustomerDebtRow,
  CustomerSalesStats,
  ProductSalesByDayRow,
  ProductsWithoutSalesRow,
  ReportRegisterRow,
  SalesByCategoryRow,
  SalesByDayRow,
  SalesByEmployeeRow,
  SalesByHourRow,
  SalesByPaymentRow,
  SalesBySizeColorRow,
  SalesByTableRow,
  SalesByVariantAttrRow,
  SalesByWaiterRow,
  TopProductMarginRow,
  TopProductRow,
  VoidedSalesSummary,
} from "../../db/reports";
import { Link } from "react-router-dom";

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

/** Ventas → Por talle (indumentaria). */
export function SizesSalesPanel({
  rows,
  combo,
  currency,
}: {
  rows: SalesByVariantAttrRow[];
  combo: SalesBySizeColorRow[];
  currency: string;
}) {
  const money = moneyOf(currency);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const ranking = rows.map((r) => ({
    key: r.attr_value,
    name: r.attr_value,
    count: r.lines,
    total: r.total,
    hint: `${formatQty(r.qty)} u.`,
  }));
  const topCombo = combo.slice(0, 12);

  return (
    <div className="report-detail space-y-3">
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <Card variant="elevated" className="min-w-0 border-brand-500/15 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <Ruler size={15} className="text-brand-600" /> Distribución por talle
          </h2>
          {rows.length === 0 ? (
            <EmptyState
              compact
              icon={Ruler}
              title="Sin ventas con talle"
              description="Cuando vendas prendas con talle, acá ves qué sale más."
            />
          ) : (
            <DonutChart
              currency={currency}
              slices={rows.map((r, i) => ({
                key: r.attr_value,
                label: r.attr_value,
                value: r.total,
                color: donutColor(i),
              }))}
            />
          )}
        </Card>

        <Card variant="elevated" className="min-w-0 !p-4">
          <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
            <h2 className="report-section-title flex items-center gap-2">
              <Shirt size={15} className="text-brand-600" /> Ranking por talle
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
            emptyIcon={Shirt}
            emptyTitle="Sin ventas con talle"
            emptyDescription="Solo cuenta lo vendido con variante (talle/color)."
          />
        </Card>
      </div>

      <Card variant="elevated" className="min-w-0 !p-4">
        <h2 className="report-section-title mb-2.5 flex items-center gap-2">
          <Palette size={15} className="text-brand-600" /> Más vendidos por talle y color
        </h2>
        <p className="mb-3 text-[11px] text-ink-muted">
          Combinación de atributos de la variante. Si falta talle o color, aparece como «Sin dato».
        </p>
        {topCombo.length === 0 ? (
          <EmptyState
            compact
            icon={Palette}
            title="Sin combinaciones todavía"
            description="Aparecen al vender prendas con talle y color cargados."
          />
        ) : (
          <ReportGridList
            columns={[
              { label: "Talle · color" },
              { label: "Unidades", num: true },
              { label: "Importe", num: true },
            ]}
            rows={topCombo.map((r) => [r.label, formatQty(r.qty), money(r.total)])}
          />
        )}
      </Card>
    </div>
  );
}

/** Ventas → Por color (indumentaria). */
export function ColorsSalesPanel({
  rows,
  currency,
}: {
  rows: SalesByVariantAttrRow[];
  currency: string;
}) {
  const money = moneyOf(currency);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const ranking = rows.map((r) => ({
    key: r.attr_value,
    name: r.attr_value,
    count: r.lines,
    total: r.total,
    hint: `${formatQty(r.qty)} u.`,
  }));

  return (
    <div className="report-detail space-y-3">
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <Card variant="elevated" className="min-w-0 border-brand-500/15 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <Palette size={15} className="text-brand-600" /> Distribución por color
          </h2>
          {rows.length === 0 ? (
            <EmptyState
              compact
              icon={Palette}
              title="Sin ventas con color"
              description="Cuando vendas prendas con color, acá ves qué sale más."
            />
          ) : (
            <DonutChart
              currency={currency}
              slices={rows.map((r, i) => ({
                key: r.attr_value,
                label: r.attr_value,
                value: r.total,
                color: donutColor(i),
              }))}
            />
          )}
        </Card>

        <Card variant="elevated" className="min-w-0 !p-4">
          <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
            <h2 className="report-section-title flex items-center gap-2">
              <Shirt size={15} className="text-brand-600" /> Ranking por color
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
            emptyIcon={Shirt}
            emptyTitle="Sin ventas con color"
            emptyDescription="Solo cuenta lo vendido con variante (talle/color)."
          />
        </Card>
      </div>

      {rows.length > 0 && (
        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-3">Detalle</h2>
          <ReportGridList
            columns={[
              { label: "Color" },
              { label: "Unidades", num: true },
              { label: "Líneas", num: true },
              { label: "Importe", num: true },
            ]}
            rows={rows.map((r) => [r.attr_value, formatQty(r.qty), String(r.lines), money(r.total)])}
          />
        </Card>
      )}
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
        <ReportIcon icon={Clock} size="md" className="text-brand-600" /> Actividad operativa por hora
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

/** Ventas → Productos (profundidad: facturación, unidades, margen, sin ventas). */
export function ProductsDepthPanel({
  byDay,
  top,
  byMargin,
  withoutSales,
  currency,
  totals,
  unitsSold,
  showMargin,
  voided,
}: {
  byDay: ProductSalesByDayRow[];
  top: TopProductRow[];
  byMargin: TopProductMarginRow[];
  withoutSales: ProductsWithoutSalesRow[];
  currency: string;
  totals: { total: number; count: number };
  unitsSold: number;
  showMargin: boolean;
  voided: VoidedSalesSummary | null;
}) {
  const money = moneyOf(currency);
  return (
    <div className="report-detail space-y-3">
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Card variant="kpi" className="report-kpi !p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Facturación</p>
          <p className="kpi-value report-kpi__value mt-0.5 text-ink">{money(totals.total)}</p>
        </Card>
        <Card variant="kpi" className="report-kpi !p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Operaciones</p>
          <p className="kpi-value report-kpi__value mt-0.5 text-ink">{totals.count}</p>
        </Card>
        <Card variant="kpi" className="report-kpi !p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Unidades</p>
          <p className="kpi-value report-kpi__value mt-0.5 text-ink">{formatQty(unitsSold)}</p>
        </Card>
        <Card variant="kpi" className="report-kpi !p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Anulaciones</p>
          <p className="kpi-value report-kpi__value mt-0.5 text-ink">
            {voided && voided.count > 0 ? `${voided.count} · ${money(voided.total)}` : "—"}
          </p>
        </Card>
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <ReportIcon icon={Package} size="md" className="text-brand-600" /> Por facturación
          </h2>
          <RankRows
            rows={top.slice(0, 10).map((t) => ({
              key: t.name,
              name: t.name,
              count: t.qty,
              total: t.total,
              hint: `${formatQty(t.qty)} unid.`,
            }))}
            currency={currency}
            emptyIcon={Package}
            emptyTitle="Sin productos"
            emptyDescription="El ranking aparece con ventas del período."
          />
        </Card>

        {showMargin ? (
          <Card variant="elevated" className="min-w-0 !p-4">
            <h2 className="report-section-title mb-2.5 flex items-center gap-2">
              <ReportIcon icon={Package} size="md" className="text-brand-600" /> Por rentabilidad estimada
            </h2>
            <p className="mb-2 text-[11px] text-ink-muted">
              Margen = importe − (unidades × costo actual). Si falta el costo, el margen queda inflado.
            </p>
            <RankRows
              rows={byMargin.slice(0, 10).map((t) => ({
                key: t.name,
                name: t.name,
                count: t.qty,
                total: t.margin,
                hint: `${formatQty(t.qty)} · venta ${money(t.total)}`,
              }))}
              currency={currency}
              emptyIcon={Package}
              emptyTitle="Sin margen para mostrar"
              emptyDescription="Cargá costos en productos para ver rentabilidad."
            />
          </Card>
        ) : (
          <Card variant="elevated" className="min-w-0 !p-4">
            <h2 className="report-section-title mb-2.5 flex items-center gap-2">
              <ReportIcon icon={Package} size="md" className="text-brand-600" /> Por unidades
            </h2>
            <RankRows
              rows={[...top]
                .sort((a, b) => b.qty - a.qty)
                .slice(0, 10)
                .map((t) => ({
                  key: t.name,
                  name: t.name,
                  count: t.qty,
                  total: t.total,
                  hint: `${formatQty(t.qty)} unid.`,
                }))}
              currency={currency}
              emptyIcon={Package}
              emptyTitle="Sin productos"
              emptyDescription="El ranking por unidades aparece con ventas."
            />
          </Card>
        )}
      </div>

      <Card variant="elevated" className="min-w-0 !p-4">
        <h2 className="report-section-title mb-2 flex items-center gap-2">
          <ReportIcon icon={Package} size="md" className="text-brand-600" /> Sin ventas en el período
        </h2>
        <p className="mb-3 text-[11px] text-ink-muted">
          Productos activos con stock que no tuvieron líneas de venta (hasta 30).
        </p>
        {withoutSales.length === 0 ? (
          <EmptyState
            compact
            icon={Package}
            title="Todos movieron stock o no hay catálogo"
            description="Si un producto no vendió, aparece acá."
          />
        ) : (
          <ReportGridList
            columns={[
              { label: "Producto" },
              { label: "Stock", num: true },
            ]}
            rows={withoutSales.map((p) => [p.name, formatQty(p.stock)])}
          />
        )}
      </Card>

      <ProductsByDayPanel rows={byDay} currency={currency} totals={totals} />
    </div>
  );
}

/** Ventas → Clientes. */
export function ClientsSalesPanel({
  stats,
  debtors,
  currency,
}: {
  stats: CustomerSalesStats | null;
  debtors: CustomerDebtRow[];
  currency: string;
}) {
  const money = moneyOf(currency);
  return (
    <div className="report-detail space-y-3">
      <div className="grid min-w-0 gap-2 sm:grid-cols-3">
        <Card variant="kpi" className="report-kpi !p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Nuevos</p>
          <p className="kpi-value report-kpi__value mt-0.5 text-ink">{stats?.new_customers ?? 0}</p>
          <p className="text-[11px] text-ink-muted">Primera compra en el período</p>
        </Card>
        <Card variant="kpi" className="report-kpi !p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Recurrentes</p>
          <p className="kpi-value report-kpi__value mt-0.5 text-ink">{stats?.returning_customers ?? 0}</p>
          <p className="text-[11px] text-ink-muted">Ya habían comprado antes</p>
        </Card>
        <Card variant="kpi" className="report-kpi !p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Deudores hoy</p>
          <p className="kpi-value report-kpi__value mt-0.5 text-ink">{debtors.length}</p>
          <p className="text-[11px] text-ink-muted">Saldo pendiente actual</p>
        </Card>
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <ReportIcon icon={Users} size="md" className="text-brand-600" /> Mayor facturación
          </h2>
          <RankRows
            rows={(stats?.top ?? []).map((c) => ({
              key: String(c.customer_id),
              name: c.name,
              count: c.count,
              total: c.total,
              hint: `${c.count} ${c.count === 1 ? "venta" : "ventas"}`,
            }))}
            currency={currency}
            emptyIcon={Users}
            emptyTitle="Sin clientes en el período"
            emptyDescription="Las ventas con cliente asignado aparecen acá."
          />
        </Card>
        <Card variant="elevated" className="min-w-0 !p-4">
          <h2 className="report-section-title mb-2.5 flex items-center gap-2">
            <ReportIcon icon={Users} size="md" className="text-brand-600" /> Deudores (saldo hoy)
          </h2>
          {debtors.length === 0 ? (
            <EmptyState compact icon={Users} title="Nadie debe" description="No hay saldos pendientes." />
          ) : (
            <ReportGridList
              columns={[
                { label: "Cliente" },
                { label: "Saldo", num: true },
              ]}
              rows={debtors.slice(0, 12).map((d) => [d.name, money(d.balance)])}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

/** Operación → Cierres de caja (diferencias). No duplica Tesorería. */
export function CashClosuresPanel({
  summary,
  currency,
}: {
  summary: ClosedCashDiffSummary | null;
  currency: string;
}) {
  const money = moneyOf(currency);
  const s = summary ?? {
    sessions: 0,
    with_diff: 0,
    total_diff: 0,
    total_expected: 0,
    total_declared: 0,
  };
  return (
    <div className="report-detail space-y-3">
      <Card variant="elevated" className="min-w-0 !p-4">
        <h2 className="report-section-title mb-2 flex items-center gap-2">
          <ReportIcon icon={Landmark} size="md" className="text-brand-600" /> Cierres de caja del período
        </h2>
        <p className="mb-3 text-[11px] text-ink-muted">
          Solo arqueos cerrados (esperado vs declarado). Los movimientos de Tesorería se ven en su pantalla.
        </p>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-[var(--color-panel-border)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-ink-muted">Cierres</p>
            <p className="text-lg font-bold tabular-nums text-ink">{s.sessions}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-panel-border)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-ink-muted">Con diferencia</p>
            <p className="text-lg font-bold tabular-nums text-ink">{s.with_diff}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-panel-border)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-ink-muted">Suma diferencias</p>
            <p className="text-lg font-bold tabular-nums text-ink">{money(s.total_diff)}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-panel-border)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-ink-muted">Declarado / esperado</p>
            <p className="text-sm font-semibold tabular-nums text-ink">
              {money(s.total_declared)} / {money(s.total_expected)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Detalle por turno:{" "}
          <Link to="/caja" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
            ir a Caja
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
