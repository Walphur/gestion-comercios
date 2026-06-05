import { useEffect, useMemo, useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { Card, Button, Select } from "./ui";
import type { Appointment } from "../types";
import { useAppConfig } from "../context/AppConfig";
import { getCustomer } from "../db/customers";
import {
  buildAppointmentMessage,
  getNotifyKindLabel,
  NOTIFY_KINDS,
  suggestNotifyKind,
  type AppointmentNotifyKind,
} from "../lib/appointmentNotifications";
import { normalizePhoneForWhatsApp, openEmail, openWhatsApp } from "../lib/openExternal";

interface Props {
  appointment: Appointment;
  linkedOrders?: { status: string }[];
}

export default function AppointmentNotifyPanel({ appointment, linkedOrders = [] }: Props) {
  const { businessName, rubro } = useAppConfig();
  const [kind, setKind] = useState<AppointmentNotifyKind>(
    suggestNotifyKind(appointment, linkedOrders),
  );
  const [email, setEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setKind(suggestNotifyKind(appointment, linkedOrders));
  }, [appointment, linkedOrders]);

  useEffect(() => {
    if (!appointment.customer_id) {
      setEmail(null);
      return;
    }
    void getCustomer(appointment.customer_id).then((c) => setEmail(c?.email ?? null));
  }, [appointment.customer_id]);

  const message = useMemo(
    () =>
      buildAppointmentMessage(kind, {
        businessName,
        rubro,
        appointment,
        linkedOrderReady: linkedOrders.some((o) => o.status === "ready"),
      }),
    [kind, businessName, rubro, appointment, linkedOrders],
  );

  const phone = appointment.customer_phone?.trim();
  const waPhone = phone ? normalizePhoneForWhatsApp(phone) : null;
  const hasPhone = !!phone;
  const hasEmail = !!email?.trim();
  const phoneInvalid = hasPhone && !waPhone;

  async function sendWhatsApp() {
    if (!phone) return;
    setSending(true);
    try {
      const result = await openWhatsApp(phone, message.body);
      if (result.copied) {
        alert(
          "Se abrió WhatsApp y el mensaje se copió al portapapeles. Pegalo con Ctrl+V y enviá.",
        );
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function sendEmail() {
    if (!email?.trim()) return;
    setSending(true);
    try {
      await openEmail(email, message.subject, message.body);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (!hasPhone && !hasEmail) {
    return (
      <Card className="border-dashed">
        <p className="text-sm font-medium text-ink">Avisar al cliente</p>
        <p className="mt-1 text-xs text-ink-muted">
          Asociá un cliente con teléfono o email para enviar recordatorios por WhatsApp o correo.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-ink">Avisar al cliente</p>
        <p className="text-xs text-ink-muted">
          Se abre WhatsApp o tu programa de correo con el mensaje listo. Los teléfonos argentinos
          se guardan con +549 automáticamente. Solo pulsá Enviar en WhatsApp o en el mail.
        </p>
      </div>

      <Select
        label="Tipo de mensaje"
        value={kind}
        onChange={(e) => setKind(e.target.value as AppointmentNotifyKind)}
      >
        {NOTIFY_KINDS.map((k) => (
          <option key={k} value={k}>
            {getNotifyKindLabel(k)}
          </option>
        ))}
      </Select>

      <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3 text-xs text-ink">
        {message.body}
      </pre>

      {phoneInvalid && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          El teléfono «{phone}» no se reconoce. Editá el cliente y cargá el número sin +549 (ej.
          11 2345-6789).
        </p>
      )}
      {waPhone && (
        <p className="text-xs text-ink-muted">WhatsApp usará: +{waPhone}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {hasPhone && (
          <Button
            variant="secondary"
            onClick={() => void sendWhatsApp()}
            disabled={sending || phoneInvalid}
          >
            <MessageCircle size={16} /> WhatsApp
            {phone ? ` · ${phone}` : ""}
          </Button>
        )}
        {hasEmail && (
          <Button variant="secondary" onClick={() => void sendEmail()} disabled={sending}>
            <Mail size={16} /> Email
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Envía aviso por WhatsApp si hay teléfono; devuelve si se abrió. */
export async function tryNotifyWhatsApp(
  appointment: Appointment,
  linkedOrders: { status: string }[],
  businessName: string,
  rubro: Parameters<typeof buildAppointmentMessage>[1]["rubro"],
  kind?: AppointmentNotifyKind,
): Promise<boolean> {
  const phone = appointment.customer_phone?.trim();
  if (!phone) return false;
  const k = kind ?? suggestNotifyKind(appointment, linkedOrders);
  const { body } = buildAppointmentMessage(k, {
    businessName,
    rubro,
    appointment,
    linkedOrderReady: linkedOrders.some((o) => o.status === "ready"),
  });
  const result = await openWhatsApp(phone, body);
  if (result.copied) {
    alert("WhatsApp abierto. El mensaje está en el portapapeles: pegalo con Ctrl+V.");
  }
  return true;
}
