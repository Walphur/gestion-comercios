import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Bike, ShoppingBag, MapPin, User } from "lucide-react";
import {
  assignDeliveryRider,
  listPendingPickupOrders,
  markDeliveryDispatched,
  markOrderReady,
  type PendingPickupOrder,
} from "../db/sales";
import {
  notifyCadeteWhatsApp,
  notifyOrderReadyWhatsApp,
} from "../lib/orderReadyWhatsApp";
import { loadDeliveryCadetes, type DeliveryCadete } from "../lib/deliveryRiders";
import { showUserError } from "../lib/notice";
import { formatMoney } from "../lib/format";
import { Button } from "./ui";

interface Props {
  currency: string;
  /** Se incrementa al cerrar una venta para refrescar. */
  refreshKey: number;
}

type FilterTab = "all" | "delivery" | "takeaway";

export default function PosPendingOrders({ currency, refreshKey }: Props) {
  const [orders, setOrders] = useState<PendingPickupOrder[]>([]);
  const [cadetes, setCadetes] = useState<DeliveryCadete[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");

  const reload = useCallback(() => {
    void listPendingPickupOrders()
      .then(setOrders)
      .catch(() => setOrders([]));
    void loadDeliveryCadetes()
      .then(setCadetes)
      .catch(() => setCadetes([]));
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 15000);
    return () => clearInterval(id);
  }, [reload, refreshKey]);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => o.order_type === filter);
  }, [orders, filter]);

  const deliveryCount = orders.filter((o) => o.order_type === "delivery").length;
  const takeawayCount = orders.filter((o) => o.order_type === "takeaway").length;

  if (orders.length === 0) return null;

  async function handleReady(order: PendingPickupOrder) {
    setBusyId(order.id);
    try {
      if (order.pickup_phone?.trim()) {
        const r = await notifyOrderReadyWhatsApp(order.id);
        if (r.message === "copied") {
          alert("WhatsApp abierto. El mensaje está copiado: pegalo con Ctrl+V si hace falta.");
        }
      } else {
        await markOrderReady(order.id);
      }
      reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssignRider(orderId: number, cadeteId: string) {
    setBusyId(orderId);
    try {
      if (!cadeteId) {
        await assignDeliveryRider(orderId, null, null);
      } else {
        const c = cadetes.find((x) => String(x.id) === cadeteId);
        if (!c) throw new Error("Cadete no encontrado.");
        await assignDeliveryRider(orderId, c.display_name, c.phone);
      }
      reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDispatch(order: PendingPickupOrder) {
    setBusyId(order.id);
    try {
      if (!order.delivery_rider?.trim()) {
        throw new Error("Asigná un cadete antes de marcar En camino.");
      }
      await markDeliveryDispatched(order.id);
      if (order.delivery_rider_phone?.trim()) {
        await notifyCadeteWhatsApp(order.id);
      } else if (order.pickup_phone?.trim()) {
        await notifyOrderReadyWhatsApp(order.id);
      } else {
        await markOrderReady(order.id);
      }
      reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusyId(null);
    }
  }

  async function handleWhatsAppCadete(order: PendingPickupOrder) {
    setBusyId(order.id);
    try {
      const r = await notifyCadeteWhatsApp(order.id);
      if (r.message === "copied") {
        alert("WhatsApp abierto. El mensaje está copiado: pegalo con Ctrl+V si hace falta.");
      }
    } catch (e) {
      showUserError(e);
    } finally {
      setBusyId(null);
    }
  }

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "Todos", count: orders.length },
    { id: "delivery", label: "Delivery", count: deliveryCount },
    { id: "takeaway", label: "Retiro", count: takeawayCount },
  ];

  function selectedCadeteId(order: PendingPickupOrder): string {
    if (!order.delivery_rider?.trim()) return "";
    const match = cadetes.find(
      (c) => c.display_name.trim().toLowerCase() === order.delivery_rider!.trim().toLowerCase(),
    );
    return match ? String(match.id) : "";
  }

  return (
    <div className="min-w-0 shrink-0 border-t border-amber-500/30 bg-amber-500/10 px-3 py-2.5 dark:bg-amber-950/30">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
          Pedidos pendientes
        </p>
        <div className="flex min-w-0 flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                filter === t.id
                  ? "bg-amber-600 text-white"
                  : "bg-amber-500/15 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
      </div>
      <ul className="max-h-52 space-y-2 overflow-y-auto overflow-x-hidden">
        {filtered.length === 0 ? (
          <li className="text-xs text-ink-muted">No hay pedidos en este filtro.</li>
        ) : (
          filtered.map((o) => {
            const isDelivery = o.order_type === "delivery";
            const dispatched = Boolean(o.delivery_dispatched_at);
            return (
              <li
                key={o.id}
                className="min-w-0 rounded-lg border border-amber-500/25 bg-[var(--color-panel)] px-2.5 py-2"
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink">
                      {isDelivery ? (
                        <Bike size={14} className="shrink-0 text-amber-700" />
                      ) : (
                        <ShoppingBag size={14} className="shrink-0 text-amber-700" />
                      )}
                      <span className="truncate">
                        #{o.id} · {o.pickup_name?.trim() || "Sin nombre"}
                      </span>
                      {isDelivery && dispatched ? (
                        <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                          En camino
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                      {o.item_summary || "—"} · {formatMoney(o.total, currency)}
                    </p>
                    {o.pickup_phone?.trim() ? (
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                        Tel: {o.pickup_phone.trim()}
                      </p>
                    ) : null}
                    {isDelivery && o.delivery_address?.trim() ? (
                      <p className="mt-0.5 flex min-w-0 items-start gap-1 text-[11px] text-ink-muted">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span className="min-w-0 break-words">{o.delivery_address.trim()}</span>
                      </p>
                    ) : null}
                    {isDelivery && o.delivery_rider?.trim() ? (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
                        <User size={12} className="shrink-0" />
                        Cadete: {o.delivery_rider.trim()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    {isDelivery && !dispatched ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="!px-2 !py-1 text-xs"
                        disabled={busyId === o.id}
                        onClick={() => void handleDispatch(o)}
                      >
                        <Bike size={14} />
                        En camino
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="!px-2 !py-1 text-xs"
                        disabled={busyId === o.id}
                        onClick={() => void handleReady(o)}
                      >
                        <MessageCircle size={14} />
                        {o.pickup_phone?.trim() ? "Listo" : "Cerrar"}
                      </Button>
                    )}
                    {isDelivery && o.delivery_rider?.trim() ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="!px-2 !py-1 text-xs"
                        disabled={busyId === o.id || !o.delivery_rider_phone?.trim()}
                        title={
                          o.delivery_rider_phone?.trim()
                            ? "WhatsApp al cadete"
                            : "Cargá el WhatsApp del cadete en Empleados"
                        }
                        onClick={() => void handleWhatsAppCadete(o)}
                      >
                        <MessageCircle size={14} />
                        WSP cadete
                      </Button>
                    ) : null}
                  </div>
                </div>
                {isDelivery && !dispatched ? (
                  <label className="mt-2 flex min-w-0 items-center gap-2 text-[11px] text-ink-muted">
                    <span className="shrink-0">Cadete</span>
                    {cadetes.length > 0 ? (
                      <select
                        className="min-w-0 flex-1 rounded-md border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1 text-xs text-ink outline-none focus:border-brand-500"
                        value={selectedCadeteId(o)}
                        disabled={busyId === o.id}
                        onChange={(e) => void handleAssignRider(o.id, e.target.value)}
                      >
                        <option value="">Sin asignar</option>
                        {cadetes.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.display_name}
                            {c.phone?.trim() ? "" : " (sin WSP)"}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="min-w-0 flex-1 text-[11px] text-amber-800 dark:text-amber-200">
                        Creá cadetes en Configuración → Empleados (marcá «Cadete» y el WhatsApp).
                      </p>
                    )}
                  </label>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
