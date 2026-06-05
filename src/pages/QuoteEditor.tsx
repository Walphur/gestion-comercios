import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Search, Save, ShoppingCart } from "lucide-react";
import { PageHeader, Card, Button, Input, Select, Modal } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { listCustomers } from "../db/customers";
import { listProducts } from "../db/products";
import {
  buildQuoteItem,
  convertQuoteToSale,
  createQuote,
  deleteQuote,
  getQuote,
  getQuoteItems,
  setQuoteStatus,
  updateQuote,
  type QuoteItemInput,
} from "../db/quotes";
import { logAuditAction } from "../lib/tauri";
import type { Customer, Product, Quote, QuoteStatus } from "../types";
import { formatMoney, formatQty } from "../lib/format";
import { confirmDelete } from "../lib/confirm";
import { getQuoteLabels } from "../config/quoteLabels";

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Borrador",
  sent: "Enviado",
  approved: "Aprobado",
  rejected: "Rechazado",
  converted: "Convertido",
};

export default function QuoteEditor() {
  const { id } = useParams();
  const isNew = !id || id === "nuevo";
  const quoteId = isNew ? null : Number(id);
  const navigate = useNavigate();
  const { currency, rubro } = useAppConfig();
  const labels = getQuoteLabels(rubro);
  const { user } = useAuth();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
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

  const editable = isNew || quote?.status === "draft" || quote?.status === "sent";

  const load = useCallback(async () => {
    const c = await listCustomers();
    setCustomers(c);
    if (quoteId && !Number.isNaN(quoteId)) {
      const q = await getQuote(quoteId);
      if (!q) {
        navigate("/presupuestos", { replace: true });
        return;
      }
      setQuote(q);
      setCustomerId(q.customer_id ?? "");
      setNotes(q.notes ?? "");
      setValidUntil(q.valid_until?.slice(0, 10) ?? "");
      setGlobalDiscount(q.discount_pct);
      const lines = await getQuoteItems(quoteId);
      setItems(
        lines.map((it) => ({
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
  }, [quoteId, navigate]);

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

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        customer_id: customerId === "" ? null : customerId,
        discount_pct: globalDiscount,
        notes,
        valid_until: validUntil || null,
        items,
        user_id: user?.id ?? null,
      };
      if (isNew) {
        const newId = await createQuote(payload);
        if (user) void logAuditAction(user.id, "quote_created", "quote", newId);
        navigate(`/presupuestos/${newId}`, { replace: true });
      } else if (quoteId) {
        await updateQuote(quoteId, payload);
        if (user) void logAuditAction(user.id, "quote_updated", "quote", quoteId);
        await load();
        alert("Presupuesto guardado.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: QuoteStatus) {
    if (!quoteId) return;
    try {
      await setQuoteStatus(quoteId, status);
      if (user) void logAuditAction(user.id, `quote_${status}`, "quote", quoteId);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete() {
    if (!quoteId || !quote) return;
    if (!(await confirmDelete(quote.quote_number))) return;
    try {
      await deleteQuote(quoteId);
      navigate("/presupuestos");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
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
      alert(`Venta #${saleId} registrada.`);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
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
        subtitle={isNew ? labels.editorSubtitle : undefined}
        actions={
          <Link
            to="/presupuestos"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            <ArrowLeft size={16} /> Volver al listado
          </Link>
        }
      />

      <div className="mx-auto max-w-5xl space-y-6 p-8">
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Cliente"
              value={customerId}
              disabled={!editable}
              onChange={(e) =>
                setCustomerId(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">— Sin cliente —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
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
          <Input
            label="Notas / condiciones"
            className="mt-4"
            value={notes}
            disabled={!editable}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={labels.notesPlaceholder}
          />
        </Card>

        {editable && (
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-ink">{labels.addItemsTitle}</h3>
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

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3 text-left">Descripción</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">Desc.%</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                {editable && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 6 : 5} className="px-4 py-8 text-center text-ink-muted">
                    {labels.emptyItemsMessage}
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={idx} className="table-row">
                    <td className="px-4 py-2">
                      {editable && it.product_id == null ? (
                        <input
                          value={it.name}
                          onChange={(e) => updateItem(idx, { name: e.target.value })}
                          className="w-full rounded border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1 text-sm"
                        />
                      ) : (
                        <span className="text-ink">{it.name}</span>
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
                          className="w-20 rounded border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1 text-right text-sm tabular-nums"
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
                          step="0.01"
                          value={it.unit_price}
                          onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                          className="w-24 rounded border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1 text-right text-sm tabular-nums"
                        />
                      ) : (
                        formatMoney(it.unit_price, currency)
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {editable ? (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={it.discount_pct}
                          onChange={(e) =>
                            updateItem(idx, { discount_pct: Number(e.target.value) })
                          }
                          className="w-16 rounded border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-2 py-1 text-right text-sm"
                        />
                      ) : (
                        `${it.discount_pct}%`
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-ink">
                      {formatMoney(it.line_total, currency)}
                    </td>
                    {editable && (
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-ink-muted hover:text-red-600"
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
          <div className="border-t border-[var(--color-panel-border)] px-5 py-4 text-right">
            <p className="text-sm text-ink-muted">
              Subtotal: {formatMoney(subtotal, currency)}
              {globalDiscount > 0 && ` · Desc. ${globalDiscount}%`}
            </p>
            <p className="font-display text-2xl font-bold text-ink">
              Total: {formatMoney(total, currency)}
            </p>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button onClick={() => void handleSave()} disabled={saving || items.length === 0}>
              <Save size={16} /> {saving ? "Guardando…" : "Guardar"}
            </Button>
          )}
          {!isNew && quote?.status === "draft" && (
            <Button
              variant="secondary"
              onClick={async () => {
                await handleSave();
                await changeStatus("sent");
              }}
            >
              Marcar enviado
            </Button>
          )}
          {!isNew && (quote?.status === "sent" || quote?.status === "draft") && (
            <>
              <Button variant="secondary" onClick={() => void changeStatus("approved")}>
                Aprobar
              </Button>
              <Button variant="secondary" onClick={() => void changeStatus("rejected")}>
                Rechazar
              </Button>
            </>
          )}
          {!isNew &&
            (quote?.status === "sent" || quote?.status === "approved") && (
              <Button onClick={() => setConvertOpen(true)}>
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
            <Button variant="danger" onClick={() => void handleDelete()}>
              Eliminar
            </Button>
          )}
        </div>
      </div>

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
          <Button onClick={() => void handleConvert()} disabled={saving}>
            Confirmar venta
          </Button>
        </div>
      </Modal>
    </div>
  );
}
