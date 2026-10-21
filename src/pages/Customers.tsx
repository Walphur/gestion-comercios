import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Search, Wallet, Car, Users, History, RefreshCw, ClipboardList } from "lucide-react";
import { PageHeader, Button, Input, Modal, Select, PageContent, DataTableShell, IconButton, FormGrid, FormActions, EmptyState } from "../components/ui";
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
import { createVehicle, listVehicles } from "../db/vehicles";
import type { Customer, CustomerInput, CustomerPayment, Vehicle } from "../types";
import { formatVehicleLabel } from "../lib/vehicleFormat";
import VehicleFormModal from "../components/VehicleFormModal";
import { formatMoney } from "../lib/format";
import { confirmAction } from "../lib/confirm";
import { rubroUsesVehicles } from "../config/workshop";
import { getCustomerLabels } from "../config/customerLabels";
import CustomerVehiclesModal from "../components/CustomerVehiclesModal";
import CustomerHistoryModal from "../components/CustomerHistoryModal";
import DentalChartModal from "../components/DentalChartModal";
import {
  isArgentinaStoredPhone,
  phoneToLocalDisplay,
} from "../lib/phoneFormat";

const EMPTY: CustomerInput = {
  name: "",
  phone: "",
  document: "",
  email: "",
  address: "",
  birth_date: "",
  insurance: "",
  gender: "",
  affiliate_number: "",
  credit_limit: 0,
  notes: "",
  initial_debt: 0,
};

function ageLabel(birth: string | null | undefined): string {
  if (!birth) return "";
  const born = new Date(`${birth}T12:00:00`);
  if (Number.isNaN(born.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) age -= 1;
  if (age < 0 || age > 120) return "";
  return `${age} años`;
}

const EMPTY_VEHICLE = { plate: "", brand: "", model: "", kind: "" };

export default function Customers() {
  const { currency, rubro } = useAppConfig();
  const labels = getCustomerLabels(rubro);
  const showVehicles = rubroUsesVehicles(rubro);
  const clinic = rubro === "clinica";
  const { user, can } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerInput>(EMPTY);
  const [newVehicle, setNewVehicle] = useState(EMPTY_VEHICLE);
  const [editVehicles, setEditVehicles] = useState<Vehicle[]>([]);
  const [vehicleForm, setVehicleForm] = useState<{ vehicle: Vehicle | null } | null>(null);
  const [payTarget, setPayTarget] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("efectivo");
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [vehiclesTarget, setVehiclesTarget] = useState<Customer | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Customer | null>(null);
  const [chartTarget, setChartTarget] = useState<Customer | null>(null);
  const [phoneManual, setPhoneManual] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  async function handleRefreshList() {
    setRefreshing(true);
    try {
      await reload();
    } catch (e) {
      showUserError(e);
    } finally {
      setRefreshing(false);
    }
  }

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
      address: c.address ?? "",
      birth_date: c.birth_date ?? "",
      insurance: c.insurance ?? "",
      gender: c.gender ?? "",
      affiliate_number: c.affiliate_number ?? "",
      credit_limit: c.credit_limit,
      notes: c.notes ?? "",
    });
    setNewVehicle(EMPTY_VEHICLE);
    setEditVehicles([]);
    setFormOpen(true);
    if (showVehicles) void reloadEditVehicles(c.id);
  }

  async function reloadEditVehicles(customerId: number) {
    try {
      setEditVehicles(await listVehicles(customerId));
    } catch (e) {
      showUserError(e);
    }
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
            kind: newVehicle.kind || null,
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
        title={labels.listTitle}
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
        <div className="mb-4 flex min-w-0 max-w-md items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input
              className="pl-9"
              placeholder={labels.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <IconButton
            label="Actualizar listado"
            onClick={() => void handleRefreshList()}
            disabled={refreshing}
            className="shrink-0"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : undefined} />
          </IconButton>
        </div>

        {clinic ? (
          <ClinicPatientList
            customers={customers}
            canEdit={canEdit}
            emptyMessage={labels.emptyMessage}
            newTitle={labels.newTitle}
            onNew={openNew}
            onHistory={setHistoryTarget}
            onChart={setChartTarget}
            onEdit={openEdit}
            onDelete={(c) => void handleDelete(c)}
          />
        ) : (
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
                    <EmptyState
                      compact
                      icon={Users}
                      title="Sin clientes todavía"
                      description={labels.emptyMessage}
                      action={canEdit ? (
                          <Button size="sm" onClick={openNew}>
                            <Plus size={16} /> {labels.newTitle}
                          </Button>
                        ) : undefined}
                    />
                  </td>
                </tr>
              )}
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium text-ink">
                    <button
                      type="button"
                      onClick={() => setHistoryTarget(c)}
                      className="text-left font-medium text-ink hover:text-brand-600 hover:underline"
                      title="Ver historial"
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="cell-muted">
                    {[c.phone, c.document, c.insurance].filter(Boolean).join(" · ") || "—"}
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
                      <Button size="sm" variant="ghost" onClick={() => setHistoryTarget(c)}>
                        <History size={14} /> Historial
                      </Button>
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
        )}
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
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Ej. cliente@mail.com"
          />
          {labels.addressLabel && (
            <Input
              label={labels.addressLabel}
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Calle, número, localidad"
            />
          )}
          {labels.birthLabel && (
            <Input
              label={labels.birthLabel}
              type="date"
              value={form.birth_date ?? ""}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
              hint={ageLabel(form.birth_date) || undefined}
            />
          )}
          {labels.insuranceLabel && (
            <Input
              label={labels.insuranceLabel}
              value={form.insurance ?? ""}
              onChange={(e) => setForm({ ...form, insurance: e.target.value })}
              placeholder="Ej. OSDE, PAMI, Swiss Medical"
            />
          )}
          {labels.affiliateLabel && (
            <Input
              label={labels.affiliateLabel}
              value={form.affiliate_number ?? ""}
              onChange={(e) => setForm({ ...form, affiliate_number: e.target.value })}
              placeholder="Opcional"
            />
          )}
          {labels.genderLabel && (
            <Select
              label={labels.genderLabel}
              value={form.gender ?? ""}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option value="">Prefiero no responder</option>
              <option value="femenino">Femenino</option>
              <option value="masculino">Masculino</option>
              <option value="otro">Otro</option>
            </Select>
          )}
          {!clinic && (
          <Input
            label={labels.creditLimitLabel}
            type="number"
            value={form.credit_limit}
            onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })}
          />
          )}
          {!clinic && !editing ? (
            <Input
              label={labels.initialDebtLabel}
              type="number"
              min={0}
              step="0.01"
              value={form.initial_debt ?? 0}
              onChange={(e) =>
                setForm({ ...form, initial_debt: Math.max(0, Number(e.target.value) || 0) })
              }
              hint={labels.initialDebtHint}
            />
          ) : null}
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
              <Select
                label="Tipo"
                value={newVehicle.kind}
                onChange={(e) => setNewVehicle({ ...newVehicle, kind: e.target.value })}
              >
                <option value="">Sin especificar</option>
                <option value="auto">Auto</option>
                <option value="camioneta">Camioneta / chata</option>
                <option value="suv">SUV</option>
                <option value="utilitario">Utilitario</option>
                <option value="moto">Moto</option>
                <option value="otro">Otro</option>
              </Select>
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
            <div className="rounded-xl border border-[var(--color-panel-border)] p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {labels.vehicleSectionTitle || "Vehículos"}
              </p>
              {editVehicles.length === 0 ? (
                <p className="text-xs text-ink-muted">Todavía no tiene vehículos cargados.</p>
              ) : (
                editVehicles.map((v) => (
                  <div
                    key={v.id}
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--color-panel-border)] px-3 py-2"
                  >
                    <Car size={14} className="shrink-0 text-brand-600" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {formatVehicleLabel(v)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setVehicleForm({ vehicle: v })}
                    >
                      <Pencil size={14} /> Editar
                    </Button>
                  </div>
                ))
              )}
              <Button size="sm" variant="secondary" onClick={() => setVehicleForm({ vehicle: null })}>
                <Plus size={14} /> Agregar vehículo
              </Button>
            </div>
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

      {editing && (
        <VehicleFormModal
          open={vehicleForm !== null}
          customerId={editing.id}
          vehicle={vehicleForm?.vehicle ?? null}
          onClose={() => setVehicleForm(null)}
          onSaved={() => void reloadEditVehicles(editing.id)}
        />
      )}

      <CustomerVehiclesModal
        customer={vehiclesTarget}
        open={vehiclesTarget !== null}
        onClose={() => setVehiclesTarget(null)}
      />

      <CustomerHistoryModal
        customer={historyTarget}
        open={historyTarget !== null}
        onClose={() => setHistoryTarget(null)}
      />

      <DentalChartModal
        customer={chartTarget}
        open={chartTarget !== null}
        onClose={() => setChartTarget(null)}
      />
    </div>
  );
}

function phoneLabel(phone: string | null): string {
  const shown = phoneToLocalDisplay(phone);
  return shown.trim() || "—";
}

function coverageLabel(insurance: string | null, affiliate: string | null): string {
  const plan = insurance?.trim() || "";
  const member = affiliate?.trim() || "";
  if (plan && member) return `${plan} · ${member}`;
  return plan || member || "Sin obra social";
}

function ClinicPatientList({
  customers,
  canEdit,
  emptyMessage,
  newTitle,
  onNew,
  onHistory,
  onChart,
  onEdit,
  onDelete,
}: {
  customers: Customer[];
  canEdit: boolean;
  emptyMessage: string;
  newTitle: string;
  onNew: () => void;
  onHistory: (customer: Customer) => void;
  onChart: (customer: Customer) => void;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
}) {
  const columns =
    "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,1.1fr)_minmax(0,1.15fr)]";

  if (customers.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sin pacientes todavía"
        description={emptyMessage}
        action={
          canEdit ? (
            <Button size="sm" onClick={onNew}>
              <Plus size={16} /> {newTitle}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--color-panel-border)]">
      <div
        className={`hidden gap-2 border-b border-[var(--color-panel-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted sm:grid ${columns}`}
      >
        <span>Paciente</span>
        <span>Teléfono</span>
        <span>DNI</span>
        <span>Obra social</span>
        <span className="text-right">Acciones</span>
      </div>
      <ul className="divide-y divide-[var(--color-panel-border)]">
        {customers.map((c) => (
          <li
            key={c.id}
            className={`grid min-w-0 gap-1 px-3 py-3 text-sm sm:items-center sm:gap-2 ${columns}`}
          >
            <button
              type="button"
              onClick={() => onHistory(c)}
              className="min-w-0 truncate text-left font-medium text-ink hover:text-brand-600 hover:underline"
              title="Ver historial"
            >
              {c.name}
            </button>
            <p className="min-w-0 truncate text-ink-muted">{phoneLabel(c.phone)}</p>
            <p className="min-w-0 truncate text-ink-muted">{c.document?.trim() || "—"}</p>
            <p className="min-w-0 truncate text-ink" title={coverageLabel(c.insurance, c.affiliate_number)}>
              {coverageLabel(c.insurance, c.affiliate_number)}
            </p>
            <div className="flex min-w-0 flex-wrap justify-end gap-0.5">
              <Button size="sm" variant="ghost" onClick={() => onHistory(c)}>
                <History size={14} /> Historial
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onChart(c)}>
                <ClipboardList size={14} /> Ficha
              </Button>
              {canEdit && (
                <>
                  <IconButton label="Editar" onClick={() => onEdit(c)}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label="Eliminar" variant="danger" onClick={() => onDelete(c)}>
                    <Trash2 size={16} />
                  </IconButton>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
