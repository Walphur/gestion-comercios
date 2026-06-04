import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Search, Wallet } from "lucide-react";
import { PageHeader, Button, Input, Card, Modal, Select } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import {
  listCustomers,
  createCustomer,
  updateCustomer,
  deactivateCustomer,
  registerCustomerPayment,
  listCustomerPayments,
} from "../db/customers";
import type { Customer, CustomerInput, CustomerPayment } from "../types";
import { formatMoney } from "../lib/format";
import { confirmAction } from "../lib/confirm";

const EMPTY: CustomerInput = {
  name: "",
  phone: "",
  document: "",
  email: "",
  credit_limit: 0,
  notes: "",
};

export default function Customers() {
  const { currency } = useAppConfig();
  const { user, can } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerInput>(EMPTY);
  const [payTarget, setPayTarget] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("efectivo");
  const [payments, setPayments] = useState<CustomerPayment[]>([]);

  const reload = useCallback(async () => {
    setCustomers(await listCustomers(search));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [reload]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      document: c.document ?? "",
      email: c.email ?? "",
      credit_limit: c.credit_limit,
      notes: c.notes ?? "",
    });
    setFormOpen(true);
  }

  async function saveCustomer() {
    if (!form.name.trim()) return alert("El nombre es obligatorio.");
    if (editing) await updateCustomer(editing.id, form);
    else await createCustomer(form);
    setFormOpen(false);
    reload();
  }

  async function handleDelete(c: Customer) {
    if (
      !(await confirmAction({
        title: "Desactivar cliente",
        message: `¿Desactivar a «${c.name}»?`,
        detail: "No se borra el historial; deja de aparecer en ventas nuevas.",
        variant: "danger",
        confirmLabel: "Sí, desactivar",
      }))
    ) {
      return;
    }
    await deactivateCustomer(c.id);
    reload();
  }

  async function openPayments(c: Customer) {
    setPayTarget(c);
    setPayAmount("");
    setPayments(await listCustomerPayments(c.id));
  }

  async function submitPayment() {
    if (!payTarget) return;
    const amount = Number(payAmount);
    if (Number.isNaN(amount) || amount <= 0) return alert("Monto inválido.");
    try {
      await registerCustomerPayment(
        payTarget.id,
        amount,
        payMethod,
        user?.id ?? null,
      );
      setPayTarget(null);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const canEdit = can("manage_products");

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Cuenta corriente y cobros"
        actions={
          canEdit ? (
            <Button onClick={openNew}>
              <Plus size={16} /> Nuevo cliente
            </Button>
          ) : undefined
        }
      />

      <div className="p-8">
        <div className="mb-4 max-w-md">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre, teléfono o documento…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-100 bg-brand-50/50 text-left text-xs uppercase text-ink-muted">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3 text-right">Deuda</th>
                <th className="px-4 py-3 text-right">Límite crédito</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                    No hay clientes. Creá uno para vender a fiado.
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-brand-50 hover:bg-brand-50/30">
                  <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {[c.phone, c.document].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums font-semibold ${
                      c.balance > 0 ? "text-amber-700" : "text-ink"
                    }`}
                  >
                    {formatMoney(c.balance, currency)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                    {c.credit_limit > 0 ? formatMoney(c.credit_limit, currency) : "Sin límite"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => openPayments(c)}>
                        <Wallet size={16} /> Cobrar
                      </Button>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => openEdit(c)}
                            className="rounded-lg p-2 text-ink-muted hover:bg-brand-50"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            className="rounded-lg p-2 text-ink-muted hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Modal
        open={formOpen}
        title={editing ? "Editar cliente" : "Nuevo cliente"}
        onClose={() => setFormOpen(false)}
      >
        <div className="space-y-3">
          <Input
            label="Nombre *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Teléfono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="Documento (DNI/CUIT)"
            value={form.document}
            onChange={(e) => setForm({ ...form, document: e.target.value })}
          />
          <Input
            label="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Límite de crédito (0 = sin límite)"
            type="number"
            value={form.credit_limit}
            onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })}
          />
          <Input
            label="Notas"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setFormOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={saveCustomer}>Guardar</Button>
        </div>
      </Modal>

      <Modal
        open={payTarget !== null}
        title={payTarget ? `Cobrar a ${payTarget.name}` : ""}
        onClose={() => setPayTarget(null)}
      >
        {payTarget && (
          <>
            <p className="mb-3 text-sm text-ink-muted">
              Deuda actual:{" "}
              <strong className="text-amber-700">
                {formatMoney(payTarget.balance, currency)}
              </strong>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Monto a cobrar"
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
              <Select
                label="Medio"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="débito">Débito</option>
              </Select>
            </div>
            {payments.length > 0 && (
              <div className="mt-4 max-h-32 overflow-y-auto text-xs text-ink-muted">
                <p className="mb-1 font-medium text-ink">Últimos cobros</p>
                {payments.map((p) => (
                  <p key={p.id}>
                    {p.created_at}: {formatMoney(p.amount, currency)} ({p.payment_method})
                  </p>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPayTarget(null)}>
                Cancelar
              </Button>
              <Button onClick={submitPayment}>Registrar cobro</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
