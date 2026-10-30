import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Search, Save, ShoppingCart, Wrench, Printer, FileText, List, ClipboardList, MessageCircle, Pencil, Copy } from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  Input,
  TextArea,
  Select,
  Modal,
  Alert,
  PageContent,
  CardSectionTitle,
  SummaryTotalCard,
  FormActions,
  EmptyState,
  TableNumberInput,
  tableCellInputClass,
} from "../components/ui";
import { showUserError, showUserSuccess } from "../lib/notice";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { listProducts } from "../db/products";
import {
  buildQuoteItem,
  convertQuoteToSale,
  createQuote,
  deleteQuote,
  getQuote,
  getQuoteDuplicatePrefill,
  getQuoteItems,
  isQuoteEditable,
  setQuoteStatus,
  updateQuote,
  type QuoteItemInput,
} from "../db/quotes";
import { logAuditAction } from "../lib/tauri";
import type { Product, Quote, QuoteStatus } from "../types";
import { formatMoney, formatQty } from "../lib/format";
import { confirmDelete } from "../lib/confirm";
import { getQuoteLabels } from "../config/quoteLabels";
import { rubroUsesVehicles, rubroUsesWorkshopFlow } from "../config/workshop";
import VehiclePicker from "../components/VehiclePicker";
import CustomerPicker from "../components/CustomerPicker";
import WorkshopLinks from "../components/WorkshopLinks";
import QuickWriteChips, { QUOTE_NOTES_CHIPS } from "../components/QuickWriteChips";
import {
  createServiceOrderFromQuote,
  getQuotePrefillFromAppointment,
  getServiceOrderByQuoteId,
} from "../db/workshopFlow";
import { printQuoteDocument } from "../lib/prints/quoteDocument";
import { getCustomer } from "../db/customers";
import { openWhatsApp } from "../lib/openExternal";
import { buildQuoteWhatsAppMessage } from "../lib/quoteWhatsApp";

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Borrador",
  sent: "Enviado",
  approved: "Aprobado",
  rejected: "Rechazado",
  converted: "Convertido",
};

export default function QuoteEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === "nuevo";
  const quoteId = isNew ? null : Number(id);
  const navigate = useNavigate();
  const { currency, rubro, isProModuleActive, businessName } = useAppConfig();
  const labels = getQuoteLabels(rubro);
  const usesVehicles = rubroUsesVehicles(rubro);
  const workshopFlow = rubroUsesWorkshopFlow(rubro);
  const { user } = useAuth();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [items, setItems] = useState<QuoteItemInput[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [payment, setPayment] = useState("efectivo");
  const [paid, setPaid] = useState<number | "">("");
  const [vehicleId, setVehicleId] = useState<number | "">("");
  const [appointmentId, setAppointmentId] = useState<number | null>(null);
  const [linkedOrder, setLinkedOrder] = useState<{ id: number; order_number: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);

  /** Aprobado o rechazado se ve cerrado y se abre con «Editar»; borrador y enviado se editan directo. */
  const needsEditButton = quote?.status === "approved" || quote?.status === "rejected";
  const inEditSession = !isNew && needsEditButton && editing;
  const editable =
    isNew || (quote != null && isQuoteEditable(quote.status) && (!needsEditButton || editing));

  useEffect(() => {
    setEditing(false);
  }, [quoteId]);

  const load = useCallback(async () => {
    if (isNew) {
      setQuote(null);
      setLinkedOrder(null);
      const duplicar = searchParams.get("duplicar");
      if (duplicar && !Number.isNaN(Number(duplicar))) {
        const prefill = await getQuoteDuplicatePrefill(Number(duplicar));
        if (prefill) {
          setCustomerId(prefill.customer_id ?? "");
          setVehicleId(prefill.vehicle_id ?? "");
          setAppointmentId(null);
          setGlobalDiscount(prefill.discount_pct);
          setNotes(prefill.notes);
          setValidUntil("");
          setItems(prefill.items);
          setDuplicateOf(prefill.source_number);
        }
        return;
      }
      setDuplicateOf(null);
      const desdeTurno = searchParams.get("desde_turno");
      if (desdeTurno && !Number.isNaN(Number(desdeTurno))) {
        const prefill = await getQuotePrefillFromAppointment(Number(desdeTurno));
        if (prefill) {
          setCustomerId(prefill.customer_id ?? "");
          setVehicleId(prefill.vehicle_id ?? "");
          setAppointmentId(prefill.appointment_id);
          setNotes(prefill.notes ?? "");
          setItems(prefill.items);
        }
      }
      return;
    }
    if (quoteId && !Number.isNaN(quoteId)) {
      const q = await getQuote(quoteId);
      if (!q) {
        navigate("/presupuestos", { replace: true });
        return;
      }
      setQuote(q);
      setDuplicateOf(null);
      setCustomerId(q.customer_id ?? "");
      setNotes(q.notes ?? "");
      setValidUntil(q.valid_until?.slice(0, 10) ?? "");
      setGlobalDiscount(q.discount_pct);
      setVehicleId(q.vehicle_id ?? "");
      setAppointmentId(q.appointment_id);
      setLinkedOrder(await getServiceOrderByQuoteId(quoteId));
      const lines = await getQuoteItems(quoteId);
      setItems(
        lines.map((it) => ({
          sync_id: it.sync_id ?? null,
          product_id: it.product_id,
          variant_id: it.variant_id,
          name: it.name,
          qty: it.qty,
          unit_price: it.unit_price,
          discount_pct: it.discount_pct,
          line_total: it.line_total,
        })),
      );
    }
  }, [quoteId, navigate, isNew, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void listProducts({ search }).then(setResults);
    }, 280);
    return () => clearTimeout(t);
  }, [search]);

  const subtotal = useMemo(
    () => items.reduce((a, i) => a + i.line_total, 0),
    [items],
  );
  const total = subtotal * (1 - globalDiscount / 100);

  function addProduct(p: Product) {
    setItems((prev) => [
      ...prev,
      buildQuoteItem(p.name, 1, p.price, 0, p.id, null),
    ]);
    setSearch("");
    setResults([]);
  }

  function addManualLine() {
    setItems((prev) => [
      ...prev,
      buildQuoteItem(labels.manualLineDefaultName, 1, 0, 0, null, null),
    ]);
  }

  function updateItem(index: number, patch: Partial<QuoteItemInput>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const next = { ...it, ...patch };
        next.line_total = next.qty * next.unit_price * (1 - next.discount_pct / 100);
        return next;
      }),
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave({ quiet = false }: { quiet?: boolean } = {}): Promise<boolean> {
    const unnamed = items.some((it) => it.product_id == null && !it.name.trim());
    if (unnamed) {
      showUserError("Completá la descripción de cada línea manual.", "Ítems incompletos");
      return false;
    }
    setSaving(true);
    try {
      const payload = {
        customer_id: customerId === "" ? null : customerId,
        vehicle_id: vehicleId === "" ? null : vehicleId,
        appointment_id: appointmentId,
        discount_pct: globalDiscount,
        notes,
        valid_until: validUntil || null,
        items,
        user_id: user?.id ?? null,
      };
      if (isNew) {
        const newId = await createQuote(payload);
        if (user) {
          void logAuditAction(
            user.id,
            "quote_created",
            "quote",
            newId,
            duplicateOf ? `Copia de ${duplicateOf}` : undefined,
          );
        }
        navigate(`/presupuestos/${newId}`, { replace: true });
      } else if (quoteId && quote) {
        await updateQuote(quoteId, payload);
        if (user) {
          void logAuditAction(
            user.id,
            "quote_updated",
            "quote",
            quoteId,
            `Estado: ${STATUS_LABEL[quote.status]},total=${total}`,
          );
        }
        setEditing(false);
        await load();
        if (!quiet) {
          const orderNote = linkedOrder
            ? ` La orden ${linkedOrder.order_number} no cambia sola: si cambió el trabajo, ajustala ahí.`
            : "";
          showUserSuccess(
            needsEditButton || quote.status === "sent"
              ? `Presupuesto ${quote.quote_number} actualizado. Si ya se lo mandaste al cliente, reenvialo por WhatsApp o PDF.${orderNote}`
              : `Presupuesto guardado.${orderNote}`,
          );
        }
      }
      return true;
    } catch (e) {
      showUserError(e);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function sendWhatsApp() {
    if (!quote) return;
    if (customerId === "") {
      showUserError(
        "Elegí un cliente con celular. El envío abre el WhatsApp de esa persona, no hace falta la pantalla de turnos.",
        "Falta el cliente",
      );
      return;
    }
    if (items.length === 0) {
      showUserError("Agregá al menos un ítem al presupuesto.", "Presupuesto vacío");
      return;
    }
    try {
      const customer = await getCustomer(customerId);
      const phone = customer?.phone?.trim();
      if (!phone) {
        showUserError(
          "Ese cliente no tiene celular. Cargalo en Clientes y volvé a tocar Enviar por WhatsApp.",
          "Sin WhatsApp",
        );
        return;
      }
      const message = buildQuoteWhatsAppMessage({
        businessName,
        customerName: customer?.name ?? quote.customer_name ?? null,
        quoteNumber: quote.quote_number,
        items,
        total,
        currency,
        validUntil: validUntil || null,
        notes,
      });
      const result = await openWhatsApp(phone, message);
      if (quote.status === "draft") await changeStatus("sent");
      showUserSuccess(
        result.copied
          ? "Se abrió WhatsApp Web y el presupuesto quedó copiado. Pegalo en el chat y enviá."
          : "Se abrió WhatsApp Web con el presupuesto. Si no lo ves, mirá el navegador.",
      );
    } catch (e) {
      showUserError(e);
    }
  }

  async function changeStatus(status: QuoteStatus) {
    if (!quoteId) return;
    try {
      await setQuoteStatus(quoteId, status);
      if (user) void logAuditAction(user.id, `quote_${status}`, "quote", quoteId);
      await load();
    } catch (e) {
      showUserError(e);
    }
  }

  async function handleDelete() {
    if (!quoteId || !quote) return;
    if (!(await confirmDelete(quote.quote_number))) return;
    try {
      await deleteQuote(quoteId);
      navigate("/presupuestos");
    } catch (e) {
      showUserError(e);
    }
  }

  async function handleConvert() {
    if (!quoteId) return;
    setSaving(true);
    try {
      const saleId = await convertQuoteToSale(quoteId, {
        payment_method: payment,
        paid: paid === "" ? null : paid,
        user_id: user?.id ?? null,
      });
      if (user) void logAuditAction(user.id, "quote_converted", "quote", quoteId, `sale=${saleId}`);
      setConvertOpen(false);
      showUserSuccess(`Venta #${saleId} registrada.`);
      await load();
    } catch (e) {
      showUserError(e);
    } finally {
      setSaving(false);
    }
  }

  function handleDuplicate() {
    if (!quoteId) return;
    navigate(`/presupuestos/nuevo?duplicar=${quoteId}`);
  }

  function cancelEditing() {
    setEditing(false);
    setSearch("");
    void load();
  }

  const title = isNew
    ? "Nuevo presupuesto"
    : quote
      ? `${quote.quote_number} · ${STATUS_LABEL[quote.status]}`
      : "Presupuesto";

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={
          isNew
            ? duplicateOf
              ? `Copia de ${duplicateOf}. Cambiá lo que necesites y guardá: va a tener un número nuevo.`
              : labels.editorSubtitle
            : inEditSession
              ? "Editando. Guardá para que quede con el mismo número."
              : undefined
        }
        actions={
          <Link
            to="/presupuestos"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            <ArrowLeft size={16} /> Volver al listado
          </Link>
        }
      />

      <PageContent wide>
        {!isNew && quote && needsEditButton && !editing && (
          <Alert variant="info" className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <span className="min-w-0 flex-1">
              {quote.status === "approved"
                ? "Este presupuesto está aprobado. Si el cliente pide sumar o cambiar algo, tocá «Editar»: queda con el mismo número."
                : "Este presupuesto está rechazado. Si el cliente lo retoma con cambios, tocá «Editar»."}
            </span>
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Editar
            </Button>
          </Alert>
        )}
        {inEditSession && linkedOrder && (
          <Alert variant="warning">
            Este presupuesto ya tiene la orden {linkedOrder.order_number}. Al guardar, la orden no cambia sola:
            si cambió el trabajo, ajustala también en la orden.
          </Alert>
        )}
        {!isNew && quote?.status === "converted" && (
          <Alert variant="warning" className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <span className="min-w-0 flex-1">
              Este presupuesto ya se cobró
              {quote.sale_id ? ` (venta #${quote.sale_id})` : ""}, por eso no se puede cambiar: la venta, la caja y el
              stock ya quedaron registrados. Si el cliente pide algo más, tocá «Duplicar y editar» y armá uno nuevo.
            </span>
            <Button size="sm" onClick={handleDuplicate}>
              <Copy size={14} /> Duplicar y editar
            </Button>
          </Alert>
        )}
        <Card variant="form">
          <CardSectionTitle icon={FileText} title="Datos del presupuesto" description="Cliente, vigencia y condiciones" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="relative z-20">
              <CustomerPicker
                label="Cliente"
                value={customerId}
                disabled={!editable}
                panelMode="overlay"
                placeholder="Consumidor final (o buscá un cliente)"
                emptyOptionLabel="Consumidor final"
                onChange={(id) => {
                  setCustomerId(id);
                  setVehicleId("");
                }}
              />
            </div>
            <Input
              label="Válido hasta"
              type="date"
              value={validUntil}
              disabled={!editable}
              onChange={(e) => setValidUntil(e.target.value)}
            />
            <Input
              label="Descuento global %"
              type="number"
              min={0}
              max={100}
              value={globalDiscount}
              disabled={!editable}
              onChange={(e) => setGlobalDiscount(Number(e.target.value))}
            />
          </div>
          {usesVehicles && (
            <VehiclePicker
              customerId={customerId}
              vehicleId={vehicleId}
              disabled={!editable}
              className="mt-5"
              onVehicleChange={setVehicleId}
            />
          )}
          <div className="mt-8 space-y-2 min-w-0 border-t border-[var(--color-panel-border)] pt-6">
            <TextArea
              label="Notas / condiciones"
              value={notes}
              disabled={!editable}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={labels.notesPlaceholder}
              rows={3}
            />
            {editable && (
              <QuickWriteChips
                chips={QUOTE_NOTES_CHIPS}
                value={notes}
                onChange={setNotes}
                replace={false}
              />
            )}
          </div>
        </Card>

        {!isNew && workshopFlow && (appointmentId || linkedOrder) && (
          <Card>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Vinculaciones
            </p>
            <WorkshopLinks
              items={[
                ...(appointmentId
                  ? [{ label: `Turno #${appointmentId}`, to: `/turnos/${appointmentId}` }]
                  : []),
                ...(linkedOrder
                  ? [{ label: `OT ${linkedOrder.order_number}`, to: `/ordenes/${linkedOrder.id}` }]
                  : []),
              ]}
            />
          </Card>
        )}

        {editable && (
          <Card variant="form">
            <CardSectionTitle icon={Search} title={labels.addItemsTitle} description="Del stock o líneas manuales para cotizar rápido" />
            <div className="relative mb-3">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={labels.productSearchPlaceholder}
                className="w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-brand-500"
              />
            </div>
            {results.length > 0 && (
              <div className="mb-3 max-h-40 overflow-y-auto rounded-xl border border-[var(--color-panel-border)]">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between border-b border-[var(--color-panel-border)] px-3 py-2 text-left text-sm last:border-0 hover:bg-brand-50/50 dark:hover:bg-brand-900/30"
                  >
                    <span className="text-ink">{p.name}</span>
                    <span className="text-brand-600 dark:text-brand-300">
                      {formatMoney(p.price, currency)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <Button variant="secondary" onClick={addManualLine}>
              <Plus size={16} /> {labels.manualLineButton}
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
                <th>Descripción</th>
                <th className="text-right">Cant.</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Desc.%</th>
                <th className="text-right">Subtotal</th>
                {editable && <th className="col-actions" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 6 : 5} className="cell-empty">
                    <EmptyState
                      compact
                      icon={ClipboardList}
                      title="Sin ítems"
                      description={labels.emptyItemsMessage}
                    />
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={idx} className="table-row">
                    <td>
                      {editable && it.product_id == null ? (
                        <input
                          value={it.name}
                          onChange={(e) => updateItem(idx, { name: e.target.value })}
                          placeholder={labels.manualLinePlaceholder}
                          className={tableCellInputClass}
                        />
                      ) : (
                        <span className="font-medium text-ink">{it.name}</span>
                      )}
                    </td>
                    <td className="text-right">
                      {editable ? (
                        <TableNumberInput
                          min={0}
                          value={it.qty}
                          onChange={(e) =>
                            updateItem(idx, { qty: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="w-24 ml-auto"
                        />
                      ) : (
                        formatQty(it.qty)
                      )}
                    </td>
                    <td className="text-right">
                      {editable ? (
                        <TableNumberInput
                          min={0}
                          value={it.unit_price}
                          onChange={(e) =>
                            updateItem(idx, { unit_price: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="w-28 ml-auto"
                        />
                      ) : (
                        formatMoney(it.unit_price, currency)
                      )}
                    </td>
                    <td className="text-right">
                      {editable ? (
                        <TableNumberInput
                          min={0}
                          max={100}
                          value={it.discount_pct}
                          onChange={(e) =>
                            updateItem(idx, { discount_pct: Number(e.target.value) })
                          }
                          className="w-20 ml-auto"
                        />
                      ) : (
                        `${it.discount_pct}%`
                      )}
                    </td>
                    <td className="text-right font-semibold tabular-nums text-ink">
                      {formatMoney(it.line_total, currency)}
                    </td>
                    {editable && (
                      <td className="col-actions">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="wt-icon-btn wt-icon-btn--danger"
                          aria-label="Quitar ítem"
                        >
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

        <SummaryTotalCard
          lines={[
            { label: "Subtotal", value: formatMoney(subtotal, currency) },
            ...(globalDiscount > 0
              ? [{ label: `Descuento ${globalDiscount}%`, value: "" }]
              : []),
          ]}
          total={formatMoney(total, currency)}
        />

        <FormActions sticky>
          {inEditSession && (
            <Button variant="secondary" onClick={cancelEditing} disabled={saving}>
              Cancelar edición
            </Button>
          )}
          {!isNew && quote && !inEditSession && needsEditButton && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={16} /> Editar
            </Button>
          )}
          {!isNew && quote?.status === "converted" && (
            <Button variant="secondary" onClick={handleDuplicate}>
              <Copy size={16} /> Duplicar y editar
            </Button>
          )}
          {!isNew && quote && !inEditSession && (
            <Button
              variant="secondary"
              onClick={() => {
                void getQuoteItems(quote.id).then((lines) => {
                  void printQuoteDocument(businessName, currency, quote, lines);
                });
              }}
            >
              <Printer size={16} /> Imprimir / PDF
            </Button>
          )}
          {!isNew && quote && !inEditSession && (
            <Button variant="secondary" onClick={() => sendWhatsApp()}>
              <MessageCircle size={16} /> Enviar por WhatsApp
            </Button>
          )}
          {!isNew && quote?.status === "draft" && (
            <Button
              variant="secondary"
              onClick={async () => {
                if (await handleSave()) await changeStatus("sent");
              }}
            >
              Marcar enviado
            </Button>
          )}
          {!isNew && !inEditSession && (quote?.status === "sent" || quote?.status === "draft" || quote?.status === "rejected") && (
            <Button variant="secondary" onClick={() => changeStatus("approved")}>
              Aprobar
            </Button>
          )}
          {!isNew && !inEditSession && (quote?.status === "sent" || quote?.status === "draft" || quote?.status === "approved") && (
            <Button variant="secondary" onClick={() => changeStatus("rejected")}>
              Rechazar
            </Button>
          )}
          {!isNew &&
            !inEditSession &&
            workshopFlow &&
            isProModuleActive("service_orders") &&
            !linkedOrder &&
            quote &&
            quote.status !== "rejected" &&
            quote.status !== "converted" && (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!quoteId) return;
                  try {
                    const orderId = await createServiceOrderFromQuote(quoteId, user?.id ?? null);
                    navigate(`/ordenes/${orderId}`);
                  } catch (e) {
                    showUserError(e);
                  }
                }}
              >
                <Wrench size={16} /> Crear orden de servicio
              </Button>
            )}
          {!isNew &&
            !inEditSession &&
            (quote?.status === "sent" || quote?.status === "approved") && (
              <Button
                onClick={async () => {
                  if (editable && !(await handleSave({ quiet: true }))) return;
                  setConvertOpen(true);
                }}
                disabled={saving}
              >
                <ShoppingCart size={16} /> Convertir a venta
              </Button>
            )}
          {!isNew && quote?.status === "converted" && quote.sale_id && (
            <Link
              to="/ventas"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-panel-border)] px-4 py-2 text-sm font-semibold text-ink hover:border-brand-400"
            >
              Ver ventas (#{quote.sale_id})
            </Link>
          )}
          {!isNew && (quote?.status === "draft" || quote?.status === "rejected") && (
            <Button variant="danger" onClick={() => handleDelete()}>
              Eliminar
            </Button>
          )}
          {!inEditSession && (
            <Link
              to="/presupuestos"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
            >
              Cancelar
            </Link>
          )}
          {editable && (
            <Button onClick={() => handleSave()} disabled={saving || items.length === 0} loading={saving}>
              <Save size={16} /> Guardar
            </Button>
          )}
        </FormActions>
      </PageContent>

      <Modal open={convertOpen} title="Convertir a venta" onClose={() => setConvertOpen(false)}>
        <p className="mb-4 text-sm text-ink-muted">
          Total a cobrar: <strong>{formatMoney(total, currency)}</strong>. {labels.convertStockNote}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Medio de pago" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="efectivo">Efectivo</option>
            <option value="débito">Débito</option>
            <option value="crédito">Crédito</option>
            <option value="transferencia">Transferencia</option>
            <option value="qr">QR</option>
          </Select>
          <Input
            label="Paga con (opcional)"
            type="number"
            value={paid}
            onChange={(e) => setPaid(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConvertOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => handleConvert()} disabled={saving}>
            Confirmar venta
          </Button>
        </div>
      </Modal>
    </div>
  );
}
