import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  User,
  Wrench,
  Clock,
  MessageCircle,
} from "lucide-react";
import { PageHeader, Card, PageContent, EmptyState, Button } from "../components/ui";
import { showUserError } from "../lib/notice";
import {
  listAppointmentsForDay,
  listDistinctResources,
  listUpcomingAppointments,
  setAppointmentStatus,
} from "../db/appointments";
import type { Appointment, AppointmentStatus } from "../types";
import { formatDateShort, formatTime, shiftYmd, todayYmd } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { logAuditAction } from "../lib/tauri";
import { useAppConfig } from "../context/AppConfig";
import { getAppointmentLabels } from "../config/appointmentLabels";
import { rubroUsesAppointmentResources } from "../config/workshop";
import { listWorkshopResourceFilterOptions } from "../db/workshopResources";
import { formatVehicleLabel } from "../lib/vehicleFormat";
import { tryNotifyWhatsApp } from "../components/AppointmentNotifyPanel";
import RescheduleAlertsBanner from "../components/RescheduleAlertsBanner";
import { getAppointment } from "../db/appointments";
import { listOrdersForAppointment } from "../db/workshopFlow";
import { useRescheduleAlerts } from "../hooks/useRescheduleAlerts";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Programado",
  confirmed: "Confirmado",
  in_progress: "En curso",
  completed: "Finalizado",
  cancelled: "Cancelado",
  no_show: "No asistió",
};

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  scheduled: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  confirmed: "bg-brand-500/15 text-brand-800 dark:text-brand-200",
  in_progress: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  completed: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  cancelled: "bg-red-500/15 text-red-700 dark:text-red-300",
  no_show: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function Appointments() {
  const { user } = useAuth();
  const { rubro, businessName, isProModuleActive } = useAppConfig();
  const labels = getAppointmentLabels(rubro);
  const usesResources = rubroUsesAppointmentResources(rubro);
  const { alerts: rescheduleAlerts, dismiss: dismissReschedule } = useRescheduleAlerts(
    isProModuleActive("appointments"),
  );
  const [day, setDay] = useState(todayYmd());
  const [items, setItems] = useState<Appointment[]>([]);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [resources, setResources] = useState<string[]>([]);
  const [resourceFilter, setResourceFilter] = useState("");

  const reload = useCallback(async () => {
    const [dayList, up, res] = await Promise.all([
      listAppointmentsForDay(day),
      listUpcomingAppointments(8),
      usesResources ? listWorkshopResourceFilterOptions() : listDistinctResources(),
    ]);
    setItems(dayList);
    setUpcoming(up);
    setResources(res);
  }, [day, usesResources]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    if (!resourceFilter) return items;
    return items.filter((a) => a.resource_name === resourceFilter);
  }, [items, resourceFilter]);

  const isToday = day === todayYmd();

  async function notifyClient(id: number) {
    try {
      const full = await getAppointment(id);
      if (!full?.customer_phone) {
        showUserError("El turno no tiene cliente con teléfono.", "Sin teléfono");
        return;
      }
      const orders = await listOrdersForAppointment(id);
      await tryNotifyWhatsApp(full, orders, businessName, rubro);
    } catch (e) {
      showUserError(e);
    }
  }

  async function quickStatus(id: number, status: AppointmentStatus) {
    try {
      await setAppointmentStatus(id, status);
      if (user) void logAuditAction(user.id, `appointment_${status}`, "appointment", id);
      await reload();
    } catch (e) {
      showUserError(e);
    }
  }

  return (
    <div>
      <PageHeader
        title="Turnos / Agenda"
        subtitle={labels.listSubtitle}
        actions={
          <Link
            to={`/turnos/nuevo?fecha=${day}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            <Plus size={16} /> Nuevo turno
          </Link>
        }
      />

      <PageContent className="space-y-6">
        <RescheduleAlertsBanner alerts={rescheduleAlerts} onDismiss={(id) => void dismissReschedule(id)} />
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDay((d) => shiftYmd(d, -1))}
                className="rounded-lg border border-[var(--color-panel-border)] p-2 hover:border-brand-400"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-center min-w-[10rem]">
                <p className="font-display text-lg font-semibold text-ink">
                  {formatDateShort(day)}
                  {isToday && (
                    <span className="ml-2 text-xs font-normal text-brand-600 dark:text-brand-300">
                      Hoy
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDay((d) => shiftYmd(d, 1))}
                className="rounded-lg border border-[var(--color-panel-border)] p-2 hover:border-brand-400"
              >
                <ChevronRight size={18} />
              </button>
              {!isToday && (
                <button
                  type="button"
                  onClick={() => setDay(todayYmd())}
                  className="rounded-lg border border-[var(--color-panel-border)] px-3 py-2 text-xs font-semibold text-brand-600 hover:border-brand-400 dark:text-brand-300"
                >
                  Ir a hoy
                </button>
              )}
            </div>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-ink"
            />
            {resources.length > 0 && (
              <select
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
                className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-ink"
              >
                <option value="">{labels.resourceFilterAll}</option>
                {resources.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              <Calendar size={16} /> Agenda del día
            </h2>
            {visible.length === 0 ? (
              <Card variant="elevated">
                <EmptyState
                  icon={Calendar}
                  title="Sin turnos para este día"
                  description="Agendá un turno para este día o cambiá la fecha en el calendario."
                  action={
                    <Link to={`/turnos/nuevo?fecha=${day}`}>
                      <Button size="sm">
                        <Plus size={16} /> Crear turno
                      </Button>
                    </Link>
                  }
                />
              </Card>
            ) : (
              visible.map((a) => (
                <Card key={a.id} className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-ink">
                        <Clock size={14} className="text-brand-600" />
                        {formatTime(a.starts_at)} – {formatTime(a.ends_at)}
                      </span>
                      <span
                        className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[a.status]}`}
                      >
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    <p className="mt-1 font-semibold text-ink">{a.title}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                      {a.customer_name && (
                        <span className="inline-flex items-center gap-1">
                          <User size={12} /> {a.customer_name}
                          {a.customer_phone ? ` · ${a.customer_phone}` : ""}
                        </span>
                      )}
                      {a.resource_name && (
                        <span className="inline-flex items-center gap-1">
                          <Wrench size={12} /> {a.resource_name}
                        </span>
                      )}
                      {(a.vehicle_plate || a.subject_notes) && (
                        <span>
                          {a.vehicle_plate
                            ? formatVehicleLabel({
                                plate: a.vehicle_plate,
                                brand: a.vehicle_brand,
                                model: a.vehicle_model,
                              })
                            : a.subject_notes}
                        </span>
                      )}
                    </div>
                    {a.notes && (
                      <p className="mt-2 text-xs text-ink-muted line-clamp-2">{a.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1 sm:flex-col">
                    <Link
                      to={`/turnos/${a.id}`}
                      className="rounded-lg border border-[var(--color-panel-border)] px-3 py-1.5 text-xs font-semibold text-brand-600 hover:border-brand-400 dark:text-brand-300"
                    >
                      Ver / editar
                    </Link>
                    {a.customer_phone && (
                      <button
                        type="button"
                        onClick={() => void notifyClient(a.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:border-emerald-500 dark:text-emerald-300"
                      >
                        <MessageCircle size={12} /> WhatsApp
                      </button>
                    )}
                    {a.status === "scheduled" && (
                      <button
                        type="button"
                        onClick={() => void quickStatus(a.id, "confirmed")}
                        className="rounded-lg border border-[var(--color-panel-border)] px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand-400"
                      >
                        Confirmar
                      </button>
                    )}
                    {(a.status === "scheduled" || a.status === "confirmed") && (
                      <button
                        type="button"
                        onClick={() => void quickStatus(a.id, "in_progress")}
                        className="rounded-lg border border-[var(--color-panel-border)] px-3 py-1.5 text-xs font-semibold text-ink hover:border-brand-400"
                      >
                        En curso
                      </button>
                    )}
                    {a.status === "in_progress" && (
                      <button
                        type="button"
                        onClick={() => void quickStatus(a.id, "completed")}
                        className="rounded-lg border border-emerald-400/50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                      >
                        Finalizar
                      </button>
                    )}
                    {a.status !== "completed" && a.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => void quickStatus(a.id, "cancelled")}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:underline"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Próximos turnos
            </h2>
            <Card variant="elevated" className="space-y-3 p-4">
              {upcoming.length === 0 ? (
                <EmptyState
                  compact
                  icon={Calendar}
                  title="No hay turnos próximos"
                  description="Los próximos turnos agendados aparecerán en esta lista."
                  action={
                    <Link to="/turnos/nuevo">
                      <Button size="sm">
                        <Plus size={16} /> Nuevo turno
                      </Button>
                    </Link>
                  }
                />
              ) : (
                upcoming.map((a) => (
                  <Link
                    key={a.id}
                    to={`/turnos/${a.id}`}
                    className="block rounded-lg border border-[var(--color-panel-border)] p-3 transition-colors hover:border-brand-400"
                  >
                    <p className="text-xs font-semibold text-brand-600 dark:text-brand-300">
                      {formatDateShort(a.starts_at)} · {formatTime(a.starts_at)}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-ink">{a.title}</p>
                    <p className="text-xs text-ink-muted">
                      {a.customer_name ?? "Sin cliente"}
                      {a.resource_name ? ` · ${a.resource_name}` : ""}
                    </p>
                  </Link>
                ))
              )}
            </Card>
          </div>
        </div>
      </PageContent>
    </div>
  );
}
