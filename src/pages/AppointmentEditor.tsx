import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { PageHeader, Card, Button, Input, Select } from "../components/ui";
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
import { confirmDelete } from "../lib/confirm";

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
    }
  }, [appointmentId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  function buildPayload() {
    const starts_at = buildDateTime(date, startTime);
    const ends_at = addMinutesToDateTime(starts_at, durationMin);
    return {
      customer_id: customerId === "" ? null : customerId,
      title,
      resource_name: resourceName,
      subject_notes: subjectNotes,
      starts_at,
      ends_at,
      notes,
      user_id: user?.id ?? null,
    };
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isNew) {
        const newId = await createAppointment(payload);
        if (user) void logAuditAction(user.id, "appointment_created", "appointment", newId);
        navigate(`/turnos/${newId}`, { replace: true });
      } else if (appointmentId) {
        await updateAppointment(appointmentId, payload);
        if (user) void logAuditAction(user.id, "appointment_updated", "appointment", appointmentId);
        await load();
        alert("Turno guardado.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
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
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
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
      alert(e instanceof Error ? e.message : String(e));
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
            ? "Reservá horario para taller, consultorio, peluquería o barbería."
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

      <div className="mx-auto max-w-2xl space-y-6 p-8">
        <Card className="space-y-4">
          <Input
            label="Servicio / motivo"
            value={title}
            disabled={locked}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Alineación, Consulta, Corte, Baño y corte…"
          />
          <Select
            label="Cliente (opcional)"
            value={customerId}
            disabled={locked}
            onChange={(e) =>
              setCustomerId(e.target.value === "" ? "" : Number(e.target.value))
            }
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
              label="Profesional / box / sillón"
              value={resourceName}
              disabled={locked}
              onChange={(e) => setResourceName(e.target.value)}
              placeholder="Ej. Juan, Box 2, Sillón 1"
            />
            <Input
              label="Vehículo / mascota / detalle"
              value={subjectNotes}
              disabled={locked}
              onChange={(e) => setSubjectNotes(e.target.value)}
              placeholder="Ej. ABC123, Firulais"
            />
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
            placeholder="Recordatorios para el equipo…"
          />
        </Card>

        <div className="flex flex-wrap gap-2">
          {!locked && (
            <Button onClick={() => void handleSave()} disabled={saving || !title.trim()}>
              <Save size={16} /> {saving ? "Guardando…" : "Guardar"}
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
        </div>
      </div>
    </div>
  );
}
