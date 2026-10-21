import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  BellRing,
  ChefHat,
  Check,
  Minus,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Button, Input, Modal, Select } from "../ui";
import PosCartaMenu from "../PosCartaMenu";
import PosModifierModal from "../PosModifierModal";
import BulkWeightSaleModal from "../BulkWeightSaleModal";
import { rubroSupportsBulkWeight } from "../../config/rubros";
import { useAppConfig } from "../../context/AppConfig";
import { useAuth } from "../../context/AuthContext";
import { listProducts } from "../../db/products";
import { listCategories } from "../../db/categories";
import { listProductModifiers, type ProductModifier } from "../../db/modifiers";
import { listKitComponents } from "../../db/kits";
import { listStaffUsers, type StaffUser } from "../../db/users";
import { syncCashSessionStorage } from "../../db/cash";
import {
  addTableOrderItem,
  cancelTableOrder,
  confirmPendingTableItems,
  listTableOrderItems,
  markTableBillRequested,
  moveTableOrder,
  rejectPendingTableItems,
  removeTableOrderItem,
  resolveTableCalls,
  sendTableOrderToKitchen,
  setTableItemNote,
  setTableItemQty,
  tableItemTotal,
  tableLabel,
  updateTableOrder,
  type DiningTable,
  type OpenTableOrder,
  type TableCall,
  type TableOrderItem,
} from "../../db/tables";
import { isEmpanadaProduct } from "../../lib/empanadaCook";
import { productSoldByWeight } from "../../lib/weightSale";
import { roundMoney } from "../../lib/discount";
import { formatMoney, formatQty } from "../../lib/format";
import { confirmAction } from "../../lib/confirm";
import { showFlash, showUserError } from "../../lib/notice";
import { logAuditAction } from "../../lib/tauri";
import { printKitchenTicket } from "../../lib/prints/kitchenTicket";
import { printPreBill } from "../../lib/prints/tablePrints";
import { refreshTableAlerts } from "../../lib/tables";
import { markWebTableClosed } from "../../lib/webOrders";
import type { Category, Product } from "../../types";

interface Props {
  table: DiningTable | null;
  order: OpenTableOrder | null;
  calls: TableCall[];
  freeTables: DiningTable[];
  onClose: () => void;
  onChanged: () => void;
}

const ROUND_LABEL = (n: number) => `Ronda ${n}`;

export default function TableOrderModal({ table, order, calls, freeTables, onClose, onChanged }: Props) {
  const { currency, businessName, rubroDef } = useAppConfig();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<TableOrderItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [modPick, setModPick] = useState<{ product: Product; modifiers: ProductModifier[]; cook: string | null } | null>(null);
  const [cookPick, setCookPick] = useState<Product | null>(null);
  const [weightPick, setWeightPick] = useState<Product | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guests, setGuests] = useState("");

  const orderId = order?.id ?? null;
  const label = table ? tableLabel(table) : "";

  const reload = useCallback(async () => {
    if (!orderId) {
      setItems([]);
      return;
    }
    setItems(await listTableOrderItems(orderId));
  }, [orderId]);

  useEffect(() => {
    void reload().catch(showUserError);
  }, [reload, order?.pending_items, order?.items]);

  useEffect(() => {
    setGuests(order?.guests ? String(order.guests) : "");
  }, [order?.id, order?.guests]);

  useEffect(() => {
    if (!table) return;
    void listCategories().then(setCategories).catch(() => setCategories([]));
    void listStaffUsers()
      .then((rows) => setStaff(rows.filter((u) => u.active && !u.is_cadete)))
      .catch(() => setStaff([]));
  }, [table]);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void listProducts({ search: q, limit: 60 })
        .then((rows) => setResults(rows.filter((p) => p.product_kind !== "ingredient")))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const pending = items.filter((i) => i.status === "pending");
  const fresh = items.filter((i) => i.status === "new");
  const sent = items.filter((i) => i.status === "sent");
  const total = roundMoney([...fresh, ...sent].reduce((acc, i) => acc + tableItemTotal(i), 0));
  const rounds = useMemo(() => {
    const map = new Map<number, TableOrderItem[]>();
    for (const i of sent) {
      const r = i.round ?? 1;
      map.set(r, [...(map.get(r) ?? []), i]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [sent]);

  const changed = useCallback(async () => {
    await reload();
    onChanged();
    void refreshTableAlerts();
  }, [reload, onChanged]);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusy(false);
    }
  }

  async function addLine(product: Product, modifiers: ProductModifier[], cook: string | null, qty = 1) {
    if (!orderId) return;
    const mods = modifiers.length ? ` (+ ${modifiers.map((m) => m.name).join(", ")})` : "";
    await addTableOrderItem(
      orderId,
      {
        product_id: product.id,
        label: `${product.name}${cook ? ` (${cook})` : ""}${mods}`,
        unit_price: roundMoney(product.price + modifiers.reduce((acc, m) => acc + m.price_delta, 0)),
        qty,
        modifiers,
        cook,
      },
      user?.id ?? null,
    );
    setSearch("");
    await changed();
  }

  async function withMods(product: Product, cook: string | null) {
    const mods = await listProductModifiers(product.id);
    if (mods.length > 0) {
      setModPick({ product, modifiers: mods, cook });
      return;
    }
    await addLine(product, [], cook);
  }

  function pick(product: Product) {
    void run(async () => {
      if (product.has_variants || product.serialized) {
        showFlash({ message: `«${product.name}» se vende desde el punto de venta.`, variant: "error" });
        return;
      }
      if (rubroSupportsBulkWeight(rubroDef) && productSoldByWeight(product.unit)) {
        setWeightPick(product);
        return;
      }
      if (isEmpanadaProduct(product.category_name, product.name)) {
        setCookPick(product);
        return;
      }
      await withMods(product, null);
    });
  }

  async function kitchenLines(list: TableOrderItem[]): Promise<{ name: string; qty: number }[]> {
    const out: { name: string; qty: number }[] = [];
    for (const i of list) {
      const name = i.note ? `${i.label} — ${i.note}` : i.label;
      const comps = await listKitComponents(i.product_id).catch(() => []);
      if (comps.length) {
        out.push({ name: `▸ ${name}`, qty: i.qty });
        for (const c of comps) out.push({ name: `  ${c.name}`, qty: c.qty * i.qty });
        continue;
      }
      out.push({ name, qty: i.qty });
    }
    return out;
  }

  function sendToKitchen() {
    if (!orderId || !table) return;
    void run(async () => {
      const { round, items: batch } = await sendTableOrderToKitchen(orderId);
      if (batch.length === 0) {
        showFlash({ message: "No hay nada nuevo para mandar a cocina." });
        return;
      }
      const waiter = staff.find((s) => s.id === order?.waiter_user_id)?.display_name;
      printKitchenTicket({
        businessName,
        saleId: orderId,
        label: `${label} · ${ROUND_LABEL(round)}`,
        items: await kitchenLines(batch),
        notes: [waiter ? `Mozo: ${waiter}` : "", order?.note ?? ""].filter(Boolean).join(" · ") || undefined,
      });
      showFlash({ message: `${ROUND_LABEL(round)} enviada a cocina.` });
      await changed();
    });
  }

  function preBill() {
    if (!orderId || !table) return;
    if (fresh.length + sent.length === 0) {
      showFlash({ message: "La mesa todavía no tiene nada cargado.", variant: "error" });
      return;
    }
    const lines = new Map<string, { name: string; qty: number; total: number }>();
    for (const i of [...sent, ...fresh]) {
      const key = `${i.label}|${i.unit_price}`;
      const cur = lines.get(key);
      if (cur) {
        cur.qty += i.qty;
        cur.total += tableItemTotal(i);
      } else {
        lines.set(key, { name: i.label, qty: i.qty, total: tableItemTotal(i) });
      }
    }
    void run(async () => {
      printPreBill({
        businessName,
        tableLabel: label,
        guests: order?.guests ?? null,
        waiter: staff.find((s) => s.id === order?.waiter_user_id)?.display_name ?? null,
        currency,
        items: [...lines.values()],
        total,
      });
      await markTableBillRequested(orderId);
      await changed();
    });
  }

  async function removeItem(i: TableOrderItem) {
    if (i.status === "sent" && !can("void_sale")) {
      showUserError("Lo que ya salió a cocina lo quita el encargado o el dueño.", "Sin permiso");
      return;
    }
    const ok = await confirmAction({
      title: "Quitar de la mesa",
      message: `¿Quitar «${i.label}»?`,
      detail: i.status === "sent" ? "Ya salió a cocina. Queda anotado en el historial." : undefined,
      variant: "danger",
      confirmLabel: "Sí, quitar",
    });
    if (!ok) return;
    await run(async () => {
      await removeTableOrderItem(i.id);
      if (i.status === "sent" && user) {
        void logAuditAction(user.id, "table_item_removed", "table_order", i.order_id, `${i.label} x${i.qty}`);
      }
      await changed();
    });
  }

  async function charge() {
    if (!orderId) return;
    if (pending.length > 0) {
      showUserError("Confirmá o rechazá antes lo que pidieron desde el QR.", "Pedido sin confirmar");
      return;
    }
    if (fresh.length + sent.length === 0) {
      showUserError("La mesa no tiene nada para cobrar. Si se fueron sin pedir, tocá «Liberar mesa».", "Mesa vacía");
      return;
    }
    if (fresh.length > 0) {
      const ok = await confirmAction({
        title: "Hay cosas sin mandar a cocina",
        message: `${fresh.length} ${fresh.length === 1 ? "ítem no salió" : "ítems no salieron"} a cocina. ¿Cobrar igual?`,
        detail: "Se cobran igual. Si todavía falta prepararlos, tocá «Enviar a cocina» primero.",
        confirmLabel: "Cobrar igual",
      });
      if (!ok) return;
    }
    const cash = await syncCashSessionStorage();
    if (!cash) {
      showUserError("Abrí el turno de caja para cobrar la mesa.", "Caja cerrada");
      return;
    }
    onClose();
    navigate("/pos", { state: { chargeTableOrderId: orderId } });
  }

  async function release() {
    if (!orderId) return;
    const hasSent = sent.length > 0;
    if (hasSent && !can("void_sale")) {
      showUserError("La mesa ya pidió a cocina. La anula el encargado o el dueño.", "Sin permiso");
      return;
    }
    const ok = await confirmAction({
      title: hasSent ? "Anular la cuenta" : "Liberar mesa",
      message: hasSent
        ? `¿Anular la cuenta de ${label} sin cobrar? Lo que salió a cocina no se registra como venta.`
        : `¿Liberar ${label}? No se registra ninguna venta.`,
      variant: "danger",
      confirmLabel: hasSent ? "Sí, anular" : "Sí, liberar",
    });
    if (!ok) return;
    await run(async () => {
      const number = await cancelTableOrder(orderId);
      if (hasSent && user) {
        void logAuditAction(user.id, "table_order_cancelled", "table_order", orderId, `${label} total=${total}`);
      }
      if (number != null) void markWebTableClosed(number).catch(() => undefined);
      onChanged();
      void refreshTableAlerts();
      onClose();
    });
  }

  if (!table || !order) return null;

  const waiterId = order.waiter_user_id ?? "";
  const tableCalls = calls.filter((c) => c.table_id === table.id);

  return (
    <>
      <Modal
        open
        size="checkout"
        title={label}
        subtitle={[table.zone, order.guests ? `${order.guests} comensales` : ""].filter(Boolean).join(" · ") || undefined}
        onClose={onClose}
        footer={
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setMoveOpen(true)} disabled={busy}>
                <ArrowRightLeft size={15} /> Cambiar de mesa
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void release()} disabled={busy}>
                <X size={15} /> {sent.length > 0 ? "Anular cuenta" : "Liberar mesa"}
              </Button>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              <Button variant="secondary" onClick={preBill} disabled={busy}>
                <ReceiptText size={16} /> Pre-cuenta
              </Button>
              <Button variant="secondary" onClick={sendToKitchen} disabled={busy || fresh.length === 0}>
                <ChefHat size={16} /> Enviar a cocina{fresh.length ? ` (${fresh.length})` : ""}
              </Button>
              <Button onClick={() => void charge()} disabled={busy}>
                <Wallet size={16} /> Cobrar {formatMoney(total, currency)}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <section className="min-w-0 space-y-3">
            <Input
              placeholder="Buscá en la carta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              startAdornment={<Search size={16} />}
            />
            <div className="max-h-[52vh] min-w-0 overflow-y-auto overflow-x-hidden pr-1">
              {search.trim() ? (
                results.length === 0 ? (
                  <p className="text-sm text-ink-muted">Sin resultados.</p>
                ) : (
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    {results.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => pick(p)}
                        className="pos-product-card min-w-0 text-left"
                      >
                        <p className="line-clamp-2 text-sm font-medium text-ink">{p.name}</p>
                        <p className="mt-1 text-sm font-semibold text-brand-600 dark:text-brand-300">
                          {formatMoney(p.price, currency)}
                        </p>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <PosCartaMenu categories={categories} currency={currency} onPick={pick} />
              )}
            </div>
          </section>

          <section className="min-w-0 space-y-3">
            {tableCalls.length > 0 ? (
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                <p className="flex min-w-0 items-center gap-2 font-semibold">
                  <BellRing size={16} className="shrink-0" />
                  <span className="min-w-0">
                    {[...new Set(tableCalls.map((c) => (c.kind === "bill" ? "Pide la cuenta" : "Llama al mozo")))].join(" · ")}
                  </span>
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void run(async () => {
                    await resolveTableCalls(table.id);
                    await changed();
                  })}
                >
                  <Check size={14} /> Atendido
                </Button>
              </div>
            ) : null}

            <div className="grid min-w-0 grid-cols-2 gap-2">
              <Input
                label="Comensales"
                type="number"
                min={0}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                onBlur={() =>
                  void run(async () => {
                    const n = Math.max(0, Math.round(Number(guests) || 0));
                    await updateTableOrder(order.id, { guests: n || null });
                    onChanged();
                  })
                }
              />
              <Select
                label="Mozo"
                value={waiterId}
                onChange={(e) =>
                  void run(async () => {
                    await updateTableOrder(order.id, { waiterUserId: e.target.value ? Number(e.target.value) : null });
                    onChanged();
                  })
                }
              >
                <option value="">Sin asignar</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </Select>
            </div>

            {pending.length > 0 ? (
              <div className="min-w-0 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3">
                <p className="mb-2 text-sm font-semibold text-sky-900 dark:text-sky-100">Pidieron desde el QR</p>
                <ItemList items={pending} currency={currency} onRemove={(i) => void removeItem(i)} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => void run(async () => {
                      await confirmPendingTableItems(order.id);
                      await changed();
                    })}
                  >
                    <Check size={14} /> Confirmar pedido
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void run(async () => {
                      await rejectPendingTableItems(order.id);
                      await changed();
                    })}
                  >
                    Rechazar
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                Para mandar a cocina
              </p>
              {fresh.length === 0 ? (
                <p className="text-sm text-ink-muted">Tocá un plato o bebida de la carta para sumarlo.</p>
              ) : (
                <ItemList
                  items={fresh}
                  currency={currency}
                  editable
                  onQty={(i, q) => void run(async () => {
                    await setTableItemQty(i.id, q);
                    await changed();
                  })}
                  onNote={(i, note) => void setTableItemNote(i.id, note).then(changed).catch(showUserError)}
                  onRemove={(i) => void removeItem(i)}
                />
              )}
            </div>

            {rounds.map(([round, list]) => (
              <div key={round} className="min-w-0 rounded-xl border border-[var(--color-panel-border)] p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  <ChefHat size={13} /> {ROUND_LABEL(round)} · en cocina
                </p>
                <ItemList items={list} currency={currency} onRemove={(i) => void removeItem(i)} />
              </div>
            ))}

            <p className="flex items-center justify-between border-t border-[var(--color-panel-border)] pt-3 text-base font-bold text-ink">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(total, currency)}</span>
            </p>
          </section>
        </div>
      </Modal>

      <Modal open={moveOpen} title={`Pasar ${label} a otra mesa`} onClose={() => setMoveOpen(false)}>
        {freeTables.length === 0 ? (
          <p className="text-sm text-ink-muted">No hay mesas libres.</p>
        ) : (
          <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,7rem),1fr))] gap-2">
            {freeTables.map((t) => (
              <Button
                key={t.id}
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    await moveTableOrder(order.id, t.id);
                    setMoveOpen(false);
                    showFlash({ message: `La cuenta pasó a ${tableLabel(t)}.` });
                    onChanged();
                    onClose();
                  })
                }
              >
                <span className="min-w-0 truncate">{tableLabel(t)}</span>
              </Button>
            ))}
          </div>
        )}
      </Modal>

      <PosModifierModal
        open={modPick !== null}
        product={modPick?.product ?? null}
        modifiers={modPick?.modifiers ?? []}
        currency={currency}
        onClose={() => setModPick(null)}
        onConfirm={(selected) => {
          const p = modPick;
          setModPick(null);
          if (p) void run(() => addLine(p.product, selected, p.cook));
        }}
      />

      <BulkWeightSaleModal
        open={weightPick !== null}
        product={weightPick}
        currency={currency}
        onClose={() => setWeightPick(null)}
        onConfirm={(qty) => {
          const p = weightPick;
          setWeightPick(null);
          if (p) void run(() => addLine(p, [], null, qty));
        }}
      />

      <Modal open={cookPick !== null} title={cookPick?.name ?? "Empanada"} onClose={() => setCookPick(null)}>
        <p className="mb-3 text-sm text-ink-muted">¿Frita o al horno?</p>
        <div className="grid grid-cols-2 gap-2">
          {["Frita", "Al horno"].map((cook) => (
            <Button
              key={cook}
              onClick={() => {
                const p = cookPick;
                setCookPick(null);
                if (p) void run(() => withMods(p, cook));
              }}
            >
              {cook}
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}

function ItemList({
  items,
  currency,
  editable = false,
  onQty,
  onNote,
  onRemove,
}: {
  items: TableOrderItem[];
  currency: string;
  editable?: boolean;
  onQty?: (i: TableOrderItem, qty: number) => void;
  onNote?: (i: TableOrderItem, note: string) => void;
  onRemove: (i: TableOrderItem) => void;
}) {
  return (
    <ul className="min-w-0 space-y-2">
      {items.map((i) => (
        <li key={i.id} className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {editable && onQty ? (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="wt-icon-btn h-7 w-7"
                  aria-label="Uno menos"
                  onClick={() => onQty(i, roundMoney(i.qty - 1))}
                >
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums">{formatQty(i.qty)}</span>
                <button
                  type="button"
                  className="wt-icon-btn h-7 w-7"
                  aria-label="Uno más"
                  onClick={() => onQty(i, roundMoney(i.qty + 1))}
                >
                  <Plus size={14} />
                </button>
              </span>
            ) : (
              <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums">{formatQty(i.qty)}</span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-ink" title={i.label}>
              {i.label}
              {!editable && i.note ? <span className="text-ink-muted"> — {i.note}</span> : null}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-ink">{formatMoney(tableItemTotal(i), currency)}</span>
            <button
              type="button"
              className="wt-icon-btn wt-icon-btn--danger h-7 w-7 shrink-0"
              aria-label={`Quitar ${i.label}`}
              onClick={() => onRemove(i)}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {editable && onNote ? (
            <input
              defaultValue={i.note ?? ""}
              placeholder="Nota para cocina (ej. sin cebolla)"
              maxLength={120}
              onBlur={(e) => {
                if (e.currentTarget.value.trim() !== (i.note ?? "")) onNote(i, e.currentTarget.value);
              }}
              className="mt-1 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs text-ink-muted outline-none placeholder:text-ink-muted/60 focus:border-[var(--color-panel-border)] focus:bg-[var(--color-panel)]"
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
