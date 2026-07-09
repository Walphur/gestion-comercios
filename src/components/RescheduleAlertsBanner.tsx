import { Link } from "react-router-dom";
import { CalendarClock, MessageCircle, X } from "lucide-react";
import { Button, Card } from "./ui";
import type { RescheduleAlert } from "../db/appointmentNotifications";
import { formatDateShort, formatTime } from "../lib/format";
import { openWhatsApp } from "../lib/openExternal";

interface Props {
  alerts: RescheduleAlert[];
  onDismiss: (id: number) => void;
}

export default function RescheduleAlertsBanner({ alerts, onDismiss }: Props) {
  if (!alerts.length) return null;

  return (
    <Card className="border-amber-400/50 bg-amber-50/80 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" size={20} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {alerts.length === 1
                ? "1 cliente quiere reprogramar"
                : `${alerts.length} clientes quieren reprogramar`}
            </p>
            <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-200/80">
              Respondieron por WhatsApp. Coordiná el nuevo horario y actualizá el turno en la app.
            </p>
          </div>
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-lg border border-amber-300/40 bg-white/60 p-3 dark:bg-black/20 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-ink">
                    {a.customer_name ?? "Cliente"} · {a.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Turno actual: {formatDateShort(a.starts_at)} {formatTime(a.starts_at)} hs
                    {a.customer_phone ? ` · ${a.customer_phone}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {a.customer_phone && (
                    <Button
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => void openWhatsApp(a.customer_phone!, "Hola! Te escribo para coordinar el nuevo horario de tu turno.")}
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </Button>
                  )}
                  <Link to={`/turnos/${a.appointment_id}`}>
                    <Button variant="secondary" className="h-8 text-xs">
                      Ver turno
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => void onDismiss(a.id)}
                    title="Marcar como visto"
                  >
                    <X size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
