import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listClinicDayTurns, listClinicServices, type ClinicDayTurn, type ClinicServiceRow } from "../db/clinicFrontDesk";
import { setAppointmentStatus } from "../db/appointments";
import { listWorkshopResources } from "../db/workshopResources";
import { formatTime, todayYmd } from "../lib/format";
import { showUserError } from "../lib/notice";
import type { WorkshopResource } from "../types";
import { Button } from "./ui";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programado",
  confirmed: "Confirmado",
  in_progress: "En consultorio",
  completed: "Atendido",
  no_show: "No asistió",
};

function phoneHref(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `tel:${digits}`;
}

function personKey(resourceId: number | null, resourceName: string | null): string {
  if (resourceId) return `id:${resourceId}`;
  const name = resourceName?.trim();
  if (name) return `name:${name.toLocaleLowerCase("es")}`;
  return "none";
}

type Person = { key: string; name: string; turns: ClinicDayTurn[] };

function buildPeople(resources: WorkshopResource[], turns: ClinicDayTurn[]): Person[] {
  const people: Person[] = resources.map((row) => ({
    key: `id:${row.id}`,
    name: row.name,
    turns: [],
  }));
  const byKey = new Map(people.map((person) => [person.key, person]));
  for (const turn of turns) {
    const key = personKey(turn.resource_id, turn.resource_name);
    let person = byKey.get(key);
    if (!person) {
      person = {
        key,
        name: turn.resource_name?.trim() || "Sin profesional",
        turns: [],
      };
      byKey.set(key, person);
      people.push(person);
    }
    person.turns.push(turn);
  }
  return people;
}

function TurnLine({ turn }: { turn: ClinicDayTurn }) {
  const tel = phoneHref(turn.customer_phone);
  return (
    <div className="min-w-0">
      <p className="truncate text-base font-semibold text-ink">{turn.customer_name?.trim() || "Sin paciente"}</p>
      <p className="truncate text-sm text-ink-muted">
        {formatTime(turn.starts_at)} · {turn.title?.trim() || "Sin servicio"}
        {turn.insurance?.trim() ? ` · ${turn.insurance.trim()}` : ""}
      </p>
      {tel ? (
        <a href={tel} className="text-sm font-semibold text-brand-700 hover:underline">
          {turn.customer_phone}
        </a>
      ) : turn.customer_phone?.trim() ? (
        <p className="truncate text-sm text-ink-muted">{turn.customer_phone}</p>
      ) : null}
    </div>
  );
}

export default function ClinicFrontDesk() {
  const [resources, setResources] = useState<WorkshopResource[]>([]);
  const [turns, setTurns] = useState<ClinicDayTurn[]>([]);
  const [services, setServices] = useState<ClinicServiceRow[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    const day = todayYmd();
    return Promise.all([listWorkshopResources(), listClinicDayTurns(day), listClinicServices()])
      .then(([staff, dayTurns, catalog]) => {
        setResources(staff);
        setTurns(dayTurns);
        setServices(catalog);
        setError("");
      })
      .catch(() => setError("No se pudo cargar el día del consultorio."));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(id: number, status: "in_progress" | "completed") {
    setBusyId(id);
    try {
      await setAppointmentStatus(id, status);
      await load();
    } catch (e) {
      showUserError(e);
    } finally {
      setBusyId(null);
    }
  }

  const people = buildPeople(resources, turns);

  return (
    <div className="min-w-0 space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="min-w-0">
        <h2 className="panel-section-title">A quién llamar</h2>
        <p className="mt-1 text-sm text-ink-muted">Un paciente por profesional, para decir el nombre en voz alta.</p>
        {people.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Cargá los profesionales en Servicios para armar esta fila.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {people.map((person) => {
              const inside = person.turns.find((turn) => turn.status === "in_progress");
              const next = person.turns.find((turn) => turn.status === "scheduled" || turn.status === "confirmed");
              const last = [...person.turns].reverse().find((turn) => turn.status === "completed" || turn.status === "no_show");
              const focus = inside ?? next;
              return (
                <article
                  key={person.key}
                  className="min-w-0 rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4"
                >
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-ink-muted">{person.name}</p>
                  {focus ? (
                    <div className="mt-2 flex min-w-0 flex-col gap-3">
                      <p className="text-xs font-semibold text-brand-700">
                        {inside ? "En consultorio" : "Siguiente"}
                      </p>
                      <TurnLine turn={focus} />
                      <div className="flex flex-wrap gap-2">
                        {inside ? (
                          <Button size="sm" disabled={busyId === inside.id} onClick={() => mark(inside.id, "completed")}>
                            Ya pasó
                          </Button>
                        ) : next ? (
                          <Button size="sm" disabled={busyId === next.id} onClick={() => mark(next.id, "in_progress")}>
                            Llamar
                          </Button>
                        ) : null}
                        <Link to={`/turnos/${focus.id}`} className="self-center text-sm font-semibold text-brand-700 hover:underline">
                          Abrir turno
                        </Link>
                      </div>
                      {inside && next && (
                        <p className="truncate text-sm text-ink-muted">
                          Después: {next.customer_name?.trim() || "Sin paciente"} · {formatTime(next.starts_at)}
                        </p>
                      )}
                    </div>
                  ) : last ? (
                    <div className="mt-2 min-w-0">
                      <p className="text-xs font-semibold text-ink-muted">
                        {last.status === "no_show" ? "No asistió" : "Último atendido"}
                      </p>
                      <div className="mt-2">
                        <TurnLine turn={last} />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-ink-muted">Hoy no tiene turnos.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="panel-section-title">Turnos de hoy</h2>
          <Link to="/turnos" className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
            Agenda
          </Link>
        </div>
        {turns.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Hoy no hay turnos.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {turns.map((turn) => (
              <li key={turn.id} className="min-w-0">
                <Link
                  to={`/turnos/${turn.id}`}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--color-panel-border)] px-3 py-2.5 hover:border-brand-300"
                >
                  <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-ink">{formatTime(turn.starts_at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{turn.customer_name?.trim() || "Sin paciente"}</span>
                    <span className="block truncate text-sm text-ink-muted">
                      {turn.title?.trim() || "Sin servicio"}
                      {" · "}
                      {turn.resource_name?.trim() || "Sin profesional"}
                      {turn.insurance?.trim() ? ` · ${turn.insurance.trim()}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-ink-muted">{STATUS_LABEL[turn.status] ?? turn.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="panel-section-title">Servicios y quién los hace</h2>
          <Link to="/productos?vista=servicios" className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
            Servicios
          </Link>
        </div>
        {services.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Todavía no hay servicios cargados.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <li
                key={service.id}
                className="min-w-0 rounded-xl border border-[var(--color-panel-border)] px-3 py-2.5"
              >
                <p className="truncate font-semibold text-ink">{service.name}</p>
                <p className="truncate text-sm text-ink-muted">
                  {service.professionals?.trim() || "Sin profesional habilitado"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link to="/clientes" className="font-semibold text-brand-700 hover:underline">Pacientes</Link>
        <Link to="/obras-sociales" className="font-semibold text-brand-700 hover:underline">Obras sociales</Link>
        <Link to="/agenda-profesional" className="font-semibold text-brand-700 hover:underline">Agenda del profesional</Link>
        <Link to="/configuracion" className="font-semibold text-brand-700 hover:underline">Configuración</Link>
      </div>
    </div>
  );
}
