import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, History, ShoppingBag, Wrench } from "lucide-react";
import { Modal, Button } from "./ui";
import { listSalesByCustomer, getSaleItems } from "../db/sales";
import { listServiceOrdersByCustomer } from "../db/serviceOrders";
import type { Customer, Sale, SaleItem, ServiceOrder } from "../types";
import { formatDateShort, formatMoney, formatTime } from "../lib/format";
import { useAppConfig } from "../context/AppConfig";
import { getServiceOrderStatusLabels } from "../config/serviceOrderLabels";
import { formatVehicleLabel } from "../lib/vehicleFormat";

interface Props {
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}

export default function CustomerHistoryModal({ customer, open, onClose }: Props) {
  const { currency, rubro } = useAppConfig();
  const statusLabel = getServiceOrderStatusLabels(rubro);
  const [sales, setSales] = useState<Sale[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  useEffect(() => {
    if (!open || !customer) {
      setSales([]);
      setOrders([]);
      setExpandedSaleId(null);
      setSaleItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      listSalesByCustomer(customer.id),
      listServiceOrdersByCustomer(customer.id),
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
  }, [open, customer]);

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
      title={customer ? `Historial de ${customer.name}` : "Historial"}
      onClose={onClose}
    >
      {!customer ? null : loading ? (
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
                  <div key={s.id}>
                    <button
                      type="button"
                      onClick={() => void toggleSale(s.id)}
                      className="flex w-full items-center justify-between rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-left text-sm hover:border-brand-400"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-ink">
                          Venta #{s.id}
                          {s.voided ? (
                            <span className="ml-2 text-xs font-semibold text-red-600">Anulada</span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          {formatDateShort(s.created_at)} {formatTime(s.created_at)} ·{" "}
                          <span className="capitalize">{s.payment_method}</span>
                          {s.seller_name ? ` · ${s.seller_name}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">
                        {formatMoney(s.total, currency)}
                      </span>
                    </button>
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

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <Wrench size={14} /> Órdenes / reparaciones ({orders.length})
            </h3>
            {orders.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin órdenes de servicio para este cliente.</p>
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

          {sales.length === 0 && orders.length === 0 && (
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
