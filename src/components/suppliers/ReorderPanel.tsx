import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, MessageCircle, PackageCheck, Save, X } from "lucide-react";
import { Button, Card, EmptyState, NumericField } from "../ui";
import {
  buildPurchaseOrderMessage,
  closePurchaseOrder,
  createPurchaseOrder,
  listPurchaseOrderItems,
  listPurchaseOrders,
  listReorderSuggestions,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type ReorderSuggestion,
} from "../../db/purchaseOrders";
import { formatDateShort, formatMoney, formatQty } from "../../lib/format";
import { openWhatsApp, openWhatsAppShare } from "../../lib/openExternal";
import { showUserError, showUserSuccess } from "../../lib/notice";
import { confirmAction } from "../../lib/confirm";

interface Group {
  key: string;
  supplierId: number | null;
  supplierName: string | null;
  supplierPhone: string | null;
  items: ReorderSuggestion[];
}

interface Props {
  businessName: string;
  currency: string;
  userId: number | null;
  /** Abre el ingreso de compra con los renglones del pedido. */
  onReceive: (order: PurchaseOrder, items: PurchaseOrderItem[]) => void;
  /** Cambia cuando se recibió un pedido, para recargar. */
  refreshKey: number;
  /** Se guardó o canceló un pedido. */
  onChanged: () => void;
}

function stockLine(s: ReorderSuggestion): string {
  if (s.pending_order_id) return `Ya pedido en #${s.pending_order_id} · quedan ${formatQty(s.stock)}`;
  if (s.stock <= 0 && s.min_stock <= 0) {
    return `Se agotó · vendiste ${formatQty(s.sold_30d)} en 30 días`;
  }
  if (s.stock <= 0) return `Se agotó · mínimo ${formatQty(s.min_stock)}`;
  return `Quedan ${formatQty(s.stock)} · mínimo ${formatQty(s.min_stock)}`;
}

export default function ReorderPanel({ businessName, currency, userId, onReceive, refreshKey, onChanged }: Props) {
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [qty, setQty] = useState<Map<number, number>>(new Map());
  const [off, setOff] = useState<Set<number>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [s, o] = await Promise.all([listReorderSuggestions(), listPurchaseOrders("all")]);
    setSuggestions(s);
    setOrders(o);
    setQty(new Map(s.map((x) => [x.product_id, x.suggested_qty])));
    setOff(new Set(s.filter((x) => x.pending_order_id).map((x) => x.product_id)));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load().catch(showUserError);
  }, [load, refreshKey]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const s of suggestions) {
      const key = s.supplier_id == null ? "none" : String(s.supplier_id);
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          supplierId: s.supplier_id,
          supplierName: s.supplier_name,
          supplierPhone: s.supplier_phone,
          items: [],
        };
        map.set(key, g);
      }
      g.items.push(s);
    }
    return [...map.values()].sort((a, b) => Number(a.supplierId == null) - Number(b.supplierId == null));
  }, [suggestions]);

  const pending = orders.filter((o) => o.status === "pending");
  const closed = orders.filter((o) => o.status !== "pending").slice(0, 5);

  function chosen(g: Group) {
    return g.items
      .filter((s) => !off.has(s.product_id) && (qty.get(s.product_id) ?? 0) > 0)
      .map((s) => ({ s, q: qty.get(s.product_id) ?? 0 }));
  }

  async function saveGroup(g: Group, viaWhatsApp: boolean) {
    const picked = chosen(g);
    if (picked.length === 0) {
      showUserError("Marcá al menos un producto con cantidad.", "Pedido vacío");
      return;
    }
    setBusyKey(g.key);
    try {
      if (viaWhatsApp) {
        const message = buildPurchaseOrderMessage({
          businessName,
          supplierName: g.supplierName,
          items: picked.map(({ s, q }) => ({ name: s.name, qty: q, unit: s.unit })),
        });
        if (g.supplierPhone) await openWhatsApp(g.supplierPhone, message);
        else await openWhatsAppShare(message);
      }
      await createPurchaseOrder({
        supplierId: g.supplierId,
        userId,
        items: picked.map(({ s, q }) => ({
          productId: s.product_id,
          name: s.name,
          qty: q,
          unitCost: s.cost,
        })),
      });
      showUserSuccess(
        viaWhatsApp
          ? "Pedido guardado. Cuando llegue la mercadería, tocá «Llegó»."
          : "Pedido guardado en Pedidos pendientes.",
      );
      await load();
      onChanged();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusyKey(null);
    }
  }

  async function resend(o: PurchaseOrder) {
    try {
      const items = await listPurchaseOrderItems(o.id);
      const message = buildPurchaseOrderMessage({
        businessName,
        supplierName: o.supplier_name,
        items: items.map((i) => ({ name: i.name, qty: i.qty })),
      });
      if (o.supplier_phone) await openWhatsApp(o.supplier_phone, message);
      else await openWhatsAppShare(message);
    } catch (e) {
      showUserError(e);
    }
  }

  async function receive(o: PurchaseOrder) {
    try {
      onReceive(o, await listPurchaseOrderItems(o.id));
    } catch (e) {
      showUserError(e);
    }
  }

  async function cancel(o: PurchaseOrder) {
    const ok = await confirmAction({
      title: "Cancelar pedido",
      message: `¿Cancelar el pedido #${o.id}${o.supplier_name ? ` a ${o.supplier_name}` : ""}?`,
      detail: "No toca el stock. Queda en el historial como cancelado.",
      confirmLabel: "Sí, cancelar",
    });
    if (!ok) return;
    try {
      await closePurchaseOrder(o.id, "cancelled");
      await load();
      onChanged();
    } catch (e) {
      showUserError(e);
    }
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <h2 className="supplier-section-title">Pedidos pendientes</h2>
          <ul className="supplier-orders">
            {pending.map((o) => (
              <li key={o.id} className="supplier-orders__row">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    #{o.id} · {o.supplier_name ?? "Sin proveedor"}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDateShort(o.created_at)} · {o.item_count} producto{o.item_count === 1 ? "" : "s"}
                    {o.total_cost > 0 ? ` · aprox. ${formatMoney(o.total_cost, currency)}` : ""}
                  </p>
                </div>
                <div className="supplier-orders__actions">
                  <Button size="sm" onClick={() => receive(o)}>
                    <PackageCheck size={15} /> Llegó, cargar ingreso
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => resend(o)}>
                    <MessageCircle size={15} /> Reenviar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => cancel(o)} aria-label={`Cancelar pedido ${o.id}`}>
                    <X size={15} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="supplier-section-title">Para reponer</h2>
        {!loaded ? null : groups.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No falta nada por ahora"
            description="Acá aparece lo que queda por debajo del stock mínimo y lo que se agotó y se vende. Cargá el mínimo en cada producto para que WalQo te avise."
          />
        ) : (
          <div className="supplier-reorder">
            {groups.map((g) => {
              const picked = chosen(g);
              const total = picked.reduce((a, { s, q }) => a + s.cost * q, 0);
              const busy = busyKey === g.key;
              return (
                <Card key={g.key} className="supplier-reorder__group">
                  <div className="supplier-reorder__head">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-base font-semibold text-ink">
                        {g.supplierName ?? "Sin proveedor asignado"}
                      </h3>
                      <p className="text-xs text-ink-muted">
                        {g.supplierId == null
                          ? "Asignales proveedor en Productos para que el pedido se arme solo."
                          : g.supplierPhone
                            ? `WhatsApp ${g.supplierPhone}`
                            : "Sin WhatsApp: cargalo en la cuenta del proveedor."}
                      </p>
                    </div>
                    {total > 0 && (
                      <span className="shrink-0 text-sm text-ink-muted">
                        aprox. <strong className="text-ink tabular-nums">{formatMoney(total, currency)}</strong>
                      </span>
                    )}
                  </div>

                  <ul className="supplier-reorder__items">
                    {g.items.map((s) => {
                      const on = !off.has(s.product_id);
                      return (
                        <li key={s.product_id} className={`supplier-reorder__item${on ? "" : " is-off"}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            aria-label={`Pedir ${s.name}`}
                            onChange={() =>
                              setOff((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.product_id)) next.delete(s.product_id);
                                else next.add(s.product_id);
                                return next;
                              })
                            }
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink" title={s.name}>
                              {s.name}
                            </p>
                            <p className="truncate text-xs text-ink-muted">{stockLine(s)}</p>
                          </div>
                          <NumericField
                            className="supplier-reorder__qty"
                            value={qty.get(s.product_id) ?? 0}
                            min={0}
                            aria-label={`Cantidad de ${s.name}`}
                            disabled={!on}
                            onChange={(v) =>
                              setQty((prev) => new Map(prev).set(s.product_id, v))
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>

                  <div className="supplier-reorder__foot">
                    <Button size="sm" disabled={busy || picked.length === 0} onClick={() => saveGroup(g, true)}>
                      <MessageCircle size={15} /> {g.supplierPhone ? "Pedir por WhatsApp" : "Compartir por WhatsApp"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || picked.length === 0}
                      onClick={() => saveGroup(g, false)}
                    >
                      <Save size={15} /> Solo guardar
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="supplier-section-title">Últimos pedidos</h2>
          <ul className="supplier-orders supplier-orders--muted">
            {closed.map((o) => (
              <li key={o.id} className="supplier-orders__row">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    <ClipboardList size={14} className="mr-1 inline align-[-2px] text-ink-muted" />#{o.id} ·{" "}
                    {o.supplier_name ?? "Sin proveedor"}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {o.status === "received" ? "Recibido" : "Cancelado"}
                    {o.closed_at ? ` el ${formatDateShort(o.closed_at)}` : ""} · {o.item_count} producto
                    {o.item_count === 1 ? "" : "s"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
