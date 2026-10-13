import { useCallback, useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "../ui";
import { openExternalUrl } from "../../lib/openExternal";
import { formatUserError } from "../../lib/userError";
import { getSetting, setSetting } from "../../db/settings";
import { useAppConfig } from "../../context/AppConfig";
import {
  catalogMobilePair,
  catalogMobileRevoke,
  catalogMobileStatus,
  catalogMobileSyncNow,
  type CatalogMobileStatus,
} from "../../lib/catalogMobile";

interface Props {
  onFlash: (msg: string) => void;
}

const BOOKABLE_RUBROS = new Set(["estetica", "clinica", "taller"]);
const DAY_OPTIONS: [number, string][] = [
  [1, "Lun"],
  [2, "Mar"],
  [3, "Mié"],
  [4, "Jue"],
  [5, "Vie"],
  [6, "Sáb"],
  [0, "Dom"],
];

type DayHoursForm = { open: string; close: string; open2: string; close2: string };

type HoursForm = DayHoursForm & {
  days: number[];
  saturday: DayHoursForm | null;
  sunday: DayHoursForm | null;
};

const DEFAULT_HOURS: HoursForm = {
  days: [0, 1, 2, 3, 4, 5, 6],
  open: "09:00",
  close: "19:00",
  open2: "",
  close2: "",
  saturday: null,
  sunday: null,
};

function minutesOf(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseDayHours(raw: unknown): DayHoursForm | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as DayHoursForm;
  const open = String(data.open ?? "");
  const close = String(data.close ?? "");
  if (minutesOf(open) == null || minutesOf(close) == null) return null;
  return {
    open,
    close,
    open2: minutesOf(String(data.open2 ?? "")) == null ? "" : String(data.open2),
    close2: minutesOf(String(data.close2 ?? "")) == null ? "" : String(data.close2),
  };
}

function parseHoursForm(raw: string | null): HoursForm {
  if (!raw) return DEFAULT_HOURS;
  try {
    const data = JSON.parse(raw) as {
      days?: unknown;
      open?: unknown;
      close?: unknown;
      open2?: unknown;
      close2?: unknown;
      byDay?: Record<string, unknown>;
    };
    const days = Array.isArray(data.days)
      ? [...new Set(data.days.map((day) => Number(day)).filter((day) => day >= 0 && day <= 6))]
      : [];
    const open = String(data.open ?? "");
    const close = String(data.close ?? "");
    const open2 = minutesOf(String(data.open2 ?? "")) == null ? "" : String(data.open2);
    const close2 = minutesOf(String(data.close2 ?? "")) == null ? "" : String(data.close2);
    if (!days.length || minutesOf(open) == null || minutesOf(close) == null) return DEFAULT_HOURS;
    const byDay = data.byDay && typeof data.byDay === "object" ? data.byDay : {};
    return {
      days,
      open,
      close,
      open2,
      close2,
      saturday: parseDayHours(byDay["6"]),
      sunday: parseDayHours(byDay["0"]),
    };
  } catch {
    return DEFAULT_HOURS;
  }
}

function validateDayHours(label: string, day: DayHoursForm): string | null {
  const openMin = minutesOf(day.open);
  const closeMin = minutesOf(day.close);
  const open2 = day.open2.trim();
  const close2 = day.close2.trim();
  const open2Min = open2 ? minutesOf(open2) : null;
  const close2Min = close2 ? minutesOf(close2) : null;
  if (openMin == null || closeMin == null || closeMin - openMin < 60) {
    return `${label}: el primer horario tiene que durar al menos una hora.`;
  }
  if ((open2 && !close2) || (!open2 && close2)) {
    return `${label}: completá la apertura y el cierre de la tarde, o dejá los dos vacíos.`;
  }
  if (open2Min != null && close2Min != null) {
    if (close2Min - open2Min < 60) {
      return `${label}: el horario de la tarde tiene que durar al menos una hora.`;
    }
    if (open2Min < closeMin) {
      return `${label}: la tarde tiene que empezar cuando termina el primer horario.`;
    }
  }
  return null;
}

function dayHoursPayload(day: DayHoursForm) {
  const open2 = day.open2.trim();
  const close2 = day.close2.trim();
  return {
    open: day.open,
    close: day.close,
    ...(minutesOf(open2) != null && minutesOf(close2) != null ? { open2, close2 } : {}),
  };
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.4 12.7c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.9-.8-1.5 0-2.8.9-3.6 2.2-1.5 2.6-.4 6.5 1.1 8.7.7 1.1 1.6 2.3 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7 1.9-1.1 2.6-2.1c.8-1.2 1.2-2.3 1.2-2.4-.1 0-2.1-.8-2.1-3.6zM14.6 6.9c.6-.7 1-1.7.9-2.7-1 .1-2.1.6-2.7 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2.1-.5 2.8-1.4z"
      />
    </svg>
  );
}

function AndroidMark() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.2 8.2 5.4 5.4l1.3-.7 1.6 2.5A6.8 6.8 0 0 1 12 6.2c1.2 0 2.4.3 3.7 1l1.6-2.5 1.3.7-1.8 2.8A6.4 6.4 0 0 1 18.5 14v5.2h-2.6V14H8.1v5.2H5.5V14a6.4 6.4 0 0 1 1.7-5.8zM9.2 12.4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm5.6 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
      />
    </svg>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Todavía no";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminCatalogMobileCard({ onFlash }: Props) {
  const { rubro } = useAppConfig();
  const [status, setStatus] = useState<CatalogMobileStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    catalogMobileStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function pair() {
    setBusy(true);
    try {
      const next = await catalogMobilePair();
      setStatus(next);
      onFlash("Código listo. Abrilo en el celular.");
    } catch (e) {
      onFlash(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const next = await catalogMobileSyncNow();
      setStatus(next);
      onFlash("Catálogo sincronizado.");
    } catch (e) {
      onFlash(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      const next = await catalogMobileRevoke();
      setStatus(next);
      onFlash("Celular desvinculado.");
    } catch (e) {
      onFlash(formatUserError(e));
    } finally {
      setBusy(false);
    }
  }

  const linked = status?.linked ?? false;
  const bookable = BOOKABLE_RUBROS.has(rubro);
  const [hours, setHours] = useState<HoursForm>(DEFAULT_HOURS);
  const [hoursNote, setHoursNote] = useState("");

  useEffect(() => {
    if (!bookable) return;
    getSetting("booking_hours")
      .then((raw) => setHours(parseHoursForm(raw)))
      .catch(() => setHours(DEFAULT_HOURS));
  }, [bookable]);

  function toggleDay(day: number) {
    setHours((current) => {
      const days = current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day];
      return { ...current, days };
    });
  }

  function rejectHours(message: string) {
    setHoursNote(message);
    onFlash(message);
  }

  async function saveHours() {
    if (!hours.days.length) {
      rejectHours("Elegí al menos un día de atención.");
      return;
    }
    const mainError = validateDayHours("El horario general", {
      open: hours.open,
      close: hours.close,
      open2: hours.open2,
      close2: hours.close2,
    });
    if (mainError) {
      rejectHours(mainError);
      return;
    }
    if (hours.days.includes(6) && hours.saturday) {
      const saturdayError = validateDayHours("El sábado", hours.saturday);
      if (saturdayError) {
        rejectHours(saturdayError);
        return;
      }
    }
    if (hours.days.includes(0) && hours.sunday) {
      const sundayError = validateDayHours("El domingo", hours.sunday);
      if (sundayError) {
        rejectHours(sundayError);
        return;
      }
    }
    const byDay: Record<string, ReturnType<typeof dayHoursPayload>> = {};
    if (hours.days.includes(6) && hours.saturday) byDay["6"] = dayHoursPayload(hours.saturday);
    if (hours.days.includes(0) && hours.sunday) byDay["0"] = dayHoursPayload(hours.sunday);
    const saved = {
      days: hours.days,
      ...dayHoursPayload(hours),
      ...(Object.keys(byDay).length ? { byDay } : {}),
    };
    setBusy(true);
    try {
      await setSetting("booking_hours", JSON.stringify(saved));
      const message = "Horario guardado. Tocá Sincronizar ahora para publicarlo en la web.";
      setHoursNote(message);
      onFlash(message);
    } catch (e) {
      const message = formatUserError(e);
      setHoursNote(message);
      onFlash(message);
    } finally {
      setBusy(false);
    }
  }

  function renderDayHours(
    title: string,
    day: DayHoursForm,
    onChange: (next: DayHoursForm) => void,
  ) {
    return (
      <>
        <p className="mt-3 text-sm font-medium text-ink">{title}</p>
        <div className="mt-2 grid min-w-0 grid-cols-2 gap-2">
          <label className="min-w-0 text-sm text-ink">
            Abre
            <input
              type="time"
              className="mt-1 w-full min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-white px-2 py-2"
              value={day.open}
              onChange={(event) => {
                setHoursNote("");
                onChange({ ...day, open: event.target.value });
              }}
            />
          </label>
          <label className="min-w-0 text-sm text-ink">
            Cierra
            <input
              type="time"
              className="mt-1 w-full min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-white px-2 py-2"
              value={day.close}
              onChange={(event) => {
                setHoursNote("");
                onChange({ ...day, close: event.target.value });
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-ink-muted">Segundo horario opcional (si cierran al mediodía)</p>
        <div className="mt-1 grid min-w-0 grid-cols-2 gap-2">
          <label className="min-w-0 text-sm text-ink">
            Abre
            <input
              type="time"
              className="mt-1 w-full min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-white px-2 py-2"
              value={day.open2}
              onChange={(event) => {
                setHoursNote("");
                onChange({ ...day, open2: event.target.value });
              }}
            />
          </label>
          <label className="min-w-0 text-sm text-ink">
            Cierra
            <input
              type="time"
              className="mt-1 w-full min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-white px-2 py-2"
              value={day.close2}
              onChange={(event) => {
                setHoursNote("");
                onChange({ ...day, close2: event.target.value });
              }}
            />
          </label>
        </div>
      </>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 shrink-0 text-brand-700" size={22} />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">App del celular</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Los productos, precios y cantidades viajan de la compu al celular y del celular a la
            compu. En el teléfono también están los reportes del día: ventas, pagos y stock bajo.
            Las ventas siguen cerrándose acá. WalQo tiene que estar abierto para que el celular
            se actualice.
          </p>
        </div>
      </div>

      {linked && status?.pair_code ? (
        <div className="rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Código</p>
          <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.2em] text-ink">
            {status.pair_code}
          </p>
          <p className="mt-2 break-all text-sm text-ink-muted">{status.phone_url}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Vence {formatWhen(status.pair_expires_at)}. En el celular abrí walqo.pro/celular y escribí el código.
            En Android, el navegador ofrece instalarla. En el iPhone, tocá Instalar el ícono.
          </p>
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-2 gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-3 text-ink"
          onClick={() => void openExternalUrl("https://walqo.pro/celular#iphone")}
        >
          <AppleMark />
          <span className="text-sm font-semibold">Instalar en iPhone</span>
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-3 text-ink"
          onClick={() => void openExternalUrl("https://walqo.pro/celular#android")}
        >
          <AndroidMark />
          <span className="text-sm font-semibold">Instalar en Android</span>
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        En el iPhone abrí walqo.pro/celular e instalá el perfil. En Android descargá la app. El
        código de entrada está arriba, en esta misma pantalla.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void pair()}>
          {linked ? "Nuevo código" : "Generar código"}
        </Button>
        {linked ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void syncNow()}>
            Sincronizar ahora
          </Button>
        ) : null}
        {linked ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void revoke()}>
            Desvincular
          </Button>
        ) : null}
      </div>

      {bookable ? (
        <div className="min-w-0 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Días y horarios de turnos
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            La web de reservas muestra solo estos días y estos horarios. El sábado o el domingo pueden
            tener otro horario. La duración de cada turno sale del servicio.
          </p>
          <div className="mt-3 flex min-w-0 flex-wrap gap-2">
            {DAY_OPTIONS.map(([day, label]) => (
              <button
                key={day}
                type="button"
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  hours.days.includes(day)
                    ? "bg-brand-700 text-white"
                    : "bg-white text-ink ring-1 ring-[var(--color-panel-border)]"
                }`}
                onClick={() => toggleDay(day)}
              >
                {label}
              </button>
            ))}
          </div>
          {renderDayHours("Horario general", hours, (next) =>
            setHours((current) => ({ ...current, ...next })),
          )}
          {hours.days.includes(6) ? (
            <div className="mt-3 min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-white px-3 py-3">
              <label className="flex min-w-0 items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={hours.saturday !== null}
                  onChange={(event) => {
                    setHoursNote("");
                    setHours((current) => ({
                      ...current,
                      saturday: event.target.checked
                        ? { open: current.open, close: "13:00", open2: "", close2: "" }
                        : null,
                    }));
                  }}
                />
                <span className="min-w-0">
                  El sábado tiene otro horario
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    Si no lo marcás, el sábado usa el horario general.
                  </span>
                </span>
              </label>
              {hours.saturday
                ? renderDayHours("Sábado", hours.saturday, (next) =>
                    setHours((current) => ({ ...current, saturday: next })),
                  )
                : null}
            </div>
          ) : null}
          {hours.days.includes(0) ? (
            <div className="mt-3 min-w-0 rounded-lg border border-[var(--color-panel-border)] bg-white px-3 py-3">
              <label className="flex min-w-0 items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={hours.sunday !== null}
                  onChange={(event) => {
                    setHoursNote("");
                    setHours((current) => ({
                      ...current,
                      sunday: event.target.checked
                        ? { open: current.open, close: "13:00", open2: "", close2: "" }
                        : null,
                    }));
                  }}
                />
                <span className="min-w-0">
                  El domingo tiene otro horario
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    Si no lo marcás, el domingo usa el horario general.
                  </span>
                </span>
              </label>
              {hours.sunday
                ? renderDayHours("Domingo", hours.sunday, (next) =>
                    setHours((current) => ({ ...current, sunday: next })),
                  )
                : null}
            </div>
          ) : null}
          <div className="mt-3">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveHours()}>
              Guardar horario
            </Button>
            {hoursNote ? (
              <p
                className={`mt-2 text-sm font-medium ${
                  hoursNote.startsWith("Horario guardado") ? "text-green-700" : "text-amber-800"
                }`}
              >
                {hoursNote}
              </p>
            ) : null}
          </div>
          {linked && status?.booking_url ? (
            <>
              <p className="mt-4 text-sm leading-relaxed text-ink">
                El cliente reserva en este enlace. El turno queda guardado aunque la compu esté
                cerrada. Cuando WalQo está abierto, entra a Turnos como Programado.
              </p>
              <p className="mt-2 break-all text-sm font-medium text-ink">{status.booking_url}</p>
              <div className="mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(status.booking_url || "").then(
                      () => onFlash("Enlace copiado."),
                      () => onFlash("No se pudo copiar. Seleccioná el enlace."),
                    );
                  }}
                >
                  Copiar enlace
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {linked ? (
        <p className="text-sm text-ink-muted">
          Última sincronización: {formatWhen(status?.last_sync_at ?? null)}
          {status?.phones ? ` · ${status.phones} celular${status.phones === 1 ? "" : "es"}` : ""}
          {status?.conflicts ? ` · ${status.conflicts} cambios para revisar` : ""}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          La primera vez puede tardar unos minutos si hay muchos productos.
        </p>
      )}

      {status?.last_error ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">{status.last_error}</p>
      ) : null}
    </div>
  );
}
