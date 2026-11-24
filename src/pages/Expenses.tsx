import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, PieChart, Plus, ReceiptText, TrendingDown, TrendingUp } from "lucide-react";
import { Badge, Button, EmptyState, PageContent, PageHeader, StatCard } from "../components/ui";
import ExpenseModal from "../components/expenses/ExpenseModal";
import RecurringExpenseModal from "../components/expenses/RecurringExpenseModal";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { EXPENSE_CATEGORIES, expenseCategory } from "../config/expenseCategories";
import {
  EXPENSE_METHOD_LABELS,
  getExpenseSummary,
  listExpenses,
  listPendingRecurring,
  listRecurringExpenses,
  monthBounds,
  setRecurringExpenseActive,
  voidExpense,
  type Expense,
  type ExpenseSummary,
  type PendingRecurring,
  type RecurringExpense,
} from "../db/expenses";
import { formatDateShort, formatMoney, shiftYmd, todayYmd } from "../lib/format";
import { confirmAction } from "../lib/confirm";
import { showUserError, showUserSuccess } from "../lib/notice";

type Tab = "gastos" | "fijos";
type ListPeriod = "month" | "prev" | "quarter" | "year";

const LIST_PERIODS: { id: ListPeriod; label: string }[] = [
  { id: "month", label: "Este mes" },
  { id: "prev", label: "Mes anterior" },
  { id: "quarter", label: "Últimos 3 meses" },
  { id: "year", label: "Este año" },
];

function listRange(period: ListPeriod, today: string): { from: string; to: string } {
  const month = monthBounds(today);
  if (period === "prev") return monthBounds(shiftYmd(month.from, -1));
  if (period === "quarter") return { from: monthBounds(shiftYmd(month.from, -45)).from, to: month.to };
  if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: month.to };
  return month;
}

const EMPTY_SUMMARY: ExpenseSummary = { total: 0, count: 0, byCategory: [] };

export default function Expenses() {
  const { currency, features, rubroDef } = useAppConfig();
  const { user, can, canViewStock } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "fijos" ? "fijos" : "gastos";
  const today = todayYmd();

  const [month, setMonth] = useState<ExpenseSummary>(EMPTY_SUMMARY);
  const [prevMonth, setPrevMonth] = useState<ExpenseSummary>(EMPTY_SUMMARY);
  const [pending, setPending] = useState<PendingRecurring[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [items, setItems] = useState<Expense[]>([]);
  const [period, setPeriod] = useState<ListPeriod>("month");
  const [category, setCategory] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [fromRecurring, setFromRecurring] = useState<RecurringExpense | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);

  const reload = useCallback(async () => {
    const cur = monthBounds(today);
    const prev = monthBounds(shiftYmd(cur.from, -1));
    const range = listRange(period, today);
    const [m, pm, pend, rec, list] = await Promise.all([
      getExpenseSummary(cur.from, cur.to),
      getExpenseSummary(prev.from, prev.to),
      listPendingRecurring(today),
      listRecurringExpenses(),
      listExpenses({ ...range, category: category || null }),
    ]);
    setMonth(m);
    setPrevMonth(pm);
    setPending(pend);
    setRecurring(rec);
    setItems(list);
    setLoaded(true);
  }, [today, period, category]);

  useEffect(() => {
    void reload().catch(showUserError);
  }, [reload]);

  const listTotal = useMemo(() => items.reduce((a, e) => a + e.amount, 0), [items]);
  const change =
    prevMonth.total > 0 ? ((month.total - prevMonth.total) / prevMonth.total) * 100 : null;
  const biggest = month.byCategory[0];
  const showSuppliersLink = features.stock && rubroDef.id !== "clinica" && can("manage_products") && canViewStock;

  function setTab(next: Tab) {
    setParams(next === "fijos" ? { tab: "fijos" } : {}, { replace: true });
  }

  function openNew(rec: RecurringExpense | null = null) {
    setFromRecurring(rec);
    setExpenseOpen(true);
  }

  async function handleVoid(e: Expense) {
    const ok = await confirmAction({
      title: "Anular gasto",
      message: `¿Anular el gasto de ${formatMoney(e.amount, currency)} (${expenseCategory(e.category).label})?`,
      detail:
        e.cash_movement_id != null
          ? "Si la caja de ese día sigue abierta, el efectivo vuelve al arqueo."
          : "Deja de contar en los gastos y en la ganancia.",
      confirmLabel: "Sí, anular",
    });
    if (!ok) return;
    try {
      const res = await voidExpense(e.id);
      if (res === "cash_closed") {
        showUserSuccess("Gasto anulado. Esa caja ya se cerró; el efectivo no vuelve al arqueo.");
      } else if (res === "cash_returned") {
        showUserSuccess("Gasto anulado. El egreso se sacó de la caja abierta.");
      } else {
        showUserSuccess("Gasto anulado.");
      }
      await reload();
    } catch (err) {
      showUserError(err);
    }
  }

  async function toggleRecurring(r: RecurringExpense) {
    try {
      await setRecurringExpenseActive(r.id, !r.active);
      await reload();
    } catch (e) {
      showUserError(e);
    }
  }

  return (
    <div>
      <PageHeader
        title="Gastos"
        subtitle="Lo que cuesta tener el negocio abierto: alquiler, luz, sueldos y demás"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setEditingRecurring(null); setRecurringOpen(true); }}>
              <CalendarClock size={16} /> Nuevo gasto fijo
            </Button>
            <Button onClick={() => openNew()}>
              <Plus size={16} /> Nuevo gasto
            </Button>
          </div>
        }
      />
      <PageContent>
        <div className="mb-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={ReceiptText}
            label="Gastos de este mes"
            value={formatMoney(month.total, currency)}
            detail={`${month.count} gasto${month.count === 1 ? "" : "s"} anotado${month.count === 1 ? "" : "s"}`}
          />
          <StatCard
            icon={change != null && change > 0 ? TrendingUp : TrendingDown}
            label="Comparado con el mes anterior"
            value={change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(0)}%`}
            detail={`El mes anterior: ${formatMoney(prevMonth.total, currency)}`}
            className={change != null && change > 0 ? "stat-card--debt" : ""}
          />
          <StatCard
            icon={PieChart}
            label="En qué se fue más"
            value={biggest ? expenseCategory(biggest.category).label : "—"}
            detail={biggest ? formatMoney(biggest.total, currency) : "Todavía nada este mes"}
          />
        </div>

        <p className="mb-3 text-xs text-ink-muted">
          Las compras de mercadería se cargan en{" "}
          {showSuppliersLink ? (
            <Link to="/proveedores" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
              Proveedores
            </Link>
          ) : (
            "Proveedores"
          )}
          , no acá: ya cuentan en el costo de lo que vendés.
        </p>

        <div className="app-tabs mb-4" role="tablist" aria-label="Sección gastos">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "gastos"}
            className={`app-tabs__tab ${tab === "gastos" ? "is-active" : ""}`}
            onClick={() => setTab("gastos")}
          >
            Gastos
            {pending.length > 0 ? ` (${pending.length})` : ""}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "fijos"}
            className={`app-tabs__tab ${tab === "fijos" ? "is-active" : ""}`}
            onClick={() => setTab("fijos")}
          >
            Gastos fijos
          </button>
        </div>

        {tab === "gastos" ? (
          <>
            {pending.length > 0 && (
              <section className="expense-pending">
                <h2 className="expense-pending__title">
                  <CalendarClock size={16} aria-hidden /> Gastos fijos de este mes
                </h2>
                <ul className="expense-list">
                  {pending.map((r) => {
                    const cat = expenseCategory(r.category);
                    const Icon = cat.icon;
                    return (
                      <li key={r.id} className="expense-list__row">
                        <span className="expense-list__icon" aria-hidden>
                          <Icon size={16} />
                        </span>
                        <div className="expense-list__main">
                          <span className="truncate font-medium text-ink" title={r.description || cat.label}>
                            {r.description || cat.label}
                          </span>
                          <span className="truncate text-xs text-ink-muted">
                            {cat.label} · se paga el {r.day_of_month}
                          </span>
                        </div>
                        <div className="expense-list__amount">
                          {r.due ? <Badge variant="warning">Falta cargarlo</Badge> : null}
                          <span className="tabular-nums text-sm text-ink-muted">
                            aprox. {formatMoney(r.amount, currency)}
                          </span>
                        </div>
                        <div className="expense-list__actions">
                          <Button size="sm" onClick={() => openNew(r)}>
                            Cargar
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <div className="supplier-toolbar">
              <div className="flex flex-wrap gap-2">
                {LIST_PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`supplier-chip${period === p.id ? " supplier-chip--on" : ""}`}
                    onClick={() => setPeriod(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="expense-filter">
                <span className="sr-only">Tipo de gasto</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Tipo de gasto">
                  <option value="">Todos los tipos</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!loaded ? null : items.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="No hay gastos en este período"
                description="Anotá el alquiler, la luz, los sueldos y lo que pagues para tener el local abierto. Así ves la ganancia real en Reportes."
                action={
                  <Button onClick={() => openNew()}>
                    <Plus size={16} /> Anotar un gasto
                  </Button>
                }
              />
            ) : (
              <>
                <ul className="expense-list">
                  {items.map((e) => {
                    const cat = expenseCategory(e.category);
                    const Icon = cat.icon;
                    return (
                      <li key={e.id} className="expense-list__row">
                        <span className="expense-list__icon" aria-hidden>
                          <Icon size={16} />
                        </span>
                        <div className="expense-list__main">
                          <span className="truncate font-medium text-ink" title={e.description || cat.label}>
                            {e.description || cat.label}
                          </span>
                          <span className="truncate text-xs text-ink-muted">
                            {[
                              formatDateShort(e.paid_at),
                              e.description ? cat.label : null,
                              EXPENSE_METHOD_LABELS[e.method] ?? e.method,
                              e.user_name,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        <span className="expense-list__amount tabular-nums font-semibold text-ink">
                          {formatMoney(e.amount, currency)}
                        </span>
                        <div className="expense-list__actions">
                          <Button size="sm" variant="ghost" onClick={() => handleVoid(e)}>
                            Anular
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-right text-sm text-ink-muted">
                  Total del período: <strong className="tabular-nums text-ink">{formatMoney(listTotal, currency)}</strong>
                </p>
              </>
            )}
          </>
        ) : recurring.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Todavía no cargaste gastos fijos"
            description="Agregá lo que pagás todos los meses (alquiler, internet, sueldos) y WalQo te avisa cuáles faltan cargar."
            action={
              <Button onClick={() => { setEditingRecurring(null); setRecurringOpen(true); }}>
                <Plus size={16} /> Agregar el primero
              </Button>
            }
          />
        ) : (
          <ul className="expense-list">
            {recurring.map((r) => {
              const cat = expenseCategory(r.category);
              const Icon = cat.icon;
              return (
                <li key={r.id} className={`expense-list__row${r.active ? "" : " is-paused"}`}>
                  <span className="expense-list__icon" aria-hidden>
                    <Icon size={16} />
                  </span>
                  <div className="expense-list__main">
                    <span className="truncate font-medium text-ink" title={r.description || cat.label}>
                      {r.description || cat.label}
                    </span>
                    <span className="truncate text-xs text-ink-muted">
                      {cat.label} · día {r.day_of_month} de cada mes
                    </span>
                  </div>
                  <div className="expense-list__amount">
                    {!r.active ? <Badge>Pausado</Badge> : null}
                    <span className="tabular-nums text-sm font-semibold text-ink">
                      {formatMoney(r.amount, currency)}
                    </span>
                  </div>
                  <div className="expense-list__actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingRecurring(r);
                        setRecurringOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleRecurring(r)}>
                      {r.active ? "Pausar" : "Reactivar"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PageContent>

      <ExpenseModal
        open={expenseOpen}
        fromRecurring={fromRecurring}
        userId={user?.id ?? null}
        onClose={() => {
          setExpenseOpen(false);
          setFromRecurring(null);
        }}
        onSaved={() => void reload().catch(showUserError)}
      />
      <RecurringExpenseModal
        open={recurringOpen}
        editing={editingRecurring}
        onClose={() => setRecurringOpen(false)}
        onSaved={() => void reload().catch(showUserError)}
      />
    </div>
  );
}
