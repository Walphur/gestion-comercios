import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, History, Pencil, ShoppingBag, Wrench } from "lucide-react";
import { Modal, Button } from "./ui";
import SaleEditPanel from "./SaleEditPanel";
import { getSaleItems, listSalesByCustomer, updateSale, type SaleUpdateInput } from "../db/sales";
import { listServiceOrdersByCustomer } from "../db/serviceOrders";
import type { Customer, Sale, SaleItem, ServiceOrder } from "../types";
import { formatDateShort, formatMoney, formatTime } from "../lib/format";
import { formatPaymentMethod } from "../lib/paymentLabels";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { getServiceOrderLabels, getServiceOrderStatusLabels } from "../config/serviceOrderLabels";
import { formatVehicleLabel } from "../lib/vehicleFormat";
import { showUserError } from "../lib/notice";
import { logAuditAction } from "../lib/tauri";
import { notifyIntelligenceDataChanged } from "../lib/intelligenceRefresh";

interface Props {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}

export default function CustomerHistoryModal({ customer, open, onClose }: Props) {
  const { currency, rubro, isProModuleActive } = useAppConfig();
  const { user, can } = useAuth();
  const showOrders = isProModuleActive("service_orders");
  const orderLabels = getServiceOrderLabels(rubro);
  const statusLabel = getServiceOrderStatusLabels(rubro);
  const canEdit = can("void_sale");
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [editing, setEditing] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !customer) {
      setSales([]);
      setOrders([]);
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
    ])
      .then(([s, o]) => {
        if (cancelled) return;
        setSales(s);
        setOrders(o);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, customer, showOrders]);

  async function reloadSales() {
    if (!customer) return;
    setSales(await listSalesByCustomer(customer.id));
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
        <div className="max-h-[28rem] space-y-5 overflow-y-auto pr-1">
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

          {sales.length === 0 && (!showOrders || orders.length === 0) && (
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
