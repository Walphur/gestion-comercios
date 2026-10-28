import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, History, Pencil, ShoppingBag, StickyNote, Wallet, Wrench } from "lucide-react";
import { Modal, Button } from "./ui";
import SaleEditPanel from "./SaleEditPanel";
import { getSaleItems, listSalesByCustomer, updateSale, type SaleUpdateInput } from "../db/sales";
import { listServiceOrdersByCustomer } from "../db/serviceOrders";
import { listCustomerLedger } from "../db/customers";
import type { Customer, CustomerLedgerEntry, Sale, SaleItem, ServiceOrder } from "../types";
import { formatDateShort, formatMoney, formatTime } from "../lib/format";
import { formatPaymentMethod } from "../lib/paymentLabels";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { getServiceOrderLabels, getServiceOrderStatusLabels } from "../config/serviceOrderLabels";
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

function ledgerConcept(m: CustomerLedgerEntry): string {
  switch (m.reason) {
    case "payment":
      return "Pago de deuda";
    case "fiado":
      return m.is_local && m.reference_type === "sale" && m.reference_id != null
        ? `Compra a fiado · Venta #${m.reference_id}`
        : "Compra a fiado";
    case "adjust_down":
      return "Corrección de una venta a fiado";
    case "opening_balance":
      return "Deuda inicial";
    case "price_adjust":
      return m.delta > 0 ? "Aumento de precio en lo fiado" : "Baja de precio en lo fiado";
    case "legacy_seed":
      return "Saldo anterior";
    default:
      return m.delta > 0 ? "Suma a la deuda" : "Baja de la deuda";
  }
}

export default function CustomerHistoryModal({ customer, open, onClose }: Props) {
  const { currency, rubro, isProModuleActive } = useAppConfig();
  const { user, can } = useAuth();
  const showOrders = isProModuleActive("service_orders");
  const showVisitNotes = rubro === "clinica";
  const orderLabels = getServiceOrderLabels(rubro);
  const statusLabel = getServiceOrderStatusLabels(rubro);
  const canEdit = can("void_sale");
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [ledger, setLedger] = useState<CustomerLedgerEntry[]>([]);
  const [visitNotes, setVisitNotes] = useState<VisitNoteHistoryItem[]>([]);
  const [visitNotesError, setVisitNotesError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [editing, setEditing] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !customer) {
      setSales([]);
      setOrders([]);
      setLedger([]);
      setVisitNotes([]);
      setVisitNotesError("");
      setExpandedSaleId(null);
      setSaleItems([]);
      setEditing(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      listSalesByCustomer(customer.id),
      showOrders ? listServiceOrdersByCustomer(customer.id) : Promise.resolve([]),
      showVisitNotes
        ? listVisitNotesForCustomer(customer.id).catch(() => null)
        : Promise.resolve([] as VisitNoteHistoryItem[]),
      listCustomerLedger(customer.id).catch(() => [] as CustomerLedgerEntry[]),
    ])
      .then(([s, o, notes, moves]) => {
        if (cancelled) return;
        setSales(s);
        setOrders(o);
        setLedger(moves);
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
  }, [open, customer, showOrders, showVisitNotes]);

  async function reloadSales() {
    if (!customer) return;
    setSales(await listSalesByCustomer(customer.id));
    setLedger(await listCustomerLedger(customer.id).catch(() => [] as CustomerLedgerEntry[]));
  }

  let running = 0;
  const ledgerRows = ledger
    .map((m) => {
      running += m.delta;
      return { m, balanceAfter: running };
    })
    .reverse();

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
      setExpandedSaleId(null);
      await reloadSales();
    } catch (e) {
      showUserError(e);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSale(saleId: number) {
    if (expandedSaleId === saleId) {
      setExpandedSaleId(null);
      setSaleItems([]);
      return;
    }
    setExpandedSaleId(saleId);
    setSaleItems(await getSaleItems(saleId));
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

  return (
    <Modal
      open={open}
      wide={editing !== null}
      title={
        editing
          ? `Editar venta #${editing.sale.id}`
          : customer
            ? `Historial de ${customer.name}`
            : "Historial"
      }
      onClose={onClose}
    >
      {!customer ? null : editing ? (
        <div className="max-h-[70vh] min-w-0 overflow-y-auto pr-1">
          <p className="mb-3 text-sm text-ink-muted">
            Podés corregir los productos aunque la venta sea de otro día. El stock se ajusta con el cambio.
          </p>
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
        <div className="max-h-[28rem] min-w-0 space-y-5 overflow-y-auto overflow-x-hidden pr-1">
          {showVisitNotes && (
            <section className="min-w-0">
              <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <StickyNote size={14} /> Notas de atención ({visitNotes.length})
              </h3>
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
                        {formatDateShort(item.starts_at)} {formatTime(item.starts_at)}
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
          )}
          {ledgerRows.length > 0 ? (
            <section className="min-w-0">
              <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <Wallet size={14} /> Cuenta corriente ({ledgerRows.length})
              </h3>
              <p className="mb-2 text-xs text-ink-muted">
                Debe hoy{" "}
                <strong className="tabular-nums text-ink">{formatMoney(running, currency)}</strong>. Los pagos y las
                compras a fiado quedan registrados y nadie los puede editar ni borrar.
              </p>
              <div className="space-y-1">
                {ledgerRows.map(({ m, balanceAfter }) => {
                  const isPayment = m.reason === "payment";
                  const detail = [
                    `${formatDateShort(m.created_at)} ${formatTime(m.created_at)}`,
                    isPayment && m.payment_method ? formatPaymentMethod(m.payment_method) : null,
                    isPayment ? `Cobró: ${m.user_name?.trim() || "sin dato"}` : null,
                    m.notes?.trim() || null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div
                      key={m.id}
                      className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{ledgerConcept(m)}</span>
                        <span className="mt-0.5 block truncate text-xs text-ink-muted" title={detail}>
                          {detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={`block font-semibold tabular-nums ${
                            m.delta < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {m.delta < 0 ? "−" : "+"} {formatMoney(Math.abs(m.delta), currency)}
                        </span>
                        <span className="block text-[11px] tabular-nums text-ink-muted">
                          Saldo {formatMoney(balanceAfter, currency)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <ShoppingBag size={14} /> Ventas ({sales.length})
            </h3>
            {sales.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin ventas registradas a este cliente.</p>
            ) : (
              <div className="space-y-1">
                {sales.map((s) => (
                  <div key={s.id} className="min-w-0">
                  <div className="flex min-w-0 items-start gap-1">
                    <button
                      type="button"
                      onClick={() => void toggleSale(s.id)}
                      className="flex min-w-0 flex-1 items-center justify-between rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-left text-sm hover:border-brand-400"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-ink">
                          Venta #{s.id}
                          {s.voided ? (
                            <span className="ml-2 text-xs font-semibold text-red-600">Anulada</span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-muted">
                          {formatDateShort(s.created_at)} {formatTime(s.created_at)} ·{" "}
                          {formatPaymentMethod(s.payment_method)}
                          {s.seller_name ? ` · ${s.seller_name}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">
                        {formatMoney(s.total, currency)}
                      </span>
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
                    {expandedSaleId === s.id && (
                      <ul className="mt-1 space-y-0.5 rounded-lg bg-[var(--color-panel)] px-3 py-2 text-xs text-ink-muted">
                        {saleItems.length === 0 ? (
                          <li>Sin ítems.</li>
                        ) : (
                          saleItems.map((it) => (
                            <li key={it.id} className="flex justify-between gap-2">
                              <span className="min-w-0 truncate">
                                {it.qty} × {it.name}
                              </span>
                              <span className="shrink-0 tabular-nums">
                                {formatMoney(it.line_total, currency)}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {showOrders ? (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <Wrench size={14} /> {orderLabels.listTitle} ({orders.length})
            </h3>
            {orders.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin {orderLabels.listTitle.toLowerCase()} para este cliente.</p>
            ) : (
              <div className="space-y-1">
                {orders.map((o) => {
                  const vehicle = orderVehicle(o);
                  return (
                    <Link
                      key={o.id}
                      to={`/ordenes/${o.id}`}
                      onClick={onClose}
                      className="flex items-center justify-between rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-sm hover:border-brand-400"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-ink">
                          {o.order_number} · {o.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {statusLabel[o.status]} · {formatDateShort(o.created_at)}
                          {vehicle ? ` · ${vehicle}` : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold tabular-nums text-ink">
                          {formatMoney(o.total, currency)}
                        </span>
                        <ChevronRight size={14} className="text-ink-muted" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
          ) : null}

          {sales.length === 0 && ledgerRows.length === 0 && (!showOrders || orders.length === 0) && (
            <p className="flex items-center justify-center gap-2 py-2 text-xs text-ink-muted">
              <History size={14} /> Cuando haya movimientos, van a aparecer acá.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
