import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Save, Trash2, ShoppingCart, Wrench } from "lucide-react";
import { PageHeader, Card, Button, Input, Select, Modal } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { listCustomers } from "../db/customers";
import { listProducts } from "../db/products";
import {
  buildServiceItem,
  createServiceOrder,
  deleteServiceOrder,
  deliverServiceOrder,
  getServiceOrder,
  getServiceOrderItems,
  setServiceOrderStatus,
  updateServiceOrder,
  type ServiceOrderItemInput,
} from "../db/serviceOrders";
import { logAuditAction } from "../lib/tauri";
import type { Customer, Product, ServiceOrder, ServiceOrderStatus } from "../types";
import { formatMoney, formatQty } from "../lib/format";
import { confirmDelete } from "../lib/confirm";
import {
  getServiceOrderLabels,
  getServiceOrderStatusLabels,
} from "../config/serviceOrderLabels";

export default function ServiceOrderEditor() {
  const { id } = useParams();
  const isNew = !id || id === "nuevo";
  const orderId = isNew ? null : Number(id);
  const navigate = useNavigate();
  const { currency, rubro } = useAppConfig();
  const labels = getServiceOrderLabels(rubro);
  const statusLabel = getServiceOrderStatusLabels(rubro);
  const { user } = useAuth();

  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [subjectNotes, setSubjectNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [items, setItems] = useState<ServiceOrderItemInput[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [payment, setPayment] = useState("efectivo");
  const [paid, setPaid] = useState<number | "">("");

  const editable =
    isNew || order?.status === "pending" || order?.status === "waiting_parts";

  const load = useCallback(async () => {
    setCustomers(await listCustomers());
    if (orderId && !Number.isNaN(orderId)) {
      const o = await getServiceOrder(orderId);
      if (!o) {
        navigate("/ordenes", { replace: true });
        return;
      }
      setOrder(o);
      setCustomerId(o.customer_id ?? "");
      setTitle(o.title);
      setSubjectNotes(o.subject_notes ?? "");
      setNotes(o.notes ?? "");
      setGlobalDiscount(o.discount_pct);
      const lines = await getServiceOrderItems(orderId);
      setItems(
        lines.map((it) => ({
          product_id: it.product_id,
          variant_id: it.variant_id,
          name: it.name,
          qty: it.qty,
          unit_price: it.unit_price,
          discount_pct: it.discount_pct,
          line_total: it.line_total,
          is_labor: !!it.is_labor,
        })),
      );
    }
  }, [orderId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!search.trim() || search.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => void listProducts({ search }).then(setResults), 280);
    return () => clearTimeout(t);
  }, [search]);

  const subtotal = useMemo(() => items.reduce((a, i) => a + i.line_total, 0), [items]);
  const total = subtotal * (1 - globalDiscount / 100);

  function addProduct(p: Product) {
    setItems((prev) => [...prev, buildServiceItem(p.name, 1, p.price, 0, p.id, false)]);
    setSearch("");
    setResults([]);
  }

  function addLabor() {
    setItems((prev) => [
      ...prev,
      buildServiceItem(labels.laborDefaultName, 1, 0, 0, null, true),
    ]);
  }

  function updateItem(index: number, patch: Partial<ServiceOrderItemInput>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const next = { ...it, ...patch };
        next.line_total = next.qty * next.unit_price * (1 - next.discount_pct / 100);
        return next;
      }),
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        customer_id: customerId === "" ? null : customerId,
        title,
        subject_notes: subjectNotes,
        discount_pct: globalDiscount,
        notes,
        items,
        user_id: user?.id ?? null,
      };
      if (isNew) {
        const newId = await createServiceOrder(payload);
        if (user) void logAuditAction(user.id, "service_order_created", "service_order", newId);
        navigate(`/ordenes/${newId}`, { replace: true });
      } else if (orderId) {
        await updateServiceOrder(orderId, payload);
        await load();
        alert("Orden guardada.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: ServiceOrderStatus) {
    if (!orderId) return;
    try {
      await setServiceOrderStatus(orderId, status, user?.id ?? null);
      if (user) void logAuditAction(user.id, `service_order_${status}`, "service_order", orderId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeliver() {
    if (!orderId) return;
    setSaving(true);
    try {
      const saleId = await deliverServiceOrder(
        orderId,
        payment,
        paid === "" ? null : paid,
        user?.id ?? null,
      );
      if (user) void logAuditAction(user.id, "service_order_delivered", "service_order", orderId);
      setDeliverOpen(false);
      alert(`Entregado. Venta #${saleId} registrada.`);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!orderId || !order) return;
    if (!(await confirmDelete(order.order_number))) return;
    try {
      await deleteServiceOrder(orderId);
      navigate("/ordenes");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <PageHeader
        title={
          isNew
            ? labels.newTitle
            : `${order?.order_number ?? ""} · ${order ? statusLabel[order.status] : ""}`
        }
        subtitle={isNew ? labels.editorSubtitle : title || labels.editorSubtitle}
        actions={
          <Link to="/ordenes" className="inline-flex items-center gap-2 text-sm text-brand-600 dark:text-brand-300">
            <ArrowLeft size={16} /> Volver
          </Link>
        }
      />

      <div className="mx-auto max-w-4xl space-y-6 p-8">
        <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={labels.titleLabel}
            value={title}
            disabled={!editable}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={labels.titlePlaceholder}
            className="sm:col-span-2"
          />
          <Select
            label="Cliente"
            value={customerId}
            disabled={!editable}
            onChange={(e) => setCustomerId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">— Sin cliente —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Input
            label={labels.subjectLabel}
            value={subjectNotes}
            disabled={!editable}
            onChange={(e) => setSubjectNotes(e.target.value)}
            placeholder={labels.subjectPlaceholder}
          />
          <Input
            label="Descuento global %"
            type="number"
            value={globalDiscount}
            disabled={!editable}
            onChange={(e) => setGlobalDiscount(Number(e.target.value))}
          />
          <Input
            label="Notas internas"
            value={notes}
            disabled={!editable}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={labels.notesPlaceholder}
            className="sm:col-span-2"
          />
        </Card>

        {editable && (
          <Card>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={labels.productSearchPlaceholder}
              className="mb-3 w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm"
            />
            {results.length > 0 && (
              <div className="mb-3 max-h-36 overflow-y-auto rounded-xl border border-[var(--color-panel-border)]">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-brand-50/50 dark:hover:bg-brand-900/30"
                  >
                    <span>{p.name}</span>
                    <span className="text-brand-600">{formatMoney(p.price, currency)}</span>
                  </button>
                ))}
              </div>
            )}
            <Button variant="secondary" onClick={addLabor}>
              <Plus size={16} /> {labels.laborButton}
            </Button>
          </Card>
        )}

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3 text-left">Ítem</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                {editable && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="table-row">
                  <td className="px-4 py-2">
                    {editable ? (
                      <input
                        value={it.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        className="w-full rounded border px-2 py-1 text-sm"
                      />
                    ) : (
                      <>
                        {it.name}
                        {it.is_labor && (
                          <span className="ml-2 text-[10px] text-ink-muted">(mano de obra)</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={it.qty}
                        onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                        className="w-16 rounded border px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      formatQty(it.qty)
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        value={it.unit_price}
                        onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                        className="w-20 rounded border px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      formatMoney(it.unit_price, currency)
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatMoney(it.line_total, currency)}
                  </td>
                  {editable && (
                    <td className="px-4 py-2 text-right">
                      <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                        <Trash2 size={15} className="text-red-600" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t px-5 py-4 text-right">
            <p className="text-2xl font-bold text-ink">Total: {formatMoney(total, currency)}</p>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button onClick={() => void handleSave()} disabled={saving || !title.trim() || items.length === 0}>
              <Save size={16} /> Guardar
            </Button>
          )}
          {order?.status === "pending" && (
            <Button variant="secondary" onClick={() => void changeStatus("in_progress")}>
              <Wrench size={16} /> {labels.startWorkButton}
            </Button>
          )}
          {order?.status === "in_progress" && (
            <>
              <Button variant="secondary" onClick={() => void changeStatus("waiting_parts")}>
                {labels.waitingPartsButton}
              </Button>
              <Button variant="secondary" onClick={() => void changeStatus("ready")}>
                {labels.markReadyButton}
              </Button>
            </>
          )}
          {order?.status === "waiting_parts" && (
            <Button variant="secondary" onClick={() => void changeStatus("in_progress")}>
              {labels.resumeWorkButton}
            </Button>
          )}
          {order?.status === "ready" && (
            <Button onClick={() => setDeliverOpen(true)}>
              <ShoppingCart size={16} /> Entregar y cobrar
            </Button>
          )}
          {order && !["delivered", "cancelled"].includes(order.status) && (
            <Button variant="danger" onClick={() => void changeStatus("cancelled")}>
              Cancelar orden
            </Button>
          )}
          {order?.status === "pending" && (
            <Button variant="danger" onClick={() => void handleDelete()}>
              Eliminar
            </Button>
          )}
          {order?.sale_id && (
            <Link to="/ventas" className="rounded-xl border px-4 py-2 text-sm font-semibold text-ink">
              Venta #{order.sale_id}
            </Link>
          )}
        </div>
      </div>

      <Modal open={deliverOpen} title="Entregar y cobrar" onClose={() => setDeliverOpen(false)}>
        <p className="mb-4 text-sm text-ink-muted">
          Total: <strong>{formatMoney(total, currency)}</strong>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Pago" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="efectivo">Efectivo</option>
            <option value="débito">Débito</option>
            <option value="transferencia">Transferencia</option>
          </Select>
          <Input
            label="Paga con"
            type="number"
            value={paid}
            onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeliverOpen(false)}>Cancelar</Button>
          <Button onClick={() => void handleDeliver()} disabled={saving}>Confirmar</Button>
        </div>
      </Modal>
    </div>
  );
}
