import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Save, Trash2, Truck } from "lucide-react";
import { PageHeader, Card, Button, Input, Select } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { listCustomers } from "../db/customers";
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
import type { Customer, DeliveryNote, Product } from "../types";
import { formatDateShort, formatQty } from "../lib/format";
import { confirmAction, confirmDelete } from "../lib/confirm";

export default function DeliveryNoteEditor() {
  const { id } = useParams();
  const isNew = !id || id === "nuevo";
  const noteId = isNew ? null : Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [note, setNote] = useState<DeliveryNote | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DeliveryNoteItemInput[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);

  const editable = isNew || note?.status === "draft";

  const load = useCallback(async () => {
    setCustomers(await listCustomers());
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
    setItems((prev) => [...prev, { product_id: null, name: "Ítem manual", qty: 1 }]);
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
        alert("Remito guardado.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleIssue() {
    if (!noteId) return;
    if (
      !(await confirmAction({
        title: "Emitir remito",
        message: "¿Confirmar salida de mercadería?",
        detail: "Se descontará el stock de los productos del remito.",
        confirmLabel: "Emitir",
      }))
    ) {
      return;
    }
    try {
      await issueDeliveryNote(noteId, user?.id ?? null);
      if (user) void logAuditAction(user.id, "delivery_note_issued", "delivery_note", noteId);
      await load();
      alert("Remito emitido. Stock actualizado.");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCancel() {
    if (!noteId) return;
    try {
      await cancelDeliveryNote(noteId, user?.id ?? null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete() {
    if (!noteId || !note) return;
    if (!(await confirmDelete(note.note_number))) return;
    try {
      await deleteDeliveryNote(noteId);
      navigate("/remitos");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <PageHeader
        title={isNew ? "Nuevo remito" : (note?.note_number ?? "Remito")}
        subtitle={
          note?.issued_at
            ? `Emitido ${formatDateShort(note.issued_at)}`
            : "Mercadería que sale del depósito o taller"
        }
        actions={
          <Link to="/remitos" className="inline-flex items-center gap-2 text-sm text-brand-600 dark:text-brand-300">
            <ArrowLeft size={16} /> Volver
          </Link>
        }
      />
      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            label="Destino / taller / sucursal"
            value={destination}
            disabled={!editable}
            onChange={(e) => setDestination(e.target.value)}
          />
          <Input
            label="Observaciones"
            className="sm:col-span-2"
            value={notes}
            disabled={!editable}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Card>

        {editable && (
          <Card>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto…"
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
              <Plus size={16} /> Línea sin producto
            </Button>
          </Card>
        )}

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3 text-left">Artículo</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                {editable && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="table-row">
                  <td className="px-4 py-2">
                    {editable && it.product_id == null ? (
                      <input
                        value={it.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        className="w-full rounded border border-[var(--color-panel-border)] px-2 py-1 text-sm"
                      />
                    ) : (
                      it.name
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
                        className="w-20 rounded border px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      formatQty(it.qty)
                    )}
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
        </Card>

        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button onClick={() => void handleSave()} disabled={saving || items.length === 0}>
              <Save size={16} /> Guardar
            </Button>
          )}
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
        </div>
      </div>
    </div>
  );
}
