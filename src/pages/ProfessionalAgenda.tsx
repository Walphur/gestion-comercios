import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { CalendarClock, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  Modal,
  PageContent,
  PageHeader,
  Select,
  TextArea,
} from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { rubroUsesAppointmentResources } from "../config/workshop";
import { listWorkshopResources } from "../db/workshopResources";
import {
  listProfessionalAgenda,
  type ProfessionalAgendaEntry,
} from "../db/professionalAgenda";
import { getClinicExternalApps, type ClinicExternalApps } from "../db/clinicApps";
import { getVisitNote, saveVisitNote } from "../db/visitNotes";
import { usableHttpUrl } from "../lib/externalAppUrl";
import { openExternalUrl } from "../lib/openExternal";
import { formatDateShort, formatTime, shiftYmd, todayYmd } from "../lib/format";
import { showUserError } from "../lib/notice";
import type { WorkshopResource } from "../types";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Programado",
  confirmed: "Confirmado",
  in_progress: "En curso",
  completed: "Finalizado",
  no_show: "No asistió",
};

function coverageLabel(insurance: string | null, affiliate: string | null): string {
  const plan = insurance?.trim() || "";
  const member = affiliate?.trim() || "";
  if (plan && member) return `${plan} · ${member}`;
  return plan || member;
}

export default function ProfessionalAgenda() {
  const { rubro } = useAppConfig();
  const clinic = rubro === "clinica";
  const [day, setDay] = useState(todayYmd());
  const [resources, setResources] = useState<WorkshopResource[]>([]);
  const [resourceId, setResourceId] = useState<number | null>(null);
  const [entries, setEntries] = useState<ProfessionalAgendaEntry[]>([]);
  const [apps, setApps] = useState<ClinicExternalApps>({ billing: null, records: null });
  const [ready, setReady] = useState(false);
  const [listError, setListError] = useState("");
  const [openEntry, setOpenEntry] = useState<ProfessionalAgendaEntry | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = resources.find((row) => row.id === resourceId) ?? null;

  useEffect(() => {
    let cancelled = false;
    void listWorkshopResources()
      .then((rows) => {
        if (cancelled) return;
        setResources(rows);
        setResourceId((current) => {
          if (current && rows.some((row) => row.id === current)) return current;
          return rows[0]?.id ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) setListError("No se pudieron cargar los profesionales.");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!selected) {
      setEntries([]);
      return;
    }
    setListError("");
    try {
      const [rows, links] = await Promise.all([
        listProfessionalAgenda(day, selected.id, selected.name),
        clinic ? getClinicExternalApps() : Promise.resolve({ billing: null, records: null }),
      ]);
      setEntries(rows);
      setApps(links);
    } catch {
      setEntries([]);
      setListError("No se pudo cargar la agenda.");
    }
  }, [clinic, day, selected]);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, reload]);

  async function openNote(entry: ProfessionalAgendaEntry) {
    setOpenEntry(entry);
    setNote("");
    setNoteError("");
    try {
      setNote(await getVisitNote(entry.id));
    } catch {
      setNoteError("No se pudo leer la nota.");
    }
  }

  async function saveNote() {
    if (!openEntry) return;
    setSaving(true);
    setNoteError("");
    try {
      await saveVisitNote(openEntry.id, note);
      setOpenEntry(null);
      await reload();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setNoteError(
        message === "La nota es demasiado larga." ? message : "No se pudo guardar la nota.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function openApp(url: string | null) {
    const safe = usableHttpUrl(url);
    if (!safe) return;
    try {
      await openExternalUrl(safe);
    } catch {
      showUserError("No se pudo abrir el enlace.");
    }
  }

  if (!rubroUsesAppointmentResources(rubro)) return <Navigate to="/" replace />;

  const isToday = day === todayYmd();

  return (
    <div className="min-w-0">
      <PageHeader
        title="Agenda del profesional"
        subtitle={
          clinic
            ? "Los turnos de hoy de un solo profesional. La nota es interna del consultorio."
            : "Los turnos del día de un solo profesional o recurso."
        }
      />
      <PageContent className="min-w-0 space-y-4">
        {!ready ? (
          <p className="text-sm text-ink-muted">Cargando…</p>
        ) : resources.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Todavía no hay profesionales"
            description="Cargalos en Configuración, en el personal, y volvé a esta agenda."
          />
        ) : (
          <>
            <Card>
              <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 flex-1 basis-56">
                  <Select
                    label="Profesional"
                    value={selected ? String(selected.id) : ""}
                    onChange={(e) => setResourceId(Number(e.target.value))}
                  >
                    {resources.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-label="Día anterior"
                    onClick={() => setDay((value) => shiftYmd(value, -1))}
                    className="rounded-lg border border-[var(--color-panel-border)] p-2 hover:border-brand-400"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <p className="min-w-[7.5rem] text-center font-display text-base font-semibold text-ink">
                    {formatDateShort(day)}
                    {isToday && (
                      <span className="ml-2 text-xs font-normal text-brand-600 dark:text-brand-300">
                        Hoy
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    aria-label="Día siguiente"
                    onClick={() => setDay((value) => shiftYmd(value, 1))}
                    className="rounded-lg border border-[var(--color-panel-border)] p-2 hover:border-brand-400"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <input
                    type="date"
                    aria-label="Elegir día"
                    value={day}
                    onChange={(e) => {
                      if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDay(e.target.value);
                    }}
                    className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-ink"
                  />
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
              </div>
            </Card>

            {clinic && (
              <Card className="min-w-0">
                <p className="text-sm text-ink-muted">
                  La factura y la receta se hacen en otra app. WalQo solo abre el acceso.
                </p>
                {(apps.billing || apps.records) && (
                  <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                    {apps.billing && (
                      <Button type="button" variant="secondary" onClick={() => void openApp(apps.billing)}>
                        <ExternalLink size={16} /> Abrir facturación
                      </Button>
                    )}
                    {apps.records && (
                      <Button type="button" variant="secondary" onClick={() => void openApp(apps.records)}>
                        <ExternalLink size={16} /> Abrir historia o recetas
                      </Button>
                    )}
                  </div>
                )}
                {!apps.billing && !apps.records && (
                  <p className="mt-2 text-sm">
                    <Link to="/admin?section=apps-clinica" className="font-semibold text-brand-700 hover:underline">
                      Pegá el enlace en Configuración
                    </Link>
                  </p>
                )}
              </Card>
            )}

            {listError ? (
              <p className="text-sm text-red-600" role="alert">
                {listError}
              </p>
            ) : entries.length === 0 ? (
              <EmptyState
                compact
                icon={CalendarClock}
                title="Sin turnos este día"
                description="No hay turnos de este profesional en esta fecha."
              />
            ) : (
              <div className="min-w-0 space-y-2">
                <div className="hidden min-w-0 grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.1fr)] gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted md:grid">
                  <span>Hora</span>
                  <span>Paciente</span>
                  <span>Teléfono</span>
                  <span>Servicio</span>
                  <span>Obra social</span>
                </div>
                {entries.map((entry) => {
                  const coverage = coverageLabel(entry.insurance, entry.affiliate_number);
                  const row = (
                    <>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">
                        {formatTime(entry.starts_at)}
                        <span className="ml-2 text-xs font-normal text-ink-muted md:hidden">
                          {STATUS_LABEL[entry.status] ?? ""}
                        </span>
                      </span>
                      <span className="min-w-0 truncate font-medium text-ink">
                        {entry.customer_name?.trim() || "Sin paciente"}
                      </span>
                      <span className="min-w-0 truncate text-ink-muted">
                        {entry.customer_phone?.trim() || "—"}
                      </span>
                      <span className="min-w-0 truncate text-ink">{entry.title}</span>
                      <span className="min-w-0 truncate text-ink-muted">
                        {coverage || "—"}
                        {clinic && entry.has_visit_note ? (
                          <span className="ml-2 text-xs font-semibold text-brand-700 dark:text-brand-300">
                            Nota
                          </span>
                        ) : null}
                      </span>
                    </>
                  );
                  const className =
                    "grid w-full min-w-0 grid-cols-1 gap-0.5 rounded-xl border border-[var(--color-panel-border)] px-3 py-2.5 text-left text-sm md:grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.1fr)] md:items-center md:gap-2";
                  if (!clinic) {
                    return (
                      <div key={entry.id} className={className}>
                        {row}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`${className} hover:border-brand-400`}
                      onClick={() => void openNote(entry)}
                    >
                      {row}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </PageContent>

      <Modal
        open={clinic && openEntry !== null}
        title="Nota interna"
        onClose={() => setOpenEntry(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpenEntry(null)}>
              Cerrar
            </Button>
            <Button type="button" loading={saving} onClick={() => void saveNote()}>
              Guardar nota
            </Button>
          </div>
        }
      >
        {openEntry && (
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-ink-muted">
              Nota interna del consultorio. No es receta electrónica ni historia clínica oficial para
              compartir con otras instituciones.
            </p>
            <p className="min-w-0 truncate text-sm text-ink">
              {formatTime(openEntry.starts_at)} · {openEntry.customer_name?.trim() || "Sin paciente"} ·{" "}
              {openEntry.title}
            </p>
            <TextArea
              label="Qué se hizo o qué indicar"
              rows={6}
              value={note}
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
            />
            {noteError && (
              <p className="text-sm text-red-600" role="alert">
                {noteError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
