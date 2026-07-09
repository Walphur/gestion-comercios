import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Save, Trash2, ShoppingCart, Wrench, Printer, FileText, List, ClipboardList, Search } from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  Input,
  TextArea,
  Select,
  Modal,
  PageContent,
  CardSectionTitle,
  SummaryTotalCard,
  FormActions,
  EmptyState,
  tableCellInputClass,
} from "../components/ui";
import { showUserError, showUserSuccess } from "../lib/notice";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
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
import type { Product, ServiceOrder, ServiceOrderStatus } from "../types";
import { formatMoney, formatQty } from "../lib/format";
import { confirmDelete } from "../lib/confirm";
import {
  getServiceOrderLabels,
  getServiceOrderStatusLabels,
} from "../config/serviceOrderLabels";
import { rubroUsesVehicles, rubroUsesWorkshopFlow } from "../config/workshop";
import VehiclePicker from "../components/VehiclePicker";
import CustomerPicker from "../components/CustomerPicker";
import WorkshopLinks from "../components/WorkshopLinks";
import {
  getLinkedDocumentsForOrder,
  getOrderPrefillFromAppointment,
  getOrderPrefillFromQuote,
} from "../db/workshopFlow";
import { printServiceOrderDocument } from "../lib/prints/serviceOrderDocument";

export default function ServiceOrderEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === "nuevo";
  const orderId = isNew ? null : Number(id);
  const navigate = useNavigate();
  const { currency, rubro, businessName } = useAppConfig();
  const labels = getServiceOrderLabels(rubro);
  const statusLabel = getServiceOrderStatusLabels(rubro);
  const usesVehicles = rubroUsesVehicles(rubro);
  const workshopFlow = rubroUsesWorkshopFlow(rubro);
  const { user } = useAuth();

  const [order, setOrder] = useState<ServiceOrder | null>(null);
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
  const [vehicleId, setVehicleId] = useState<number | "">("");
  const [odometerKm, setOdometerKm] = useState<number | "">("");
  const [quoteId, setQuoteId] = useState<number | null>(null);
  const [appointmentId, setAppointmentId] = useState<number | null>(null);
  const [linkedDocs, setLinkedDocs] = useState<{
    quote: { id: number; quote_number: string } | null;
    appointment: { id: number; title: string } | null;
  }>({ quote: null, appointment: null });

  const editable =
    isNew || order?.status === "pending" || order?.status === "waiting_parts";

  const load = useCallback(async () => {
    if (isNew) {
      const desdePresupuesto = searchParams.get("desde_presupuesto");
      const desdeTurno = searchParams.get("desde_turno");
      if (desdePresupuesto && !Number.isNaN(Number(desdePresupuesto))) {
        const prefill = await getOrderPrefillFromQuote(Number(desdePresupuesto));
        if (prefill) {
          setCustomerId(prefill.customer_id ?? "");
          setVehicleId(prefill.vehicle_id ?? "");
          setQuoteId(prefill.quote_id);
          setAppointmentId(prefill.appointment_id);
          setTitle(prefill.title);
          setNotes(prefill.notes ?? "");
          setGlobalDiscount(prefill.discount_pct);
          setItems(prefill.items);
        }
      } else if (desdeTurno && !Number.isNaN(Number(desdeTurno))) {
        const prefill = await getOrderPrefillFromAppointment(Number(desdeTurno));
        if (prefill) {
          setCustomerId(prefill.customer_id ?? "");
          setVehicleId(prefill.vehicle_id ?? "");
          setAppointmentId(prefill.appointment_id);
          setTitle(prefill.title);
          setSubjectNotes(prefill.subject_notes ?? "");
          setNotes(prefill.notes ?? "");
          setItems(prefill.items);
        }
      }
      return;
    }
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
      setVehicleId(o.vehicle_id ?? "");
      setOdometerKm(o.odometer_km ?? "");
      setQuoteId(o.quote_id);
      setAppointmentId(o.appointment_id);
      setLinkedDocs(await getLinkedDocumentsForOrder(orderId));
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
  }, [orderId, navigate, isNew, searchParams]);

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
        vehicle_id: vehicleId === "" ? null : vehicleId,
        appointment_id: appointmentId,
        quote_id: quoteId,
        odometer_km: odometerKm === "" ? null : odometerKm,
        title,
        subject_notes: subjectNotes.trim() || null,
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
        showUserSuccess("Orden guardada.");
      }
    } catch (e) {
      showUserError(e);
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
      showUserError(e);
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
      showUserSuccess(`Entregado. Venta #${saleId} registrada.`);
      await load();
    } catch (e) {
      showUserError(e);
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
      showUserError(e);
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

      <PageContent wide>
        <Card variant="form" className="space-y-4">
          <CardSectionTitle icon={FileText} title="Datos de la orden" description="Cliente, vehículo y notas" />
          <Input
            label={labels.titleLabel}
            value={title}
            disabled={!editable}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={labels.titlePlaceholder}
          />
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <CustomerPicker
              label="Cliente"
              value={customerId}
              disabled={!editable}
              onChange={(id) => {
                setCustomerId(id);
                setVehicleId("");
              }}
            />
            <Input
              label="Descuento global %"
              type="number"
              min={0}
              max={100}
              step={1}
              value={globalDiscount}
              disabled={!editable}
              onChange={(e) => setGlobalDiscount(Number(e.target.value))}
            />
          </div>
          {usesVehicles ? (
            <>
              <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                <VehiclePicker
                  customerId={customerId}
                  vehicleId={vehicleId}
                  disabled={!editable}
                  onVehicleChange={setVehicleId}
                  onCustomerRequired={() =>
                    showUserError("Elegí un cliente para asociar el vehículo.", "Cliente requerido")
                  }
                />
                <Input
                  label="Kilometraje"
                  type="number"
                  min={0}
                  step={1}
                  value={odometerKm}
                  disabled={!editable}
                  onChange={(e) => setOdometerKm(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Ej. 45000"
                />
              </div>
              <TextArea
                label={labels.vehicleDetailsLabel}
                value={subjectNotes}
                disabled={!editable}
                onChange={(e) => setSubjectNotes(e.target.value)}
                placeholder={labels.vehicleDetailsPlaceholder}
                rows={3}
              />
            </>
          ) : (
            <Input
              label={labels.subjectLabel}
              value={subjectNotes}
              disabled={!editable}
              onChange={(e) => setSubjectNotes(e.target.value)}
              placeholder={labels.subjectPlaceholder}
            />
          )}
          <Input
            label="Notas internas"
            value={notes}
            disabled={!editable}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={labels.notesPlaceholder}
          />
        </Card>

        {!isNew && workshopFlow && (linkedDocs.quote || linkedDocs.appointment) && (
          <Card>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Vinculaciones
            </p>
            <WorkshopLinks
              items={[
                ...(linkedDocs.appointment
                  ? [
                      {
                        label: `Turno: ${linkedDocs.appointment.title}`,
                        to: `/turnos/${linkedDocs.appointment.id}`,
                      },
                    ]
                  : []),
                ...(linkedDocs.quote
                  ? [
                      {
                        label: `Presupuesto ${linkedDocs.quote.quote_number}`,
                        to: `/presupuestos/${linkedDocs.quote.id}`,
                      },
                    ]
                  : []),
              ]}
            />
          </Card>
        )}

        {editable && (
          <Card variant="form">
            <CardSectionTitle icon={Search} title="Agregar ítems" description="Productos o mano de obra" />
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

        <Card variant="items">
          <div className="border-b border-[var(--color-panel-border)] px-5 py-4">
            <CardSectionTitle icon={List} title="Ítems" description={`${items.length} línea${items.length === 1 ? "" : "s"}`} className="!mb-0" />
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ítem</th>
                <th className="text-right">Cant.</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Subtotal</th>
                {editable && <th className="col-actions" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 5 : 4} className="cell-empty">
                    <EmptyState compact icon={ClipboardList} title="Sin ítems" description="Agregá repuestos o mano de obra a la orden." />
                  </td>
                </tr>
              ) : (
              items.map((it, idx) => (
                <tr key={idx} className="table-row">
                  <td>
                    {editable ? (
                      <input
                        value={it.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        className={tableCellInputClass}
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
                  <td className="text-right">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={it.qty}
                        onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                        className={`${tableCellInputClass} w-24 ml-auto`}
                      />
                    ) : (
                      formatQty(it.qty)
                    )}
                  </td>
                  <td className="text-right">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        value={it.unit_price}
                        onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                        className={`${tableCellInputClass} w-28 ml-auto`}
                      />
                    ) : (
                      formatMoney(it.unit_price, currency)
                    )}
                  </td>
                  <td className="text-right font-semibold tabular-nums">
                    {formatMoney(it.line_total, currency)}
                  </td>
                  {editable && (
                    <td className="col-actions">
                      <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="wt-icon-btn wt-icon-btn--danger" aria-label="Quitar ítem">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
              )}
            </tbody>
          </table>
        </Card>

        <SummaryTotalCard total={formatMoney(total, currency)} />

        <FormActions sticky>
          {!isNew && order && (
            <Button
              variant="secondary"
              onClick={() => {
                if (!orderId) return;
                void getServiceOrderItems(orderId).then((lines) => {
                  printServiceOrderDocument(businessName, currency, order, lines);
                });
              }}
            >
              <Printer size={16} /> Imprimir / PDF
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
            <Link to="/ventas" className="rounded-xl border border-[var(--color-panel-border)] px-4 py-2 text-sm font-semibold text-ink hover:border-brand-300">
              Venta #{order.sale_id}
            </Link>
          )}
          <Link
            to="/ordenes"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
          >
            Cancelar
          </Link>
          {editable && (
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !title.trim() || items.length === 0}
              loading={saving}
            >
              <Save size={16} /> Guardar
            </Button>
          )}
        </FormActions>
      </PageContent>

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
