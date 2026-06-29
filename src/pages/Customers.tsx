import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Search, Wallet, Car } from "lucide-react";
import { PageHeader, Button, Input, Modal, Select, PageContent, DataTableShell, IconButton, FormGrid, FormActions } from "../components/ui";
import { showUserError } from "../lib/notice";
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
import { createVehicle } from "../db/vehicles";
import type { Customer, CustomerInput, CustomerPayment } from "../types";
import { formatMoney } from "../lib/format";
import { confirmAction } from "../lib/confirm";
import { rubroUsesVehicles } from "../config/workshop";
import { getCustomerLabels } from "../config/customerLabels";
import CustomerVehiclesModal from "../components/CustomerVehiclesModal";
import {
  isArgentinaStoredPhone,
  phoneToLocalDisplay,
} from "../lib/phoneFormat";

const EMPTY: CustomerInput = {
  name: "",
  phone: "",
  document: "",
  email: "",
  credit_limit: 0,
  notes: "",
};

const EMPTY_VEHICLE = { plate: "", brand: "", model: "" };

export default function Customers() {
  const { currency, rubro } = useAppConfig();
  const labels = getCustomerLabels(rubro);
  const showVehicles = rubroUsesVehicles(rubro);
  const { user, can } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerInput>(EMPTY);
  const [newVehicle, setNewVehicle] = useState(EMPTY_VEHICLE);
  const [payTarget, setPayTarget] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("efectivo");
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [vehiclesTarget, setVehiclesTarget] = useState<Customer | null>(null);
  const [phoneManual, setPhoneManual] = useState(false);

  const reload = useCallback(async () => {
    setCustomers(await listCustomers(search));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(reload, 200);
    const poll = setInterval(() => void reload(), 60_000);
    return () => {
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [reload]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setNewVehicle(EMPTY_VEHICLE);
    setPhoneManual(false);
    setFormOpen(true);
  }

  function openEdit(c: Customer) {
    const manual = !isArgentinaStoredPhone(c.phone);
    setEditing(c);
    setPhoneManual(manual);
    setForm({
      name: c.name,
      phone: manual ? (c.phone ?? "") : phoneToLocalDisplay(c.phone),
      document: c.document ?? "",
      email: c.email ?? "",
      credit_limit: c.credit_limit,
      notes: c.notes ?? "",
    });
    setNewVehicle(EMPTY_VEHICLE);
    setFormOpen(true);
  }

  async function saveCustomer() {
    if (!form.name.trim()) {
      showUserError("El nombre es obligatorio.", "Falta un dato");
      return;
    }
    try {
      if (editing) {
        await updateCustomer(editing.id, form);
      } else {
        const customerId = await createCustomer(form);
        if (showVehicles && newVehicle.plate.trim()) {
          await createVehicle({
            customer_id: customerId,
            plate: newVehicle.plate,
            brand: newVehicle.brand || null,
            model: newVehicle.model || null,
          });
        }
      }
      setFormOpen(false);
      reload();
    } catch (e) {
      showUserError(e);
    }
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
    if (Number.isNaN(amount) || amount <= 0) {
      showUserError("Ingresá un monto mayor a cero.", "Monto inválido");
      return;
    }
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
      showUserError(e);
    }
  }

  const canEdit = can("manage_products");

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle={labels.listSubtitle}
        actions={
          canEdit ? (
            <Button onClick={openNew}>
              <Plus size={16} /> {labels.newTitle}
            </Button>
          ) : undefined
        }
      />

      <PageContent>
        <div className="mb-4 max-w-md">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input
              className="pl-9"
              placeholder={labels.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <DataTableShell>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contacto</th>
                <th className="text-right">Deuda</th>
                <th className="text-right">Límite crédito</th>
                <th className="col-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={5} className="cell-empty">
                    {labels.emptyMessage}
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium text-ink">{c.name}</td>
                  <td className="cell-muted">
                    {[c.phone, c.document].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td
                    className={`text-right tabular-nums font-semibold ${
                      c.balance > 0 ? "text-amber-700 dark:text-amber-400" : "text-ink"
                    }`}
                  >
                    {formatMoney(c.balance, currency)}
                  </td>
                  <td className="text-right tabular-nums cell-muted">
                    {c.credit_limit > 0 ? formatMoney(c.credit_limit, currency) : "Sin límite"}
                  </td>
                  <td>
                    <div className="flex justify-end gap-0.5">
                      <Button size="sm" variant="ghost" onClick={() => openPayments(c)}>
                        <Wallet size={14} /> Cobrar
                      </Button>
                      {showVehicles && (
                        <Button size="sm" variant="ghost" onClick={() => setVehiclesTarget(c)}>
                          <Car size={14} /> Vehículos
                        </Button>
                      )}
                      {canEdit && (
                        <>
                          <IconButton label="Editar" onClick={() => openEdit(c)}>
                            <Pencil size={16} />
                          </IconButton>
                          <IconButton label="Eliminar" variant="danger" onClick={() => handleDelete(c)}>
                            <Trash2 size={16} />
                          </IconButton>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      </PageContent>

      <Modal
        open={formOpen}
        title={editing ? labels.editTitle : labels.newTitle}
        onClose={() => setFormOpen(false)}
      >
        <div className="space-y-3">
          <Input
            label={labels.nameLabel}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={labels.namePlaceholder}
          />
          {phoneManual ? (
            <div className="space-y-1">
              <Input
                label={`${labels.phoneLabel} (completo)`}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Ej. +1 555 123 4567"
              />
              <button
                type="button"
                className="text-xs text-brand-600 hover:underline"
                onClick={() => {
                  setPhoneManual(false);
                  setForm({ ...form, phone: phoneToLocalDisplay(form.phone) });
                }}
              >
                Volver a formato Argentina (+549 automático)
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-ink">{labels.phoneLabel}</label>
              <div className="flex gap-2">
                <span className="flex shrink-0 items-center rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 text-sm font-medium text-ink-muted">
                  +549
                </span>
                <Input
                  className="flex-1"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder={labels.phonePlaceholder}
                />
              </div>
              <p className="text-xs text-ink-muted">
                El prefijo +549 se agrega al guardar. Para otro país, usá formato manual.
              </p>
              <button
                type="button"
                className="text-xs text-brand-600 hover:underline"
                onClick={() => setPhoneManual(true)}
              >
                Otro país o número completo
              </button>
            </div>
          )}
          <Input
            label={labels.documentLabel}
            value={form.document}
            onChange={(e) => setForm({ ...form, document: e.target.value })}
            placeholder={labels.documentPlaceholder}
          />
          <Input
            label={labels.emailLabel}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label={labels.creditLimitLabel}
            type="number"
            value={form.credit_limit}
            onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })}
          />
          <Input
            label={labels.notesLabel}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder={labels.notesPlaceholder}
          />

          {showVehicles && !editing && labels.vehicleSectionTitle && (
            <div className="rounded-xl border border-[var(--color-panel-border)] p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {labels.vehicleSectionTitle}
              </p>
              <Input
                label={labels.vehiclePlateLabel}
                value={newVehicle.plate}
                onChange={(e) =>
                  setNewVehicle({ ...newVehicle, plate: e.target.value.toUpperCase() })
                }
                placeholder={labels.vehiclePlatePlaceholder}
              />
              <FormGrid cols={2}>
                <Input
                  label="Marca"
                  value={newVehicle.brand}
                  onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value })}
                  placeholder={labels.vehicleBrandPlaceholder}
                />
                <Input
                  label="Modelo"
                  value={newVehicle.model}
                  onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                  placeholder={labels.vehicleModelPlaceholder}
                />
              </FormGrid>
            </div>
          )}

          {showVehicles && editing && (
            <p className="text-xs text-ink-muted">
              Para agregar o ver vehículos usá el botón <strong>Vehículos</strong> en el listado.
            </p>
          )}
        </div>
        <FormActions>
          <Button variant="secondary" onClick={() => setFormOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void saveCustomer()}>Guardar</Button>
        </FormActions>
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
            <FormGrid cols={2}>
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
            </FormGrid>
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
            <FormActions>
              <Button variant="secondary" onClick={() => setPayTarget(null)}>
                Cancelar
              </Button>
              <Button onClick={submitPayment}>Registrar cobro</Button>
            </FormActions>
          </>
        )}
      </Modal>

      <CustomerVehiclesModal
        customer={vehiclesTarget}
        open={vehiclesTarget !== null}
        onClose={() => setVehiclesTarget(null)}
      />
    </div>
  );
}
