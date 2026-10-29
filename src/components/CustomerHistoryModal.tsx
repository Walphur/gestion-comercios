import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronRight,
  Pencil,
  Printer,
  ShoppingBag,
  StickyNote,
  Wallet,
  Wrench,
} from "lucide-react";
import { Modal, Button } from "./ui";
import SaleEditPanel from "./SaleEditPanel";
import {
  getSaleItems,
  listSaleItemsByCustomer,
  listSalesByCustomer,
  updateSale,
  type SaleUpdateInput,
} from "../db/sales";
import { listServiceOrdersByCustomer } from "../db/serviceOrders";
import { getCustomer, listCustomerLedger } from "../db/customers";
import type { Customer, CustomerLedgerEntry, Sale, SaleItem, ServiceOrder } from "../types";
import { formatDateShort, formatMoney, formatQty, formatTime } from "../lib/format";
import {
  groupLedgerBySale,
  ledgerConcept,
  ledgerDetailParts,
  ledgerTotal,
  saleMoveSteps,
  summarizeLedger,
  type LedgerView,
} from "../lib/customerLedger";
import { printCustomerStatement } from "../lib/prints/customerStatement";
import { formatPaymentMethod } from "../lib/paymentLabels";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { getServiceOrderLabels, getServiceOrderStatusLabels } from "../config/serviceOrderLabels";
import { rubroUsesWorkshopFlow } from "../config/workshop";
import { formatVehicleLabel } from "../lib/vehicleFormat";
import { showUserError } from "../lib/notice";
import { logAuditAction } from "../lib/tauri";
import { notifyIntelligenceDataChanged } from "../lib/intelligenceRefresh";
import { listVisitNotesForCustomer, type VisitNoteHistoryItem } from "../db/visitNotes";

interface Props {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}

type Tab = "cuenta" | "ventas" | "ordenes" | "notas";

function signedMoney(n: number, currency: string): string {
  if (Math.abs(n) < 0.005) return formatMoney(0, currency);
  return `${n < 0 ? "−" : "+"} ${formatMoney(Math.abs(n), currency)}`;
}

function amountClass(n: number): string {
  if (Math.abs(n) < 0.005) return "text-ink-muted";
  return n < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400";
}

function stamp(iso: string): string {
  return `${formatDateShort(iso)} ${formatTime(iso)}`;
}

export default function CustomerHistoryModal({ customer, open, onClose }: Props) {
  const { currency, rubro, businessName, isProModuleActive } = useAppConfig();
  const { user, can } = useAuth();
  const showVisitNotes = rubro === "clinica";
  const isWorkshop = rubroUsesWorkshopFlow(rubro);
  const ordersModule = isProModuleActive("service_orders");
  const orderLabels = getServiceOrderLabels(rubro);
  const statusLabel = getServiceOrderStatusLabels(rubro);
  const canEdit = can("void_sale");
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [ledger, setLedger] = useState<CustomerLedgerEntry[]>([]);
  const [savedBalance, setSavedBalance] = useState<number | null>(null);
  const [itemsBySale, setItemsBySale] = useState<Record<number, SaleItem[]>>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [newestFirst, setNewestFirst] = useState(true);
  const [tab, setTab] = useState<Tab>("cuenta");
  const [printing, setPrinting] = useState(false);
  const [visitNotes, setVisitNotes] = useState<VisitNoteHistoryItem[]>([]);
  const [visitNotesError, setVisitNotesError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !customer) {
      setSales([]);
      setOrders([]);
      setLedger([]);
      setSavedBalance(null);
      setItemsBySale({});
      setExpandedKey(null);
      setVisitNotes([]);
      setVisitNotesError("");
      setEditing(null);
      return;
    }
    setTab(showVisitNotes ? "notas" : "cuenta");
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      listSalesByCustomer(customer.id),
      ordersModule ? listServiceOrdersByCustomer(customer.id) : Promise.resolve([]),
      showVisitNotes
        ? listVisitNotesForCustomer(customer.id).catch(() => null)
        : Promise.resolve([] as VisitNoteHistoryItem[]),
      listCustomerLedger(customer.id).catch(() => [] as CustomerLedgerEntry[]),
      getCustomer(customer.id).catch(() => null),
    ])
      .then(([s, o, notes, moves, fresh]) => {
        if (cancelled) return;
        setSales(s);
        setOrders(o);
        setLedger(moves);
        setSavedBalance(fresh ? Number(fresh.balance) || 0 : null);
        if (notes === null) {
          setVisitNotes([]);
          setVisitNotesError("No se pudieron cargar las notas.");
        } else {
          setVisitNotes(notes);
          setVisitNotesError("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, customer, ordersModule, showVisitNotes]);

  async function reloadSales() {
    if (!customer) return;
    setSales(await listSalesByCustomer(customer.id));
    setLedger(await listCustomerLedger(customer.id).catch(() => [] as CustomerLedgerEntry[]));
    const fresh = await getCustomer(customer.id).catch(() => null);
    setSavedBalance(fresh ? Number(fresh.balance) || 0 : null);
    setItemsBySale({});
    setExpandedKey(null);
  }

  const ledgerSum = ledgerTotal(ledger);
  const debt = savedBalance ?? ledgerSum;
  const unexplained = Math.round((debt - ledgerSum) * 100) / 100;
  const hasUnexplained = Math.abs(unexplained) >= 0.005;
  const summary = summarizeLedger(ledger);
  const voidedSaleIds = new Set(sales.filter((s) => s.voided).map((s) => s.id));
  const views = groupLedgerBySale(ledger, voidedSaleIds);
  const shownViews = newestFirst ? [...views].reverse() : views;
  const showOrders = ordersModule && (isWorkshop || orders.length > 0);
  const showLedger = !showVisitNotes || ledger.length > 0 || Math.abs(debt) >= 0.005;

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    ...(showVisitNotes
      ? [{ id: "notas" as Tab, label: `Notas (${visitNotes.length})`, icon: <StickyNote size={14} /> }]
      : []),
    ...(showLedger ? [{ id: "cuenta" as Tab, label: "Cuenta corriente", icon: <Wallet size={14} /> }] : []),
    { id: "ventas", label: `Ventas (${sales.length})`, icon: <ShoppingBag size={14} /> },
    ...(showOrders
      ? [{ id: "ordenes" as Tab, label: `${orderLabels.listTitle} (${orders.length})`, icon: <Wrench size={14} /> }]
      : []),
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;

  async function ensureItems(saleId: number) {
    if (itemsBySale[saleId]) return;
    const items = await getSaleItems(saleId);
    setItemsBySale((prev) => ({ ...prev, [saleId]: items }));
  }

  async function toggleExpanded(key: string, saleId: number | null) {
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    if (saleId != null) await ensureItems(saleId).catch(showUserError);
  }

  async function handlePrint() {
    if (!customer) return;
    setPrinting(true);
    try {
      const items = await listSaleItemsByCustomer(customer.id);
      const bySale = new Map<number, SaleItem[]>();
      for (const it of items) {
        const list = bySale.get(it.sale_id) ?? [];
        list.push(it);
        bySale.set(it.sale_id, list);
      }
      printCustomerStatement({
        businessName,
        currency,
        customerName: customer.name.trim(),
        ledger,
        balance: debt,
        itemsBySale: bySale,
      });
    } catch (e) {
      showUserError(e);
    } finally {
      setPrinting(false);
    }
  }

  async function openEdit(sale: Sale) {
    if (!canEdit || sale.voided) return;
    const items = await getSaleItems(sale.id);
    setEditing({ sale, items });
  }

  async function handleSaveEdit(input: SaleUpdateInput) {
    if (!editing || !user) return;
    setSaving(true);
    try {
      await updateSale(editing.sale.id, user.id, input);
      void logAuditAction(user.id, "sale_edited", "sale", editing.sale.id, `total=${input.total}`);
      notifyIntelligenceDataChanged("sale");
      setEditing(null);
      await reloadSales();
    } catch (e) {
      showUserError(e);
    } finally {
      setSaving(false);
    }
  }

  function orderVehicle(o: ServiceOrder): string | null {
    if (o.vehicle_plate) {
      return formatVehicleLabel({
        plate: o.vehicle_plate,
        brand: o.vehicle_brand,
        model: o.vehicle_model,
      });
    }
    return o.subject_notes;
  }

  function itemsList(saleId: number, expectedTotal?: number) {
    const items = itemsBySale[saleId];
    if (!items) return <p className="text-xs text-ink-muted">Cargando productos…</p>;
    if (items.length === 0) return <p className="text-xs text-ink-muted">Sin productos.</p>;
    const sum = Math.round(items.reduce((acc, it) => acc + it.line_total, 0) * 100) / 100;
    return (
      <>
        <ul className="space-y-0.5 text-xs">
          {items.map((it) => (
            <li key={it.id} className="flex min-w-0 justify-between gap-2">
              <span className="min-w-0 truncate text-ink">
                {formatQty(it.qty)} × {it.name}
              </span>
              <span className="shrink-0 tabular-nums text-ink-muted">{formatMoney(it.line_total, currency)}</span>
            </li>
          ))}
        </ul>
        {expectedTotal != null && Math.abs(sum - expectedTotal) >= 0.01 ? (
          <p className="mt-1 text-[11px] text-ink-muted">
            Los productos muestran el precio de hoy ({formatMoney(sum, currency)}). La diferencia con lo que se anotó
            figura aparte como cambio de precio o como ajuste de la venta.
          </p>
        ) : null}
      </>
    );
  }

  function renderView(v: LedgerView) {
    const expanded = expandedKey === v.key;
    const rowClass =
      "flex w-full min-w-0 items-start justify-between gap-3 px-3 py-2 text-left text-sm";

    if (v.kind === "sale") {
      const steps = saleMoveSteps(v.moves);
      const edited = v.corrections > 0;
      const note = v.voided && Math.abs(v.amount) < 0.005
        ? `Anulada · antes ${formatMoney(v.firstAmount, currency)}`
        : edited
          ? `Corregida ${v.corrections === 1 ? "1 vez" : `${v.corrections} veces`}: antes ${formatMoney(
              v.firstAmount,
              currency,
            )}, ahora ${formatMoney(v.amount, currency)}`
          : null;
      return (
        <li key={v.key} className="min-w-0 rounded-lg border border-[var(--color-panel-border)]">
          <button
            type="button"
            className={`${rowClass} rounded-lg hover:bg-[var(--color-input-bg)]`}
            aria-expanded={expanded}
            onClick={() => void toggleExpanded(v.key, v.saleId)}
          >
            <span className="flex min-w-0 items-start gap-2">
              {expanded ? (
                <ChevronDown size={14} className="mt-0.5 shrink-0 text-ink-muted" />
              ) : (
                <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-muted" />
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">Compra a fiado · Venta #{v.saleId}</span>
                <span className="mt-0.5 block truncate text-xs text-ink-muted">
                  {stamp(v.date)}
                  {note ? <span className="text-amber-700 dark:text-amber-400"> · {note}</span> : null}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className={`block font-semibold tabular-nums ${amountClass(v.amount)}`}>
                {signedMoney(v.amount, currency)}
              </span>
              <span className="block text-[11px] tabular-nums text-ink-muted">
                Saldo {formatMoney(v.balanceAfter, currency)}
              </span>
            </span>
          </button>
          {expanded ? (
            <div className="min-w-0 space-y-2 border-t border-[var(--color-panel-border)] px-3 py-2">
              {itemsList(v.saleId, v.voided ? undefined : v.amount)}
              {steps.length > 1 ? (
                <div className="min-w-0">
                  <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    Movimientos de esta venta
                  </p>
                  <ul className="space-y-0.5 text-xs">
                    {steps.map((s) => (
                      <li key={s.key} className="flex min-w-0 justify-between gap-2">
                        <span className="min-w-0 truncate text-ink-muted">
                          {stamp(s.date)} ·{" "}
                          {s.kind === "compra"
                            ? "Compra"
                            : s.kind === "anulada"
                              ? "Venta anulada"
                              : `Venta #${v.saleId} corregida: antes ${formatMoney(s.before ?? 0, currency)}, ahora ${formatMoney(
                                  s.after ?? 0,
                                  currency,
                                )}`}
                        </span>
                        <span className={`shrink-0 tabular-nums ${amountClass(s.delta)}`}>
                          {signedMoney(s.delta, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </li>
      );
    }

    const m = v.m;
    const detail = [
      stamp(m.created_at),
      m.reason === "payment" && m.payment_method ? formatPaymentMethod(m.payment_method) : null,
      ...ledgerDetailParts(m),
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <li key={v.key} className="min-w-0 rounded-lg border border-[var(--color-panel-border)]">
        <div className={rowClass}>
          <span className="min-w-0 pl-[22px]">
            <span className="block truncate font-medium text-ink">{ledgerConcept(m)}</span>
            <span className="mt-0.5 block line-clamp-2 break-words text-xs text-ink-muted" title={detail}>
              {detail}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block font-semibold tabular-nums ${amountClass(m.delta)}`}>
              {signedMoney(m.delta, currency)}
            </span>
            <span className="block text-[11px] tabular-nums text-ink-muted">
              Saldo {formatMoney(v.balanceAfter, currency)}
            </span>
          </span>
        </div>
      </li>
    );
  }

  function renderLedgerTab() {
    return (
      <div className="min-w-0 space-y-3">
        <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3 sm:p-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Debe hoy</p>
              <p
                data-testid="customer-debt-today"
                className={`text-2xl font-bold tabular-nums ${
                  debt > 0.005 ? "text-amber-700 dark:text-amber-400" : "text-ink"
                }`}
              >
                {formatMoney(debt, currency)}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0"
              loading={printing}
              title="Imprimir o guardar en PDF todos los movimientos, para compararlos con la libreta"
              onClick={() => void handlePrint()}
            >
              {!printing && <Printer size={14} />} Imprimir estado de cuenta
            </Button>
          </div>
          <dl className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
            {summary.map((g) => (
              <div key={g.key} className="min-w-0">
                <dt className="truncate text-[11px] text-ink-muted">{g.label}</dt>
                <dd className="truncate text-sm font-semibold tabular-nums text-ink">
                  {g.key === "payment"
                    ? formatMoney(Math.abs(g.amount), currency)
                    : g.key === "fiado"
                      ? formatMoney(g.amount, currency)
                      : signedMoney(g.amount, currency)}
                </dd>
              </div>
            ))}
            {hasUnexplained ? (
              <div className="min-w-0" role="alert">
                <dt className="truncate text-[11px] font-semibold text-red-600">Diferencia sin detalle</dt>
                <dd className="truncate text-sm font-semibold tabular-nums text-red-600">
                  {signedMoney(unexplained, currency)}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-2 text-xs text-ink-muted">
            Están todos los movimientos desde el primero. Nadie los puede editar ni borrar. Tocá una venta para ver
            qué llevó.
          </p>
        </div>

        {views.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">Todavía no tiene compras a fiado ni pagos.</p>
        ) : (
          <>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs text-ink-muted">
                {views.length} {views.length === 1 ? "movimiento" : "movimientos"}
              </p>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-[var(--color-input-bg)] hover:text-ink"
                onClick={() => setNewestFirst((v) => !v)}
              >
                <ArrowDownUp size={12} /> {newestFirst ? "Más nuevos primero" : "Más viejos primero"}
              </button>
            </div>
            <ul className="min-w-0 space-y-1">{shownViews.map(renderView)}</ul>
          </>
        )}
      </div>
    );
  }

  function renderSalesTab() {
    if (sales.length === 0) {
      return <p className="py-4 text-center text-sm text-ink-muted">Sin ventas registradas a este cliente.</p>;
    }
    return (
      <ul className="min-w-0 space-y-1">
        {sales.map((s) => {
          const key = `sale${s.id}`;
          const expanded = expandedKey === key;
          return (
            <li key={s.id} className="min-w-0 rounded-lg border border-[var(--color-panel-border)]">
              <div className="flex min-w-0 items-start gap-1">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => void toggleExpanded(key, s.id)}
                  className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-input-bg)]"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    {expanded ? (
                      <ChevronDown size={14} className="mt-0.5 shrink-0 text-ink-muted" />
                    ) : (
                      <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-muted" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">
                        Venta #{s.id}
                        {s.voided ? <span className="ml-2 text-xs font-semibold text-red-600">Anulada</span> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">
                        {stamp(s.created_at)} · {formatPaymentMethod(s.payment_method)}
                        {s.seller_name ? ` · ${s.seller_name}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{formatMoney(s.total, currency)}</span>
                </button>
                {canEdit && !s.voided ? (
                  <button
                    type="button"
                    className="mt-1 shrink-0 rounded-lg p-2 text-ink-muted hover:bg-brand-50 hover:text-brand-700"
                    title="Corregir productos"
                    aria-label={`Corregir venta ${s.id}`}
                    onClick={() => void openEdit(s)}
                  >
                    <Pencil size={14} />
                  </button>
                ) : null}
              </div>
              {expanded ? (
                <div className="min-w-0 border-t border-[var(--color-panel-border)] px-3 py-2">{itemsList(s.id)}</div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  function renderOrdersTab() {
    if (orders.length === 0) {
      return (
        <p className="py-4 text-center text-sm text-ink-muted">
          Sin {orderLabels.listTitle.toLowerCase()} para este cliente.
        </p>
      );
    }
    return (
      <div className="min-w-0 space-y-1">
        {orders.map((o) => {
          const vehicle = orderVehicle(o);
          return (
            <Link
              key={o.id}
              to={`/ordenes/${o.id}`}
              onClick={onClose}
              className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-sm hover:border-brand-400"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">
                  {o.order_number} · {o.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-muted">
                  {statusLabel[o.status]} · {formatDateShort(o.created_at)}
                  {vehicle ? ` · ${vehicle}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-semibold tabular-nums text-ink">{formatMoney(o.total, currency)}</span>
                <ChevronRight size={14} className="text-ink-muted" />
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  function renderNotesTab() {
    return (
      <section className="min-w-0">
        <p className="mb-2 text-xs text-ink-muted">
          Nota interna del consultorio. No es receta electrónica ni historia clínica oficial.
        </p>
        {visitNotesError ? (
          <p className="text-sm text-red-600" role="alert">
            {visitNotesError}
          </p>
        ) : visitNotes.length === 0 ? (
          <p className="text-sm text-ink-muted">Todavía no hay notas de atención.</p>
        ) : (
          <div className="space-y-2">
            {visitNotes.map((item) => (
              <article
                key={item.appointment_id}
                className="min-w-0 rounded-lg border border-[var(--color-panel-border)] px-3 py-2"
              >
                <p className="min-w-0 truncate text-xs text-ink-muted">
                  {stamp(item.starts_at)}
                  {" · "}
                  {item.professional?.trim() || "—"}
                  {" · "}
                  {item.service}
                </p>
                <p className="mt-1 max-h-40 min-w-0 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words text-sm text-ink">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <Modal
      open={open}
      wide
      title={
        editing
          ? `Editar venta #${editing.sale.id}`
          : customer
            ? `Historial de ${customer.name}`
            : "Historial"
      }
      onClose={onClose}
      footer={
        editing ? undefined : (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        )
      }
    >
      {!customer ? null : editing ? (
        <div className="max-h-[70vh] min-w-0 overflow-y-auto overflow-x-hidden pr-1">
          <SaleEditPanel
            sale={editing.sale}
            items={editing.items}
            saving={saving}
            onCancel={() => setEditing(null)}
            onSave={handleSaveEdit}
          />
        </div>
      ) : loading ? (
        <p className="py-6 text-center text-sm text-ink-muted">Cargando historial…</p>
      ) : (
        <div className="min-w-0 overflow-x-hidden">
          {tabs.length > 1 ? (
            <div
              role="tablist"
              aria-label="Secciones del historial"
              className="mb-3 flex min-w-0 flex-wrap gap-1 border-b border-[var(--color-panel-border)]"
            >
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  onClick={() => {
                    setTab(t.id);
                    setExpandedKey(null);
                  }}
                  className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                    activeTab === t.id
                      ? "border-brand-600 text-ink"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
          {activeTab === "cuenta"
            ? renderLedgerTab()
            : activeTab === "ventas"
              ? renderSalesTab()
              : activeTab === "ordenes"
                ? renderOrdersTab()
                : renderNotesTab()}
        </div>
      )}
    </Modal>
  );
}
