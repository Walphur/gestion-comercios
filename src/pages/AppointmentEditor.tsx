import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, Save, Trash2, Wrench, Calendar, ShoppingCart } from "lucide-react";
import { PageHeader, Card, Button, Input, Select, PageContent, CardSectionTitle, FormActions } from "../components/ui";
import { showUserError, showUserSuccess } from "../lib/notice";
import { useAuth } from "../context/AuthContext";
import {
  addMinutesToDateTime,
  buildDateTime,
  createAppointment,
  deleteAppointment,
  getAppointment,
  listAppointmentsForDay,
  setAppointmentStatus,
  updateAppointment,
} from "../db/appointments";
import { logAuditAction } from "../lib/tauri";
import type { Appointment, AppointmentStatus } from "../types";
import { formatDateShort, formatTime, todayYmd } from "../lib/format";
import { confirmAction, confirmDelete } from "../lib/confirm";
import { useAppConfig } from "../context/AppConfig";
import { getAppointmentLabels } from "../config/appointmentLabels";
import { rubroUsesVehicles, rubroUsesWorkshopFlow, rubroUsesAppointmentResources } from "../config/workshop";
import VehiclePicker from "../components/VehiclePicker";
import CustomerPicker from "../components/CustomerPicker";
import ResourcePicker from "../components/ResourcePicker";
import WorkshopLinks from "../components/WorkshopLinks";
import QuickWriteChips, {
  APPOINTMENT_TITLE_CHIPS,
  APPOINTMENT_TITLE_CHIPS_TALLER,
} from "../components/QuickWriteChips";
import {
  createQuoteFromAppointment,
  createServiceOrderFromAppointment,
  listOrdersForAppointment,
  listQuotesForAppointment,
} from "../db/workshopFlow";
import AppointmentNotifyPanel, { tryNotifyWhatsApp } from "../components/AppointmentNotifyPanel";
import { markRescheduleAlertsSeenForAppointment } from "../db/appointmentNotifications";
import { listProducts } from "../db/products";
import { listServiceResourceIds } from "../db/serviceBooking";
import { findSaleIdForAppointment } from "../db/sales";

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
  const { rubro, rubroDef, features, isProModuleActive, businessName } = useAppConfig();
  const canCharge = Boolean(rubroDef.posProfessional) && features.pos;
  const [chargedSaleId, setChargedSaleId] = useState<number | null>(null);
  const labels = getAppointmentLabels(rubro);
  const usesVehicles = rubroUsesVehicles(rubro);
  const workshopFlow = rubroUsesWorkshopFlow(rubro);
  const usesResources = rubroUsesAppointmentResources(rubro);

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [resourceId, setResourceId] = useState<number | "">("");
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
  const usesOwnServices = rubro === "estetica" || rubro === "clinica" || rubro === "taller";
  const [services, setServices] = useState<
    { name: string; duration_min: number | null; resource_ids: number[] }[] | null
  >(null);
  const [serviceQuery, setServiceQuery] = useState("");
  const [dayBusy, setDayBusy] = useState<{ id: number; starts_at: string; ends_at: string; resource_id: number | null }[]>([]);
  const clinic = rubro === "clinica";

  const locked =
    appointment?.status === "completed" ||
    appointment?.status === "cancelled" ||
    appointment?.status === "no_show";

  const load = useCallback(async () => {
    if (appointmentId && !Number.isNaN(appointmentId)) {
      const a = await getAppointment(appointmentId);
      if (!a) {
        navigate("/turnos", { replace: true });
        return;
      }
      setAppointment(a);
      void markRescheduleAlertsSeenForAppointment(appointmentId);
      setCustomerId(a.customer_id ?? "");
      setTitle(a.title);
      setResourceId(a.resource_id ?? "");
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
      const [quotes, orders, saleId] = await Promise.all([
        listQuotesForAppointment(appointmentId),
        listOrdersForAppointment(appointmentId),
        findSaleIdForAppointment(appointmentId),
      ]);
      setLinkedQuotes(quotes);
      setLinkedOrders(orders);
      setChargedSaleId(saleId);
    }
  }, [appointmentId, navigate]);

  useEffect(() => {
    if (!usesOwnServices) return;
    let cancel = false;
    void listProducts({ catalogKind: "service", limit: 200 })
      .then(async (rows) => {
        const next = await Promise.all(
          rows
            .filter((row) => row.name.trim().length > 0)
            .map(async (row) => ({
              name: row.name,
              duration_min: row.duration_min && row.duration_min > 0 ? row.duration_min : null,
              resource_ids: await listServiceResourceIds(row.id),
            })),
        );
        if (!cancel) setServices(next);
      })
      .catch(() => {
        if (!cancel) setServices([]);
      });
    return () => {
      cancel = true;
    };
  }, [usesOwnServices]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedService = services?.find((service) => service.name === title) ?? null;

  useEffect(() => {
    if (!services || resourceId === "") return;
    if (!selectedService) return;
    const allowed = selectedService.resource_ids;
    if (allowed.length === 0) {
      if (clinic) setResourceId("");
      return;
    }
    if (!allowed.includes(Number(resourceId))) setResourceId("");
  }, [services, title, clinic, resourceId, selectedService]);

  useEffect(() => {
    let cancel = false;
    void listAppointmentsForDay(date)
      .then((rows) => {
        if (!cancel) {
          setDayBusy(
            rows
              .filter((row) => ["scheduled", "confirmed", "in_progress", "completed"].includes(row.status))
              .filter((row) => row.id !== appointmentId)
              .map((row) => ({
                id: row.id,
                starts_at: row.starts_at,
                ends_at: row.ends_at,
                resource_id: row.resource_id,
              })),
          );
        }
      })
      .catch(() => {
        if (!cancel) setDayBusy([]);
      });
    return () => {
      cancel = true;
    };
  }, [date, appointmentId]);

  async function buildPayload() {
    const starts_at = buildDateTime(date, startTime);
    const ends_at = addMinutesToDateTime(starts_at, durationMin);
    return {
      customer_id: customerId === "" ? null : customerId,
      vehicle_id: vehicleId === "" ? null : vehicleId,
      title,
      resource_id: resourceId === "" ? null : resourceId,
      resource_name: resourceId === "" ? resourceName || null : null,
      subject_notes: subjectNotes.trim() || null,
      starts_at,
      ends_at,
      notes,
      user_id: user?.id ?? null,
    };
  }

  async function handleSave() {
    if (clinic && selectedService && selectedService.resource_ids.length === 0) {
      showUserError("Este servicio no tiene profesionales habilitados. Asignalos en Servicios.", "Falta un profesional");
      return;
    }
    if (clinic && selectedService && selectedService.resource_ids.length > 0 && resourceId === "") {
      showUserError("Elegí un profesional habilitado para este servicio.", "Falta un profesional");
      return;
    }
    if (
      selectedService &&
      selectedService.resource_ids.length > 0 &&
      resourceId !== "" &&
      !selectedService.resource_ids.includes(Number(resourceId))
    ) {
      showUserError("Ese profesional no está habilitado para este servicio.", "Profesional");
      return;
    }
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
          <CardSectionTitle
            icon={Calendar}
            title="Datos del turno"
            description={clinic ? "Servicio, profesional, paciente y horario" : "Servicio, horario y cliente"}
          />
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">1. Servicio y profesional</p>
          <div className="space-y-2 min-w-0">
            <Input
              label={`${labels.titleLabel} *`}
              value={title}
              disabled={locked}
              onChange={(e) => {
                setTitle(e.target.value);
                setServiceQuery(e.target.value);
              }}
              placeholder={labels.titlePlaceholder}
            />
            {!locked && usesOwnServices && services && services.length === 0 && (
              <p className="text-xs text-ink-muted">
                Todavía no hay servicios cargados. Creálos en{" "}
                <Link to="/productos?vista=servicios" className="font-semibold text-brand-600 hover:underline">
                  Servicios
                </Link>
                .
              </p>
            )}
            {!locked && usesOwnServices && services && services.length >= 6 && (
              <Input
                label="Buscar servicio"
                value={serviceQuery}
                onChange={(e) => setServiceQuery(e.target.value)}
                placeholder="Nombre del servicio"
              />
            )}
            {!locked && !usesOwnServices && (
              <QuickWriteChips
                chips={usesVehicles ? APPOINTMENT_TITLE_CHIPS_TALLER : APPOINTMENT_TITLE_CHIPS}
                value={title}
                onChange={setTitle}
              />
            )}
            {!locked && usesOwnServices && services && services.length > 0 && (
              <QuickWriteChips
                chips={services
                  .filter((service) =>
                    serviceQuery.trim()
                      ? service.name.toLowerCase().includes(serviceQuery.trim().toLowerCase())
                      : true,
                  )
                  .map((service) => ({
                    label: service.duration_min ? `${service.name} · ${service.duration_min} min` : service.name,
                    value: service.name,
                  }))}
                value={title}
                onChange={(name) => {
                  setTitle(name);
                  setServiceQuery("");
                  const match = services.find((service) => service.name === name);
                  if (match?.duration_min) setDurationMin(match.duration_min);
                  if (!match) return;
                  if (match.resource_ids.length === 0) {
                    if (clinic) setResourceId("");
                    return;
                  }
                  if (resourceId !== "" && !match.resource_ids.includes(Number(resourceId))) {
                    setResourceId("");
                  }
                }}
              />
            )}
          </div>
          {usesResources ? (
            <ResourcePicker
              value={resourceId}
              disabled={locked || (clinic && !title.trim())}
              label={clinic ? "Profesional habilitado *" : labels.resourceLabel}
              allowedIds={selectedService?.resource_ids}
              restricted={clinic && Boolean(selectedService)}
              optional={!clinic}
              onLabel={setResourceName}
              onChange={setResourceId}
            />
          ) : (
            <Input
              label={labels.resourceLabel}
              value={resourceName}
              disabled={locked}
              onChange={(e) => setResourceName(e.target.value)}
              placeholder={labels.resourcePlaceholder}
            />
          )}
          {clinic && !title.trim() && (
            <p className="text-xs text-ink-muted">Primero elegí el servicio. Después vas a ver solo quién lo atiende.</p>
          )}

          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">2. Fecha y horario</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Fecha *"
              type="date"
              value={date}
              disabled={locked}
              onChange={(e) => setDate(e.target.value)}
            />
            <Input
              label="Hora inicio *"
              type="time"
              value={startTime}
              disabled={locked}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <Select
              label="Duración *"
              value={durationMin}
              disabled={locked}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            >
              {[...new Set([...DURATIONS, durationMin, selectedService?.duration_min ?? 0])]
                .filter((mins) => mins > 0)
                .sort((a, b) => a - b)
                .map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </div>
          {selectedService?.duration_min ? (
            <p className="text-xs text-ink-muted">
              Este servicio dura {selectedService.duration_min} min. El horario se calcula con esa duración.
            </p>
          ) : null}
          {resourceId !== "" && dayBusy.some((row) => row.resource_id === resourceId) && (
            <p className="text-xs text-ink-muted">
              Ese día este profesional ya tiene:{" "}
              {dayBusy
                .filter((row) => row.resource_id === resourceId)
                .map((row) => `${formatTime(row.starts_at)}–${formatTime(row.ends_at)}`)
                .join(", ")}
              . Esos horarios no se pueden volver a usar.
            </p>
          )}

          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {clinic ? "3. Paciente" : "3. Cliente"}
          </p>
          <CustomerPicker
            label={clinic ? "Paciente" : "Cliente (opcional)"}
            value={customerId}
            disabled={locked}
            placeholder={clinic ? "Buscar por DNI, nombre o teléfono" : undefined}
            emptyOptionLabel={clinic ? "— Sin paciente —" : "— Sin cliente en agenda —"}
            onChange={(id) => {
              setCustomerId(id);
              setVehicleId("");
            }}
          />
          {clinic && (
            <p className="text-xs text-ink-muted">
              Si ya está cargado, elegilo. Si no, crealo desde acá. El DNI que ya existe no abre otra ficha.
            </p>
          )}

          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">4. Información adicional</p>
          {usesVehicles ? (
            <VehiclePicker
              customerId={customerId}
              vehicleId={vehicleId}
              disabled={locked}
              onVehicleChange={setVehicleId}
            />
          ) : null}
          <Input
            label={usesVehicles ? labels.vehicleDetailsLabel : labels.subjectLabel}
            value={subjectNotes}
            disabled={locked}
            onChange={(e) => setSubjectNotes(e.target.value)}
            placeholder={usesVehicles ? labels.vehicleDetailsPlaceholder : labels.subjectPlaceholder}
          />
          <Input
            label="Observaciones"
            value={notes}
            disabled={locked}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={labels.notesPlaceholder}
          />

          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">5. Resumen</p>
          <div className="grid min-w-0 gap-2 rounded-xl border border-[var(--color-panel-border)] p-3 text-sm sm:grid-cols-2">
            <p className="min-w-0 truncate"><span className="text-ink-muted">Servicio. </span>{title.trim() || "Sin elegir"}</p>
            <p className="min-w-0 truncate"><span className="text-ink-muted">Profesional. </span>{resourceName.trim() || "Sin elegir"}</p>
            <p className="min-w-0 truncate"><span className="text-ink-muted">{clinic ? "Paciente. " : "Cliente. "}</span>{customerId === "" ? "Sin elegir" : appointment?.customer_id === customerId && appointment.customer_name ? appointment.customer_name : "Seleccionado"}</p>
            <p className="min-w-0 truncate"><span className="text-ink-muted">Horario. </span>{date} {startTime} · {durationMin} min</p>
            <p className="min-w-0 truncate sm:col-span-2"><span className="text-ink-muted">Motivo. </span>{subjectNotes.trim() || "Sin observaciones"}</p>
            {!isNew && appointment && (
              <p className="min-w-0 truncate"><span className="text-ink-muted">Estado. </span>{STATUS_LABEL[appointment.status]}</p>
            )}
          </div>
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
          {!isNew &&
            canCharge &&
            appointment &&
            chargedSaleId == null &&
            !["cancelled", "no_show"].includes(appointment.status) && (
              <Button
                onClick={() =>
                  navigate("/pos", { state: { chargeAppointmentId: appointment.id } })
                }
              >
                <ShoppingCart size={16} /> Cobrar
              </Button>
            )}
          {!isNew && canCharge && chargedSaleId != null && (
            <span className="self-center text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Turno cobrado
            </span>
          )}
          {!isNew && appointment?.status === "scheduled" && (
            <Button variant="secondary" onClick={() => changeStatus("confirmed")}>
              Confirmar
            </Button>
          )}
          {!isNew &&
            (appointment?.status === "scheduled" || appointment?.status === "confirmed") && (
              <Button variant="secondary" onClick={() => changeStatus("in_progress")}>
                Marcar en curso
              </Button>
            )}
          {!isNew && appointment?.status === "in_progress" && (
            <Button onClick={() => changeStatus("completed")}>
              Finalizar
            </Button>
          )}
          {!isNew &&
            appointment &&
            !["completed", "cancelled", "no_show"].includes(appointment.status) && (
              <>
                <Button variant="secondary" onClick={() => changeStatus("no_show")}>
                  No asistió
                </Button>
                <Button variant="secondary" onClick={() => changeStatus("cancelled")}>
                  Cancelar turno
                </Button>
              </>
            )}
          {!isNew && appointment && !locked && (
            <Button variant="danger" onClick={() => handleDelete()}>
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
            <Button onClick={() => handleSave()} disabled={saving || !title.trim()} loading={saving}>
              <Save size={16} /> Guardar
            </Button>
          )}
        </FormActions>
      </PageContent>
    </div>
  );
}
