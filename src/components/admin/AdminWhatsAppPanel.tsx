import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, Copy, Eye, EyeOff, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { Button, Card, Input } from "../ui";
import { CollapsibleSection } from "../CollapsibleGuide";
import { useAppConfig } from "../../context/AppConfig";
import {
  getWhatsAppTurnosConfig,
  getWhatsAppTurnosStatus,
  registerWhatsAppTurnos,
  refreshWhatsAppZernio,
  saveWhatsAppTurnosConfig,
  sendWhatsAppTurnosTest,
  startWhatsAppZernio,
  syncWhatsAppTurnosNow,
  type WhatsAppTurnosConfig,
  type WhatsAppTurnosStatus,
} from "../../lib/whatsappTurnos";
import { formatUserError } from "../../lib/userError";

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
  const [connecting, setConnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [reminderHours, setReminderHours] = useState("24");
  const [templateName, setTemplateName] = useState("gc_recordatorio_turno2");
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
      alert(formatUserError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleZernioConnect() {
    setConnecting(true);
    try {
      const url = await startWhatsAppZernio(businessName || "Comercio");
      await invoke("open_https_link", { url });
      onFlash("Se abrió WhatsApp Business. Cuando termines, tocá Ya conecté.");
    } catch (e) {
      alert(formatUserError(e));
    } finally {
      setConnecting(false);
    }
  }

  async function handleZernioRefresh() {
    setConfirming(true);
    try {
      const c = await refreshWhatsAppZernio();
      setConfig(c);
      setEnabled(c.enabled);
      onFlash(
        c.zernio_connected
          ? "WhatsApp Business conectado."
          : "Todavía no figura conectado. Terminá el paso en el navegador y volvé a intentar.",
      );
    } catch (e) {
      alert(formatUserError(e));
    } finally {
      setConfirming(false);
    }
  }

  async function handleTestReminder() {
    setTesting(true);
    try {
      const message = await sendWhatsAppTurnosTest(testPhone.trim());
      onFlash(message);
    } catch (e) {
      alert(formatUserError(e));
    } finally {
      setTesting(false);
    }
  }

  async function handleRegister() {
    setRegistering(true);
    try {
      const c = await registerWhatsAppTurnos(businessName);
      setConfig(c);
      onFlash("WhatsApp Business registrado. Configurá el webhook en Meta.");
    } catch (e) {
      alert(formatUserError(e));
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
      alert(formatUserError(e));
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
          Esto no manda presupuestos. Para pasarle un presupuesto al cliente, abrí el presupuesto
          y tocá Enviar por WhatsApp: se abre la app (normal o Business) con el mensaje listo.
        </p>
        <p className="text-sm text-ink-muted">
          Los recordatorios de turnos salen del WhatsApp Business del comercio. Se conecta con
          Zernio: el número sigue en la app del celular y WalQo manda los avisos.
        </p>
      </section>

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-ink">WhatsApp Business del comercio</p>
        {config?.zernio_connected ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Conectado
            {config.zernio_phone && config.zernio_phone !== "conectado"
              ? ` · ${config.zernio_phone}`
              : ""}
            . Los recordatorios salen de ese número.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-ink-muted">
            El dueño entra con el WhatsApp Business que ya usa para atender. Conectar la cuenta sale{" "}
            <strong className="text-ink">6 dólares</strong>. El número sigue en el celular. Meta
            aprueba la plantilla con los botones la primera vez, en general dentro de un día.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleZernioConnect()} disabled={connecting}>
            {connecting ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
            Conectar WhatsApp Business
          </Button>
          <Button variant="secondary" onClick={() => void handleZernioRefresh()} disabled={confirming}>
            {confirming ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Ya conecté
          </Button>
        </div>
        {config?.zernio_connected && (
          <div className="space-y-2 border-t border-[var(--color-panel-border)] pt-3">
            <p className="text-sm font-medium text-ink">Probar el aviso de un día antes</p>
            <p className="text-xs leading-relaxed text-ink-muted">
              El aviso automático sale unas 24 horas antes del turno. Para verlo ya, mandá una prueba
              a un celular personal. En ese WhatsApp aparecen los botones Confirmar, Cancelar y
              Reprogramar cuando Meta ya aprobó la plantilla.
            </p>
            <Input
              label="Celular que recibe la prueba"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="Ej. 2664123456"
              hint="No uses el número del comercio: WhatsApp no se envía un mensaje a sí mismo."
            />
            <Button variant="secondary" onClick={() => void handleTestReminder()} disabled={testing}>
              {testing ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
              Enviar prueba ahora
            </Button>
          </div>
        )}
      </Card>

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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Phone Number ID (Meta)"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Ej. 123456789012345"
            hint={
              phoneNumberId.replace(/\D/g, "").length > 0 &&
              phoneNumberId.replace(/\D/g, "").length < 14
                ? "Eso parece un teléfono. El Phone Number ID es el número largo de Meta for Developers, no el celular del comercio."
                : undefined
            }
          />
          <Input
            label="Token de acceso (permanente)"
            type={showToken ? "text" : "password"}
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={config?.access_token_set ? "•••••••• (dejá vacío para no cambiar)" : "EAAxxxx…"}
            endAdornment={
              <button
                type="button"
                className="rounded-lg p-1.5 text-ink-muted hover:bg-brand-50 hover:text-ink dark:hover:bg-brand-950/40"
                aria-label={showToken ? "Ocultar token" : "Mostrar token"}
                onClick={() => setShowToken((v) => !v)}
              >
                {showToken ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            }
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

      <Card className="space-y-3 text-sm text-ink-muted">
        <p className="font-semibold text-ink">Plantilla requerida en Meta</p>
        <div className="flex flex-col gap-4 lg:flex-row-reverse lg:items-start">
          <div className="mx-auto w-full max-w-[260px] shrink-0 lg:mx-0">
            <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              Cómo se ve el mensaje
            </p>
            <div className="rounded-[1.75rem] border border-slate-700 bg-slate-900 p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-center gap-1.5">
                <span className="h-1.5 w-12 rounded-full bg-slate-600" />
              </div>
              <div className="rounded-2xl bg-[#0b141a] p-3">
                <div className="mb-2 text-[10px] text-slate-400">WhatsApp · demostración</div>
                <div className="max-w-[95%] rounded-2xl rounded-tl-sm bg-[#005c4b] px-3 py-2 text-[12px] leading-relaxed text-white shadow">
                  <p>
                    Hola <strong>María</strong>, te recordamos tu turno en{" "}
                    <strong>{businessName || "tu comercio"}</strong> el <strong>mañana 10:30</strong>.
                    El servicio es <strong>Corte</strong>. Te esperamos.
                  </p>
                  <div className="mt-2 flex flex-col gap-1 border-t border-white/20 pt-2">
                    {["Confirmar", "Cancelar", "Reprogramar"].map((b) => (
                      <span
                        key={b}
                        className="rounded-lg bg-white/10 px-2 py-1 text-center text-[11px] font-medium text-emerald-100"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-center text-[9px] text-slate-500">
                  Recordatorio ~{reminderHours || "24"} h antes
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs leading-relaxed text-ink-muted">
              WalQo crea la plantilla <strong className="text-ink">{templateName}</strong> (
              {templateLang}). Los botones Confirmar, Cancelar y Reprogramar salen en el WhatsApp del
              cliente cuando Meta la aprueba.
            </p>
            <pre className="whitespace-pre-wrap rounded-lg border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3 text-xs text-ink">
              {`Hola {{1}}, te recordamos tu turno en {{2}} el {{3}}. El servicio es {{4}}. Te esperamos.

Botones: Confirmar, Cancelar, Reprogramar`}
            </pre>
          </div>
        </div>

        <p className="text-xs">
          Los botones deben ser <em>Respuesta rápida</em> con esos textos. Si el cliente elige
          Reprogramar, recibe un mensaje de que el equipo lo va a contactar y la app te avisa.
        </p>
      </Card>

      <CollapsibleSection title="¿Cómo conectar WhatsApp Business?">
        <ol className="list-decimal space-y-4 pl-5 text-xs leading-relaxed text-ink-muted">
          <li>
            <strong className="text-ink">WhatsApp Business en el celular</strong>
            <p className="mt-1">
              El comercio tiene que usar la app WhatsApp Business con el número con el que atiende.
              Ese número sigue en el celular.
            </p>
          </li>
          <li>
            <strong className="text-ink">Conectar en WalQo</strong>
            <p className="mt-1">
              Tocá <strong>Conectar WhatsApp Business</strong>. Se abre el navegador, el dueño entra
              con la cuenta del negocio y confirma el número. Conectar la cuenta sale{" "}
              <strong className="text-ink">6 dólares</strong>.
            </p>
          </li>
          <li>
            <strong className="text-ink">Volver a la app</strong>
            <p className="mt-1">
              Cuando el navegador diga que quedó conectado, tocá <strong>Ya conecté</strong>.
            </p>
          </li>
          <li>
            <strong className="text-ink">Botones en el mensaje</strong>
            <p className="mt-1">
              WalQo pide a Meta la plantilla con los botones <strong>Confirmar</strong>,{" "}
              <strong>Cancelar</strong> y <strong>Reprogramar</strong>. Hasta que Meta la apruebe
              (en general dentro de un día) el aviso no sale. Cuando está aprobada, el cliente ve
              esos tres botones en el WhatsApp.
            </p>
          </li>
          <li>
            <strong className="text-ink">Probar sin esperar al día anterior</strong>
            <p className="mt-1">
              El aviso automático se manda unas 24 horas antes del turno. Para verlo ahora, poné un
              celular personal en <strong>Enviar prueba ahora</strong>. No uses el número del
              comercio.
            </p>
          </li>
        </ol>

        <p className="mt-4 rounded-lg border border-brand-500/30 bg-brand-500/5 p-3 text-xs text-ink-muted">
          <strong className="text-ink">Costo:</strong> conectar la cuenta sale 6 dólares. Después,
          Meta cobra cada aviso a la cuenta de WhatsApp Business del comercio (centavos de dólar por
          mensaje).
        </p>
      </CollapsibleSection>

      <Card className="space-y-3 text-sm">
        <p className="font-semibold text-ink">Resumen para el dueño del comercio</p>
        <div className="space-y-3 text-xs leading-relaxed text-ink-muted">
          <p>
            <strong className="text-ink">Qué es:</strong> un recordatorio automático por WhatsApp
            para los turnos. El sistema avisa al cliente el día anterior (o las horas que elijas) y
            él puede confirmar o cancelar con un botón, sin que tengas que llamarlo.
          </p>
          <p>
            <strong className="text-ink">Qué necesita el comercio:</strong> su propio WhatsApp
            Business. Conectar la cuenta sale 6 dólares y el número sigue en el celular. Meta aprueba
            la plantilla con los botones y después cobra cada aviso (centavos de dólar).
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
