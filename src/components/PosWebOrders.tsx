import { useState } from "react";
import { Bike, Globe, MessageCircle, ShoppingBag, ShoppingCart, X } from "lucide-react";
import { useWebOrders } from "../hooks/useWebOrders";
import {
  isWebOrderPaid,
  notifyWebOrderCustomer,
  notifyWebOrderRejected,
  rejectWebOrder,
  webOrderHasMoney,
  webOrderTotal,
  type WebOrder,
} from "../lib/webOrders";
import { formatMoney } from "../lib/format";
import { showFlash, showUserError } from "../lib/notice";
import { Alert, Button, Input, Modal } from "./ui";

interface Props {
  currency: string;
  businessName: string;
  canCharge: boolean;
  chargingId: string | null;
  onCharge: (order: WebOrder) => void;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const PAY_TONES = {
  ok: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  wait: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  off: "bg-[var(--color-panel-muted)] text-ink-muted",
} as const;

/** Cómo quedó el pago online. `blocked` = no se puede cobrar todavía. */
function paymentBadge(o: WebOrder, currency: string): { text: string; tone: keyof typeof PAY_TONES; blocked: boolean } | null {
  if (o.payment_method !== "mercadopago") return null;
  switch (o.payment_status) {
    case "approved":
      return {
        text: `Pagado con Mercado Pago · ${formatMoney(o.paid_amount ?? webOrderTotal(o), currency)}`,
        tone: "ok",
        blocked: false,
      };
    case "pending":
      return { text: "Pago en proceso en Mercado Pago", tone: "wait", blocked: true };
    case "review":
      return { text: "Pagó un monto distinto: revisalo en Mercado Pago", tone: "wait", blocked: true };
    case "rejected":
      return { text: "El pago online no se aprobó: cobralo al retirar", tone: "off", blocked: false };
    case "refunded":
      return { text: "Pago devuelto en Mercado Pago", tone: "off", blocked: false };
    default:
      return { text: "Eligió pagar con Mercado Pago: todavía no pagó", tone: "wait", blocked: false };
  }
}

/** Pedidos que llegan desde la tienda web (walqo.pro/NombreDelLocal). */
export default function PosWebOrders({ currency, businessName, canCharge, chargingId, onCharge }: Props) {
  const { orders, mpStatus } = useWebOrders();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<WebOrder | null>(null);
  const [reason, setReason] = useState("");
  const [tellCustomer, setTellCustomer] = useState(true);

  if (orders.length === 0) return null;

  async function handleNotify(o: WebOrder) {
    setBusyId(o.id);
    try {
      const r = await notifyWebOrderCustomer(o, businessName, o.notified_at ? "ready" : "confirmed");
      if (r.copied) showFlash({ message: "WhatsApp abierto. Si hace falta, pegá el mensaje con Ctrl+V." });
    } catch (e) {
      showUserError(e);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    const o = rejecting;
    setBusyId(o.id);
    try {
      if (tellCustomer) {
        await notifyWebOrderRejected(o, businessName, reason).catch((e) => showUserError(e));
      }
      await rejectWebOrder(o, reason);
      showFlash({ message: `Pedido #${o.code} rechazado.` });
      setRejecting(null);
      setReason("");
    } catch (e) {
      showUserError(e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-w-0 shrink-0 border-t border-sky-500/30 bg-sky-500/10 px-3 py-2.5 dark:bg-sky-950/30">
      <p className="mb-2 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
        <Globe size={13} className="shrink-0" />
        <span className="truncate">Pedidos web ({orders.length})</span>
      </p>
      {mpStatus === "invalid" ? (
        <p className="mb-2 break-words rounded-md bg-amber-500/15 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">
          Volvé a conectar Mercado Pago: la tienda no está cobrando online.
        </p>
      ) : null}
      <ul className="max-h-60 space-y-2 overflow-y-auto overflow-x-hidden">
        {orders.map((o) => {
          const delivery = o.fulfillment === "delivery";
          const summary = o.items
            .map((i) => `${i.qty}× ${i.name}${i.cook ? ` (${i.cook})` : ""}`)
            .join(", ");
          const busy = busyId === o.id;
          const charging = chargingId === o.id;
          const pay = paymentBadge(o, currency);
          const paid = isWebOrderPaid(o);
          return (
            <li
              key={o.id}
              className={`min-w-0 rounded-lg border bg-[var(--color-panel)] px-2.5 py-2 ${
                charging ? "border-brand-500 ring-1 ring-brand-500/40" : "border-sky-500/25"
              }`}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink">
                  {delivery ? (
                    <Bike size={14} className="shrink-0 text-sky-700 dark:text-sky-300" />
                  ) : (
                    <ShoppingBag size={14} className="shrink-0 text-sky-700 dark:text-sky-300" />
                  )}
                  <span className="truncate">
                    #{o.code} · {o.customer_name}
                  </span>
                </p>
                <span className="shrink-0 text-[11px] text-ink-muted">{timeLabel(o.created_at)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 break-words text-[11px] text-ink-muted">{summary}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                {formatMoney(webOrderTotal(o), currency)}
                {o.delivery_cost ? ` (con envío ${formatMoney(o.delivery_cost, currency)})` : ""} ·{" "}
                {delivery ? "Envío" : "Retira en el local"} · Tel: {o.customer_phone}
              </p>
              {delivery && o.address ? (
                <p className="mt-0.5 break-words text-[11px] text-ink-muted">Dirección: {o.address}</p>
              ) : null}
              {o.note ? (
                <p className="mt-0.5 break-words text-[11px] italic text-ink-muted">Nota: {o.note}</p>
              ) : null}
              {pay ? (
                <p className={`mt-1 break-words rounded-md px-2 py-0.5 text-[11px] font-medium ${PAY_TONES[pay.tone]}`}>
                  {pay.text}
                </p>
              ) : null}
              <div className="mt-2 flex min-w-0 flex-wrap gap-1">
                <Button
                  type="button"
                  className="!px-2 !py-1 text-xs"
                  disabled={busy || !canCharge || charging || Boolean(pay?.blocked)}
                  title={
                    pay?.blocked
                      ? "Esperá a que Mercado Pago confirme el pago"
                      : !canCharge
                        ? "Abrí la caja para cobrar"
                        : paid
                          ? "Ya pagó con Mercado Pago: se registra la venta sin cobrar de nuevo"
                          : "Pasa el pedido al carrito para cobrarlo"
                  }
                  onClick={() => onCharge(o)}
                >
                  <ShoppingCart size={14} />
                  {charging ? "En el carrito" : paid ? "Registrar venta" : "Cobrar"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-2 !py-1 text-xs"
                  disabled={busy}
                  title={
                    o.notified_at
                      ? "Le avisa que el pedido está listo"
                      : "Le confirma que recibiste el pedido"
                  }
                  onClick={() => void handleNotify(o)}
                >
                  <MessageCircle size={14} />
                  {o.notified_at ? "Avisar que está listo" : "Confirmar por WhatsApp"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="!px-2 !py-1 text-xs"
                  disabled={busy}
                  onClick={() => {
                    setRejecting(o);
                    setReason("");
                    setTellCustomer(true);
                  }}
                >
                  <X size={14} />
                  Rechazar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={rejecting != null}
        title={rejecting ? `Rechazar pedido #${rejecting.code}` : "Rechazar pedido"}
        onClose={() => setRejecting(null)}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRejecting(null)}>
              Volver
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={rejecting != null && busyId === rejecting.id}
              onClick={() => void confirmReject()}
            >
              Rechazar pedido
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {rejecting && webOrderHasMoney(rejecting) ? (
            <Alert variant="warning">
              Este pedido ya está pagado con Mercado Pago. Tenés que devolver la plata desde Mercado Pago
              (en la actividad de tu cuenta, entrá al pago y elegí «Devolver dinero»).
            </Alert>
          ) : null}
          <Input
            label="Motivo (opcional)"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. no nos queda, estamos cerrando"
            autoFocus
          />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-accent)]"
              checked={tellCustomer}
              onChange={(e) => setTellCustomer(e.target.checked)}
            />
            Avisarle por WhatsApp
          </label>
          <p className="text-xs text-ink-muted">El pedido sale de la lista. No se toca el stock ni la caja.</p>
        </div>
      </Modal>
    </div>
  );
}
