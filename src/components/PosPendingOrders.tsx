import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Bike, ShoppingBag } from "lucide-react";
import {
  listPendingPickupOrders,
  markOrderReady,
  type PendingPickupOrder,
} from "../db/sales";
import { notifyOrderReadyWhatsApp } from "../lib/orderReadyWhatsApp";
import { showUserError } from "../lib/notice";
import { formatMoney } from "../lib/format";
import { Button } from "./ui";

interface Props {
  currency: string;
  /** Se incrementa al cerrar una venta para refrescar. */
  refreshKey: number;
}

export default function PosPendingOrders({ currency, refreshKey }: Props) {
  const [orders, setOrders] = useState<PendingPickupOrder[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = useCallback(() => {
    void listPendingPickupOrders()
      .then(setOrders)
      .catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 15000);
    return () => clearInterval(id);
  }, [reload, refreshKey]);

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

  return (
    <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/10 px-3 py-2.5 dark:bg-amber-950/30">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
        Pedidos pendientes ({orders.length})
      </p>
      <ul className="max-h-40 space-y-2 overflow-y-auto">
        {orders.map((o) => (
          <li
            key={o.id}
            className="rounded-lg border border-amber-500/25 bg-[var(--color-panel)] px-2.5 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  {o.order_type === "delivery" ? (
                    <Bike size={14} className="shrink-0 text-amber-700" />
                  ) : (
                    <ShoppingBag size={14} className="shrink-0 text-amber-700" />
                  )}
                  <span className="truncate">
                    #{o.id} · {o.pickup_name?.trim() || "Sin nombre"}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                  {o.item_summary || "—"} · {formatMoney(o.total, currency)}
                </p>
              </div>
              <Button
                type="button"
                className="!shrink-0 !px-2 !py-1 text-xs"
                disabled={busyId === o.id}
                onClick={() => void handleReady(o)}
              >
                <MessageCircle size={14} />
                {o.pickup_phone?.trim() ? "Listo" : "Cerrar"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
