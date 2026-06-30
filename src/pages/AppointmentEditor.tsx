import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, Save, Trash2, Wrench, Calendar } from "lucide-react";
import { PageHeader, Card, Button, Input, Select, PageContent, CardSectionTitle, FormActions } from "../components/ui";
import { showUserError, showUserSuccess } from "../lib/notice";
import { useAuth } from "../context/AuthContext";
import { listCustomers } from "../db/customers";
import {
  addMinutesToDateTime,
  buildDateTime,
  createAppointment,
  deleteAppointment,
  getAppointment,
  setAppointmentStatus,
  updateAppointment,
} from "../db/appointments";
import { logAuditAction } from "../lib/tauri";
import type { Appointment, AppointmentStatus, Customer } from "../types";
import { formatDateShort, formatTime, todayYmd } from "../lib/format";
import { confirmAction, confirmDelete } from "../lib/confirm";
import { useAppConfig } from "../context/AppConfig";
import { getAppointmentLabels } from "../config/appointmentLabels";
import { rubroUsesVehicles, rubroUsesWorkshopFlow } from "../config/workshop";
import VehiclePicker from "../components/VehiclePicker";
import WorkshopLinks from "../components/WorkshopLinks";
import {
  createQuoteFromAppointment,
  createServiceOrderFromAppointment,
  listOrdersForAppointment,
  listQuotesForAppointment,
} from "../db/workshopFlow";
import { formatVehicleLabel } from "../lib/vehicleFormat";
import { listVehicles } from "../db/vehicles";
import AppointmentNotifyPanel, { tryNotifyWhatsApp } from "../components/AppointmentNotifyPanel";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Programado",
  confirmed: "Confirmado",
  in_progress: "En curso",
  completed: "Finalizado",
  cancelled: "Cancelado",
  no_show: "No asistió",
};

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export default function AppointmentEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === "nuevo";
  const appointmentId = isNew ? null : Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { rubro, isProModuleActive, businessName } = useAppConfig();
  const labels = getAppointmentLabels(rubro);
  const usesVehicles = rubroUsesVehicles(rubro);
  const workshopFlow = rubroUsesWorkshopFlow(rubro);

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [subjectNotes, setSubjectNotes] = useState("");
  const [date, setDate] = useState(searchParams.get("fecha") ?? todayYmd());
  const [startTime, setStartTime] = useState("09:00");
  const [durationMin, setDurationMin] = useState(60);
  const [notes, setNotes] = useState("");
  const [vehicleId, setVehicleId] = useState<number | "">("");
  const [linkedQuotes, setLinkedQuotes] = useState<{ id: number; quote_number: string }[]>([]);
  const [linkedOrders, setLinkedOrders] = useState<
    { id: number; order_number: string; status: string }[]
  >([]);
  const [saving, setSaving] = useState(false);

  const locked =
    appointment?.status === "completed" ||
    appointment?.status === "cancelled" ||
    appointment?.status === "no_show";

  const load = useCallback(async () => {
    setCustomers(await listCustomers());
    if (appointmentId && !Number.isNaN(appointmentId)) {
      const a = await getAppointment(appointmentId);
      if (!a) {
        navigate("/turnos", { replace: true });
        return;
      }
      setAppointment(a);
      setCustomerId(a.customer_id ?? "");
      setTitle(a.title);
      setResourceName(a.resource_name ?? "");
      setSubjectNotes(a.subject_notes ?? "");
      setDate(a.starts_at.slice(0, 10));
      setStartTime(formatTime(a.starts_at));
      const start = new Date(a.starts_at.replace(" ", "T"));
      const end = new Date(a.ends_at.replace(" ", "T"));
      const mins = Math.round((end.getTime() - start.getTime()) / 60000);
      setDurationMin(DURATIONS.includes(mins) ? mins : mins > 0 ? mins : 60);
      setNotes(a.notes ?? "");
      setVehicleId(a.vehicle_id ?? "");
      const [quotes, orders] = await Promise.all([
        listQuotesForAppointment(appointmentId),
        listOrdersForAppointment(appointmentId),
      ]);
      setLinkedQuotes(quotes);
      setLinkedOrders(orders);
    }
  }, [appointmentId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function buildPayload() {
    const starts_at = buildDateTime(date, startTime);
    const ends_at = addMinutesToDateTime(starts_at, durationMin);
    let resolvedSubject = subjectNotes;
    if (usesVehicles && vehicleId !== "") {
      const vehicles = await listVehicles(customerId === "" ? null : customerId);
      const v = vehicles.find((x) => x.id === vehicleId);
      if (v) resolvedSubject = formatVehicleLabel(v);
    }
    return {
      customer_id: customerId === "" ? null : customerId,
      vehicle_id: vehicleId === "" ? null : vehicleId,
      title,
      resource_name: resourceName,
      subject_notes: resolvedSubject || null,
      starts_at,
      ends_at,
      notes,
      user_id: user?.id ?? null,
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = await buildPayload();
      if (isNew) {
        const newId = await createAppointment(payload);
        if (user) void logAuditAction(user.id, "appointment_created", "appointment", newId);
        navigate(`/turnos/${newId}`, { replace: true });
      } else if (appointmentId) {
        await updateAppointment(appointmentId, payload);
        if (user) void logAuditAction(user.id, "appointment_updated", "appointment", appointmentId);
        await load();
        showUserSuccess("Turno guardado.");
      }
    } catch (e) {
      showUserError(e);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: AppointmentStatus) {
    if (!appointmentId) return;
    try {
      await setAppointmentStatus(appointmentId, status);
      if (user) void logAuditAction(user.id, `appointment_${status}`, "appointment", appointmentId);
      await load();
      const updated = await getAppointment(appointmentId);
      if (
        updated?.customer_phone &&
        (status === "confirmed" || status === "completed" || status === "cancelled")
      ) {
        const label =
          status === "confirmed"
            ? "confirmación"
            : status === "completed"
              ? "aviso de listo"
              : "cancelación";
        if (
          await confirmAction({
            title: "Avisar al cliente",
            message: `¿Abrir WhatsApp para enviar ${label} del turno?`,
            detail: "Se abrirá con el mensaje armado; solo tenés que pulsar Enviar en WhatsApp.",
            confirmLabel: "Abrir WhatsApp",
            cancelLabel: "Ahora no",
          })
        ) {
          const orders = await listOrdersForAppointment(appointmentId);
          await tryNotifyWhatsApp(updated, orders, businessName, rubro);
        }
      }
    } catch (e) {
      showUserError(e);
    }
  }

  async function handleDelete() {
    if (!appointmentId || !appointment) return;
    if (!(await confirmDelete(`${appointment.title} ${formatDateShort(appointment.starts_at)}`))) {
      return;
    }
    try {
      await deleteAppointment(appointmentId);
      navigate("/turnos");
    } catch (e) {
      showUserError(e);
    }
  }

  const pageTitle = isNew
    ? "Nuevo turno"
    : appointment
      ? `${appointment.title} · ${STATUS_LABEL[appointment.status]}`
      : "Turno";

  return (
    <div>
      <PageHeader
        title={pageTitle}
        subtitle={
          isNew
            ? labels.editorSubtitle
            : appointment
              ? `${formatDateShort(appointment.starts_at)} ${formatTime(appointment.starts_at)} – ${formatTime(appointment.ends_at)}`
              : undefined
        }
        actions={
          <Link
            to="/turnos"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            <ArrowLeft size={16} /> Volver a agenda
          </Link>
        }
      />

      <PageContent wide>
        <Card variant="form" className="space-y-4">
          <CardSectionTitle icon={Calendar} title="Datos del turno" description="Cliente, fecha y duración" />
          <Input
            label={labels.titleLabel}
            value={title}
            disabled={locked}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={labels.titlePlaceholder}
          />
          <Select
            label="Cliente (opcional)"
            value={customerId}
            disabled={locked}
            onChange={(e) => {
              setCustomerId(e.target.value === "" ? "" : Number(e.target.value));
              setVehicleId("");
            }}
          >
            <option value="">— Sin cliente en agenda —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={labels.resourceLabel}
              value={resourceName}
              disabled={locked}
              onChange={(e) => setResourceName(e.target.value)}
              placeholder={labels.resourcePlaceholder}
            />
            {usesVehicles ? (
              <VehiclePicker
                customerId={customerId}
                vehicleId={vehicleId}
                disabled={locked}
                onVehicleChange={setVehicleId}
                onCustomerRequired={() =>
                  showUserError("Elegí un cliente para asociar el vehículo.", "Cliente requerido")
                }
              />
            ) : (
              <Input
                label={labels.subjectLabel}
                value={subjectNotes}
                disabled={locked}
                onChange={(e) => setSubjectNotes(e.target.value)}
                placeholder={labels.subjectPlaceholder}
              />
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Fecha"
              type="date"
              value={date}
              disabled={locked}
              onChange={(e) => setDate(e.target.value)}
            />
            <Input
              label="Hora inicio"
              type="time"
              value={startTime}
              disabled={locked}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <Select
              label="Duración"
              value={durationMin}
              disabled={locked}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            >
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="Notas internas"
            value={notes}
            disabled={locked}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={labels.notesPlaceholder}
          />
        </Card>

        {!isNew && appointment && (
          <AppointmentNotifyPanel appointment={appointment} linkedOrders={linkedOrders} />
        )}

        {!isNew && workshopFlow && (linkedQuotes.length > 0 || linkedOrders.length > 0) && (
          <Card className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Vinculado a este turno
            </p>
            <WorkshopLinks
              items={[
                ...linkedQuotes.map((q) => ({
                  label: `Presupuesto ${q.quote_number}`,
                  to: `/presupuestos/${q.id}`,
                })),
                ...linkedOrders.map((o) => ({
                  label: `OT ${o.order_number}`,
                  to: `/ordenes/${o.id}`,
                })),
              ]}
            />
          </Card>
        )}

        <FormActions sticky>
          {!isNew && workshopFlow && isProModuleActive("quotes") && linkedQuotes.length === 0 && (
            <Button
              variant="secondary"
              onClick={async () => {
                if (!appointmentId) return;
                try {
                  const quoteId = await createQuoteFromAppointment(appointmentId, user?.id ?? null);
                  navigate(`/presupuestos/${quoteId}`);
                } catch (e) {
                  showUserError(e);
                }
              }}
            >
              <ClipboardList size={16} /> Crear presupuesto
            </Button>
          )}
          {!isNew &&
            workshopFlow &&
            isProModuleActive("service_orders") &&
            linkedOrders.length === 0 && (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!appointmentId) return;
                  try {
                    const orderId = await createServiceOrderFromAppointment(
                      appointmentId,
                      user?.id ?? null,
                    );
                    navigate(`/ordenes/${orderId}`);
                  } catch (e) {
                    showUserError(e);
                  }
                }}
              >
                <Wrench size={16} /> Crear orden de servicio
              </Button>
            )}
          {!isNew && appointment?.status === "scheduled" && (
            <Button variant="secondary" onClick={() => void changeStatus("confirmed")}>
              Confirmar
            </Button>
          )}
          {!isNew &&
            (appointment?.status === "scheduled" || appointment?.status === "confirmed") && (
              <Button variant="secondary" onClick={() => void changeStatus("in_progress")}>
                Marcar en curso
              </Button>
            )}
          {!isNew && appointment?.status === "in_progress" && (
            <Button onClick={() => void changeStatus("completed")}>
              Finalizar
            </Button>
          )}
          {!isNew &&
            appointment &&
            !["completed", "cancelled", "no_show"].includes(appointment.status) && (
              <>
                <Button variant="secondary" onClick={() => void changeStatus("no_show")}>
                  No asistió
                </Button>
                <Button variant="secondary" onClick={() => void changeStatus("cancelled")}>
                  Cancelar turno
                </Button>
              </>
            )}
          {!isNew && appointment && !locked && (
            <Button variant="danger" onClick={() => void handleDelete()}>
              <Trash2 size={16} /> Eliminar
            </Button>
          )}
          <Link
            to="/turnos"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
          >
            Cancelar
          </Link>
          {!locked && (
            <Button onClick={() => void handleSave()} disabled={saving || !title.trim()} loading={saving}>
              <Save size={16} /> Guardar
            </Button>
          )}
        </FormActions>
      </PageContent>
    </div>
  );
}
