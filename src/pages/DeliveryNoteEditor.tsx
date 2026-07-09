import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Save, Trash2, Truck, FileText, List, Package, Search } from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  Input,
  PageContent,
  CardSectionTitle,
  FormActions,
  EmptyState,
  tableCellInputClass,
} from "../components/ui";
import { showUserError, showUserSuccess } from "../lib/notice";
import { useAuth } from "../context/AuthContext";
import { useAppConfig } from "../context/AppConfig";
import { getDeliveryNoteLabels } from "../config/deliveryNoteLabels";
import CustomerPicker from "../components/CustomerPicker";
import { listProducts } from "../db/products";
import {
  cancelDeliveryNote,
  createDeliveryNote,
  deleteDeliveryNote,
  getDeliveryNote,
  getDeliveryNoteItems,
  issueDeliveryNote,
  updateDeliveryNote,
  type DeliveryNoteItemInput,
} from "../db/deliveryNotes";
import { logAuditAction } from "../lib/tauri";
import type { DeliveryNote, Product } from "../types";
import { formatDateShort, formatQty } from "../lib/format";
import { confirmAction, confirmDelete } from "../lib/confirm";

export default function DeliveryNoteEditor() {
  const { id } = useParams();
  const isNew = !id || id === "nuevo";
  const noteId = isNew ? null : Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { rubro } = useAppConfig();
  const labels = getDeliveryNoteLabels(rubro);

  const [note, setNote] = useState<DeliveryNote | null>(null);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DeliveryNoteItemInput[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);

  const editable = isNew || note?.status === "draft";

  const load = useCallback(async () => {
    if (noteId && !Number.isNaN(noteId)) {
      const n = await getDeliveryNote(noteId);
      if (!n) {
        navigate("/remitos", { replace: true });
        return;
      }
      setNote(n);
      setCustomerId(n.customer_id ?? "");
      setDestination(n.destination ?? "");
      setNotes(n.notes ?? "");
      const lines = await getDeliveryNoteItems(noteId);
      setItems(
        lines.map((it) => ({
          product_id: it.product_id,
          name: it.name,
          qty: it.qty,
        })),
      );
    }
  }, [noteId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => void listProducts({ search }).then(setResults), 280);
    return () => clearTimeout(t);
  }, [search]);

  function addProduct(p: Product) {
    setItems((prev) => [...prev, { product_id: p.id, name: p.name, qty: 1 }]);
    setSearch("");
    setResults([]);
  }

  function addManual() {
    setItems((prev) => [
      ...prev,
      { product_id: null, name: labels.manualLineDefaultName, qty: 1 },
    ]);
  }

  function updateItem(i: number, patch: Partial<DeliveryNoteItemInput>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        customer_id: customerId === "" ? null : customerId,
        destination,
        notes,
        items,
        user_id: user?.id ?? null,
      };
      if (isNew) {
        const newId = await createDeliveryNote(payload);
        if (user) void logAuditAction(user.id, "delivery_note_created", "delivery_note", newId);
        navigate(`/remitos/${newId}`, { replace: true });
      } else if (noteId) {
        await updateDeliveryNote(noteId, payload);
        await load();
        showUserSuccess("Remito guardado.");
      }
    } catch (e) {
      showUserError(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleIssue() {
    if (!noteId) return;
    if (
      !(await confirmAction({
        title: labels.issueConfirmTitle,
        message: labels.issueConfirmMessage,
        detail: labels.issueConfirmDetail,
        confirmLabel: "Emitir",
      }))
    ) {
      return;
    }
    try {
      await issueDeliveryNote(noteId, user?.id ?? null);
      if (user) void logAuditAction(user.id, "delivery_note_issued", "delivery_note", noteId);
      await load();
      showUserSuccess("Remito emitido. Stock actualizado.");
    } catch (e) {
      showUserError(e);
    }
  }

  async function handleCancel() {
    if (!noteId) return;
    try {
      await cancelDeliveryNote(noteId, user?.id ?? null);
      await load();
    } catch (e) {
      showUserError(e);
    }
  }

  async function handleDelete() {
    if (!noteId || !note) return;
    if (!(await confirmDelete(note.note_number))) return;
    try {
      await deleteDeliveryNote(noteId);
      navigate("/remitos");
    } catch (e) {
      showUserError(e);
    }
  }

  return (
    <div>
      <PageHeader
        title={isNew ? "Nuevo remito" : (note?.note_number ?? "Remito")}
        subtitle={
          note?.issued_at
            ? `Emitido ${formatDateShort(note.issued_at)}`
            : labels.editorSubtitle
        }
        actions={
          <Link to="/remitos" className="inline-flex items-center gap-2 text-sm text-brand-600 dark:text-brand-300">
            <ArrowLeft size={16} /> Volver
          </Link>
        }
      />
      <PageContent wide>
        <Card variant="form" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CardSectionTitle icon={FileText} title="Datos del remito" description="Cliente y destino" className="sm:col-span-2" />
          <CustomerPicker
            label="Cliente"
            value={customerId}
            disabled={!editable}
            onChange={setCustomerId}
          />
          <Input
            label={labels.destinationLabel}
            value={destination}
            disabled={!editable}
            onChange={(e) => setDestination(e.target.value)}
            placeholder={labels.destinationPlaceholder}
          />
          <Input
            label="Observaciones"
            className="sm:col-span-2"
            value={notes}
            disabled={!editable}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={labels.notesPlaceholder}
          />
        </Card>

        {editable && (
          <Card variant="form">
            <CardSectionTitle icon={Search} title="Agregar productos" />
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
                    className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-brand-50/50 dark:hover:bg-brand-900/30"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <Button variant="secondary" onClick={addManual}>
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
                <th>{labels.itemColumnHeader}</th>
                <th className="text-right">Cantidad</th>
                {editable && <th className="col-actions" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={editable ? 3 : 2} className="cell-empty">
                    <EmptyState compact icon={Package} title="Sin ítems" description="Agregá productos al remito." />
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
                        className={tableCellInputClass}
                      />
                    ) : (
                      it.name
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

        <FormActions sticky>
          {note?.status === "draft" && (
            <Button onClick={() => void handleIssue()}>
              <Truck size={16} /> Emitir remito
            </Button>
          )}
          {note?.status === "issued" && (
            <Button variant="danger" onClick={() => void handleCancel()}>
              Anular y devolver stock
            </Button>
          )}
          {note?.status === "draft" && (
            <Button variant="danger" onClick={() => void handleDelete()}>
              Eliminar
            </Button>
          )}
          <Link
            to="/remitos"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
          >
            Cancelar
          </Link>
          {editable && (
            <Button onClick={() => void handleSave()} disabled={saving || items.length === 0} loading={saving}>
              <Save size={16} /> Guardar
            </Button>
          )}
        </FormActions>
      </PageContent>
    </div>
  );
}
