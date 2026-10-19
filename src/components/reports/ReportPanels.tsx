import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Boxes, Handshake, ReceiptText, Scale, Users } from "lucide-react";
import { Card, EmptyState } from "../ui";
import { expenseCategory } from "../../config/expenseCategories";
import type { ExpenseSummary } from "../../db/expenses";
import type { CustomerDebtRow, PeriodProfit, StockValuationRow } from "../../db/reports";
import type { SupplierWithBalance } from "../../db/supplierAccounts";
import { formatDateShort, formatMoney, formatQty } from "../../lib/format";

export interface GridColumn {
  label: string;
  num?: boolean;
  /** Ancho de la columna en el grid (por defecto `auto`; la primera, `minmax(0, 1fr)`). */
  width?: string;
}

/** Tabla liviana en grid: no desborda y en pantallas chicas pasa a tarjetas. */
export function ReportGridList({ columns, rows }: { columns: GridColumn[]; rows: ReactNode[][] }) {
  const style = {
    "--report-cols": columns.map((c, i) => c.width ?? (i === 0 ? "minmax(0, 1fr)" : "auto")).join(" "),
  } as CSSProperties;
  return (
    <ul className="report-grid-list" style={style}>
      <li className="report-grid-list__head" aria-hidden>
        {columns.map((c) => (
          <span key={c.label} className={c.num ? "num" : undefined}>
            {c.label}
          </span>
        ))}
      </li>
      {rows.map((r, i) => (
        <li key={i} className="report-grid-list__row">
          {r.map((cell, j) => (
            <span
              key={j}
              className={columns[j]?.num ? "num" : undefined}
              data-label={columns[j]?.num ? columns[j].label : undefined}
              onMouseEnter={
                !columns[j]?.num && typeof cell === "string"
                  ? (e) => {
                      const el = e.currentTarget;
                      el.title = el.scrollWidth > el.clientWidth ? cell : "";
                    }
                  : undefined
              }
            >
              {cell}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

const linkClass = "font-semibold text-brand-600 hover:underline dark:text-brand-300";

export function ResultPanel({
  profit,
  expenses,
  currency,
  notes,
  ownerWithdrawals = 0,
}: {
  profit: PeriodProfit | null;
  expenses: ExpenseSummary;
  currency: string;
  notes: string[];
  ownerWithdrawals?: number;
}) {
  if (!profit) return null;
  const real = profit.profit - expenses.total;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card variant="elevated" className="min-w-0">
        <h2 className="report-section-title mb-3 flex items-center gap-2">
          <Scale size={16} className="text-brand-600" /> Resultado del período
        </h2>
        <ul className="report-result">
          <li className="report-result__row">
            <span>Ventas</span>
            <span>{formatMoney(profit.revenue, currency)}</span>
          </li>
          <li className="report-result__row is-minus">
            <span>Costo de lo vendido (estimado)</span>
            <span>− {formatMoney(profit.cost, currency)}</span>
          </li>
          <li className="report-result__row">
            <span>Ganancia de las ventas · margen {profit.margin_pct.toFixed(1)}%</span>
            <span>{formatMoney(profit.profit, currency)}</span>
          </li>
          <li className="report-result__row is-minus">
            <span>Gastos del negocio</span>
            <span>− {formatMoney(expenses.total, currency)}</span>
          </li>
          <li className={`report-result__row is-total${real < 0 ? " is-loss" : ""}`}>
            <span>Ganancia real (estimada)</span>
            <span>{formatMoney(real, currency)}</span>
          </li>
        </ul>
        {ownerWithdrawals > 0 && (
          <p className="mt-3 flex flex-wrap justify-between gap-2 text-sm text-ink-muted">
            <span>
              Retiros del dueño ·{" "}
              <Link to="/tesoreria" className={linkClass}>
                Tesorería
              </Link>
            </span>
            <span className="tabular-nums">{formatMoney(ownerWithdrawals, currency)}</span>
          </p>
        )}
        <div className="mt-3 space-y-1 text-xs text-ink-muted">
          {notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      </Card>
      <ExpensesByCategoryCard expenses={expenses} currency={currency} />
    </div>
  );
}

export function ExpensesByCategoryCard({ expenses, currency }: { expenses: ExpenseSummary; currency: string }) {
  return (
    <Card variant="elevated" className="min-w-0">
      <h2 className="report-section-title mb-3 flex items-center gap-2">
        <ReceiptText size={16} className="text-brand-600" /> Gastos por categoría
      </h2>
      {expenses.byCategory.length === 0 ? (
        <EmptyState
          compact
          icon={ReceiptText}
          title="No hay gastos anotados en este período"
          description="Cargá el alquiler, la luz y los sueldos en Gastos para ver la ganancia real."
          action={
            <Link to="/gastos" className={linkClass}>
              Ir a Gastos
            </Link>
          }
        />
      ) : (
        <>
          <ReportGridList
            columns={[{ label: "Categoría" }, { label: "Cant.", num: true }, { label: "Total", num: true }]}
            rows={expenses.byCategory.map((c) => [
              expenseCategory(c.category).label,
              String(c.count),
              formatMoney(c.total, currency),
            ])}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link to="/gastos" className={linkClass}>
              Ver el detalle en Gastos
            </Link>
            <span className="text-ink-muted">
              Total: <strong className="tabular-nums text-ink">{formatMoney(expenses.total, currency)}</strong>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

export function DebtorsPanel({ rows, currency }: { rows: CustomerDebtRow[]; currency: string }) {
  const total = rows.reduce((a, r) => a + r.balance, 0);
  return (
    <Card variant="elevated" className="min-w-0">
      <h2 className="report-section-title mb-1 flex items-center gap-2">
        <Users size={16} className="text-brand-600" /> Clientes que deben
      </h2>
      <p className="mb-3 text-xs text-ink-muted">Lo que te deben hoy por fiado. No depende del período.</p>
      {rows.length === 0 ? (
        <EmptyState compact icon={Users} title="Nadie te debe" description="Cuando vendas fiado, acá vas a ver quién debe y cuánto." />
      ) : (
        <>
          <ReportGridList
            columns={[
              { label: "Cliente" },
              { label: "Teléfono", width: "minmax(0, 10rem)" },
              { label: "Último mov.", width: "minmax(0, 6.5rem)" },
              { label: "Debe", num: true },
            ]}
            rows={rows.map((r) => [
              r.name,
              r.phone || "—",
              r.last_movement_at ? formatDateShort(r.last_movement_at) : "—",
              formatMoney(r.balance, currency),
            ])}
          />
          <p className="mt-3 text-right text-sm text-ink-muted">
            {rows.length} cliente{rows.length === 1 ? "" : "s"} · Total:{" "}
            <strong className="tabular-nums text-ink">{formatMoney(total, currency)}</strong>
          </p>
        </>
      )}
    </Card>
  );
}

export function StockValuePanel({
  rows,
  currency,
  showCost,
}: {
  rows: StockValuationRow[];
  currency: string;
  showCost: boolean;
}) {
  const units = rows.reduce((a, r) => a + r.units, 0);
  const cost = rows.reduce((a, r) => a + r.cost_value, 0);
  const price = rows.reduce((a, r) => a + r.price_value, 0);
  const columns: GridColumn[] = [
    { label: "Categoría" },
    { label: "Productos", num: true },
    { label: "Unidades", num: true },
    ...(showCost ? [{ label: "A costo", num: true }] : []),
    { label: "A precio de venta", num: true },
  ];
  return (
    <Card variant="elevated" className="min-w-0">
      <h2 className="report-section-title mb-1 flex items-center gap-2">
        <Boxes size={16} className="text-brand-600" /> Stock valorizado
      </h2>
      <p className="mb-3 text-xs text-ink-muted">
        Cuánto vale la mercadería que tenés hoy. Solo cuenta lo que lleva stock y tiene unidades.
      </p>
      {rows.length === 0 ? (
        <EmptyState compact icon={Boxes} title="No hay mercadería con stock" description="Cuando cargues stock, acá vas a ver cuánto vale." />
      ) : (
        <>
          <ReportGridList
            columns={columns}
            rows={rows.map((r) => [
              r.category_name,
              String(r.products),
              formatQty(Math.round(r.units * 1000) / 1000),
              ...(showCost ? [formatMoney(r.cost_value, currency)] : []),
              formatMoney(r.price_value, currency),
            ])}
          />
          <div className="mt-3 flex flex-wrap justify-end gap-x-5 gap-y-1 text-sm text-ink-muted">
            <span>
              Unidades: <strong className="tabular-nums text-ink">{formatQty(Math.round(units * 1000) / 1000)}</strong>
            </span>
            {showCost && (
              <span>
                A costo: <strong className="tabular-nums text-ink">{formatMoney(cost, currency)}</strong>
              </span>
            )}
            <span>
              A precio de venta: <strong className="tabular-nums text-ink">{formatMoney(price, currency)}</strong>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

export function SupplierDebtPanel({ rows, currency }: { rows: SupplierWithBalance[]; currency: string }) {
  const withDebt = rows.filter((s) => s.balance > 0);
  const total = withDebt.reduce((a, s) => a + s.balance, 0);
  return (
    <Card variant="elevated" className="min-w-0">
      <h2 className="report-section-title mb-1 flex items-center gap-2">
        <Handshake size={16} className="text-brand-600" /> Deuda con proveedores
      </h2>
      <p className="mb-3 text-xs text-ink-muted">Lo que les debés hoy. No depende del período.</p>
      {withDebt.length === 0 ? (
        <EmptyState compact icon={Handshake} title="No le debés a ningún proveedor" />
      ) : (
        <>
          <ReportGridList
            columns={[
              { label: "Proveedor" },
              { label: "Teléfono", width: "minmax(0, 10rem)" },
              { label: "Último mov.", width: "minmax(0, 6.5rem)" },
              { label: "Le debés", num: true },
            ]}
            rows={withDebt.map((s) => [
              s.name,
              s.phone || "—",
              s.last_movement_at ? formatDateShort(s.last_movement_at) : "—",
              formatMoney(s.balance, currency),
            ])}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link to="/proveedores" className={linkClass}>
              Ir a Proveedores
            </Link>
            <span className="text-ink-muted">
              Total: <strong className="tabular-nums text-ink">{formatMoney(total, currency)}</strong>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
