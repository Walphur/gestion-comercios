import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { Button, Card, Input } from "../ui";
import { useAppConfig } from "../../context/AppConfig";
import {
  getWhatsAppTurnosConfig,
  getWhatsAppTurnosStatus,
  registerWhatsAppTurnos,
  saveWhatsAppTurnosConfig,
  syncWhatsAppTurnosNow,
  type WhatsAppTurnosConfig,
  type WhatsAppTurnosStatus,
} from "../../lib/whatsappTurnos";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminWhatsAppPanel({ onFlash }: Props) {
  const { businessName, isProModuleActive } = useAppConfig();
  const [config, setConfig] = useState<WhatsAppTurnosConfig | null>(null);
  const [status, setStatus] = useState<WhatsAppTurnosStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [reminderHours, setReminderHours] = useState("24");
  const [templateName, setTemplateName] = useState("gc_recordatorio_turno");
  const [templateLang, setTemplateLang] = useState("es_AR");

  const reload = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([getWhatsAppTurnosConfig(), getWhatsAppTurnosStatus()]);
      setConfig(c);
      setStatus(s);
      setEnabled(c.enabled);
      setPhoneNumberId(c.phone_number_id);
      setReminderHours(String(c.reminder_hours));
      setTemplateName(c.template_name);
      setTemplateLang(c.template_lang);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => {
      void getWhatsAppTurnosStatus().then(setStatus).catch(() => {});
    }, 30_000);
    return () => window.clearInterval(id);
  }, [reload]);

  async function handleSave() {
    setSaving(true);
    try {
      const c = await saveWhatsAppTurnosConfig({
        enabled,
        phoneNumberId,
        accessToken: accessToken.trim() || undefined,
        reminderHours: Math.min(72, Math.max(1, Number(reminderHours) || 24)),
        templateName,
        templateLang,
      });
      setConfig(c);
      setAccessToken("");
      onFlash("Configuración de WhatsApp guardada");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleRegister() {
    setRegistering(true);
    try {
      const c = await registerWhatsAppTurnos(businessName);
      setConfig(c);
      onFlash("WhatsApp Business registrado. Configurá el webhook en Meta.");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistering(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const s = await syncWhatsAppTurnosNow();
      setStatus(s);
      onFlash(
        s.pending_updates > 0
          ? `Sincronizado. ${s.pending_updates} respuesta(s) de clientes aplicada(s).`
          : "Turnos sincronizados con WhatsApp",
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      onFlash(`${label} copiado`);
    } catch {
      alert("No se pudo copiar al portapapeles");
    }
  }

  if (!isProModuleActive("appointments")) {
    return (
      <Card className="border-dashed">
        <p className="text-sm font-medium text-ink">WhatsApp para turnos</p>
        <p className="mt-1 text-xs text-ink-muted">
          Activá el módulo Pro de turnos para enviar recordatorios automáticos por WhatsApp.
        </p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
          <MessageCircle size={18} className="text-brand-600" />
          WhatsApp automático para turnos
        </h3>
        <p className="text-sm text-ink-muted">
          Cada comercio usa su propio WhatsApp Business. La app envía recordatorios y el cliente
          puede confirmar o cancelar con botones. Si quiere reprogramar, el bot avisa y vos
          coordinás manualmente.
        </p>
      </section>

      <Card className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-[var(--color-panel-border)]"
          />
          Activar recordatorios y confirmación por WhatsApp
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Phone Number ID (Meta)"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Ej. 123456789012345"
          />
          <Input
            label="Token de acceso (permanente)"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={config?.access_token_set ? "•••••••• (dejá vacío para no cambiar)" : "EAAxxxx…"}
          />
          <Input
            label="Horas antes del turno"
            type="number"
            min={1}
            max={72}
            value={reminderHours}
            onChange={(e) => setReminderHours(e.target.value)}
          />
          <Input
            label="Nombre de plantilla Meta"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <Input
            label="Idioma de plantilla"
            value={templateLang}
            onChange={(e) => setTemplateLang(e.target.value)}
            placeholder="es_AR"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Guardar
          </Button>
          <Button variant="secondary" onClick={() => void handleRegister()} disabled={registering}>
            {registering ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Registrar en servidor
          </Button>
          <Button variant="secondary" onClick={() => void handleSync()} disabled={syncing}>
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Sincronizar ahora
          </Button>
        </div>

        {status?.last_error && (
          <p className="text-xs text-red-600 dark:text-red-400">Último error: {status.last_error}</p>
        )}
        {status?.last_sync_at && (
          <p className="text-xs text-ink-muted">Última sincronización: {status.last_sync_at}</p>
        )}
      </Card>

      {config?.webhook_verify_token && (
        <Card className="space-y-2 text-sm">
          <p className="font-semibold text-ink">Webhook en Meta Business</p>
          <p className="text-xs text-ink-muted">
            En Meta for Developers → WhatsApp → Configuración → Webhook, pegá estos datos:
          </p>
          <div className="space-y-2 rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-muted">URL</span>
              <Button
                variant="ghost"
                className="h-7 px-2"
                onClick={() => void copyText(config.webhook_url, "URL")}
              >
                <Copy size={14} /> Copiar
              </Button>
            </div>
            <code className="block break-all text-ink">{config.webhook_url}</code>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-ink-muted">Verify token</span>
              <Button
                variant="ghost"
                className="h-7 px-2"
                onClick={() => void copyText(config.webhook_verify_token, "Verify token")}
              >
                <Copy size={14} /> Copiar
              </Button>
            </div>
            <code className="block break-all text-ink">{config.webhook_verify_token}</code>
          </div>
        </Card>
      )}

      <Card className="space-y-2 text-sm text-ink-muted">
        <p className="font-semibold text-ink">Plantilla requerida en Meta</p>
        <p className="text-xs leading-relaxed">
          Creá y aprobá una plantilla llamada <strong>{templateName}</strong> con este cuerpo:
        </p>
        <pre className="whitespace-pre-wrap rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3 text-xs text-ink">
          {`Hola {{1}}! Te recordamos tu turno en *{{2}}*:
📅 {{3}}
📋 {{4}}

Respondé con los botones:
• Confirmar
• Cancelar
• Reprogramar`}
        </pre>
        <p className="text-xs">
          Los botones deben ser <em>Respuesta rápida</em> con esos textos. Si el cliente elige
          Reprogramar, recibe un mensaje de que el equipo lo va a contactar y la app te avisa.
        </p>
      </Card>

      <Card className="space-y-3 text-sm">
        <p className="font-semibold text-ink">Cómo explicárselo a tu cliente (el comercio)</p>
        <div className="space-y-3 text-xs leading-relaxed text-ink-muted">
          <p>
            <strong className="text-ink">Qué es:</strong> un recordatorio automático por WhatsApp
            para los turnos. El sistema avisa al cliente el día anterior (o las horas que elijas) y
            él puede confirmar o cancelar con un botón, sin que tengas que llamarlo.
          </p>
          <p>
            <strong className="text-ink">Qué necesita el comercio:</strong> su propio WhatsApp
            Business (no el tuyo), una cuenta en Meta for Developers (gratis) y aprobar una plantilla
            de mensaje. El costo de los mensajes lo paga Meta directo al comercio (unos pocos
            centavos de dólar por aviso).
          </p>
          <p>
            <strong className="text-ink">Qué hace solo:</strong> manda el recordatorio, confirma o
            cancela el turno en la agenda, y si el cliente pide reprogramar le responde que lo van a
            contactar — en la app te aparece un aviso para que coordines el nuevo horario.
          </p>
          <p>
            <strong className="text-ink">Qué no hace solo:</strong> no elige un nuevo horario
            automáticamente; eso lo hacés vos por WhatsApp o teléfono y movés el turno en la app.
          </p>
        </div>
      </Card>
    </div>
  );
}
