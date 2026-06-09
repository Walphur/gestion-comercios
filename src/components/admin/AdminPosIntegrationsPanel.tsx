import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Unplug } from "lucide-react";
import { Input } from "../ui";
import { getSetting, setSetting } from "../../db/settings";
import {
  connectMpOauth,
  disconnectMpOauth,
  getMpConfigStatus,
  testPrinterConnection,
  type MpConfigStatus,
} from "../../lib/posIntegrations";
import { Button } from "../ui";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPosIntegrationsPanel({ onFlash }: Props) {
  const [mpStatus, setMpStatus] = useState<MpConfigStatus | null>(null);
  const [mpConnecting, setMpConnecting] = useState(false);
  const [printerEnabled, setPrinterEnabled] = useState(false);
  const [printerMode, setPrinterMode] = useState("network");
  const [printerHost, setPrinterHost] = useState("192.168.1.100");
  const [printerPort, setPrinterPort] = useState("9100");
  const [printerWidth, setPrinterWidth] = useState("42");

  const reloadMpStatus = useCallback(() => {
    getMpConfigStatus()
      .then(setMpStatus)
      .catch(() =>
        setMpStatus({
          enabled: false,
          configured: false,
          simulation: false,
          oauth_connected: false,
          oauth_available: false,
          nickname: null,
        }),
      );
  }, []);

  useEffect(() => {
    reloadMpStatus();
    Promise.all([
      getSetting("printer_enabled"),
      getSetting("printer_mode"),
      getSetting("printer_host"),
      getSetting("printer_port"),
      getSetting("printer_width"),
    ]).then(([pen, pmode, phost, pport, pwidth]) => {
      setPrinterEnabled(pen === "1");
      setPrinterMode(pmode ?? "network");
      setPrinterHost(phost ?? "192.168.1.100");
      setPrinterPort(pport ?? "9100");
      setPrinterWidth(pwidth ?? "42");
    });
  }, [reloadMpStatus]);

  useEffect(() => {
    const onFocus = () => reloadMpStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadMpStatus]);

  useEffect(() => {
    if (!mpConnecting) return;
    const id = window.setInterval(() => {
      getMpConfigStatus()
        .then((st) => {
          setMpStatus(st);
          if (st.oauth_connected && st.configured) {
            setMpConnecting(false);
            onFlash(
              st.nickname
                ? `Mercado Pago conectado como @${st.nickname}. Ya podés cobrar con QR.`
                : "Mercado Pago conectado. Ya podés cobrar con QR.",
            );
          }
        })
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(id);
  }, [mpConnecting, onFlash]);

  async function handleConnectMp() {
    setMpConnecting(true);
    try {
      const result = await connectMpOauth();
      await setSetting("mp_simulation", "0");
      reloadMpStatus();
      onFlash(`Mercado Pago conectado como ${result.nickname}. Ya podés cobrar con QR en el POS.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setMpConnecting(false);
    }
  }

  async function handleDisconnectMp() {
    if (!confirm("¿Desvincular la cuenta de Mercado Pago de esta PC?")) return;
    try {
      await disconnectMpOauth();
      reloadMpStatus();
      onFlash("Mercado Pago desvinculado");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleDemoMode(enabled: boolean) {
    await setSetting("mp_simulation", enabled ? "1" : "0");
    await setSetting("mp_enabled", enabled ? "1" : "0");
    if (enabled) {
      await setSetting("mp_access_token", "TEST");
      await setSetting("mp_external_pos_id", "DEMO");
    }
    reloadMpStatus();
    onFlash(
      enabled
        ? "Modo demostración activo: en el POS podés probar Mercado Pago QR sin cuenta real."
        : "Modo demostración desactivado",
    );
  }

  async function savePrinter() {
    await setSetting("printer_enabled", printerEnabled ? "1" : "0");
    await setSetting("printer_mode", printerMode);
    await setSetting("printer_host", printerHost.trim());
    await setSetting("printer_port", printerPort.trim() || "9100");
    await setSetting("printer_width", printerWidth.trim() || "42");
    onFlash("Impresora guardada");
  }

  const oauthConnected =
    (mpStatus?.oauth_connected && mpStatus?.configured) ?? false;
  const oauthIncomplete =
    (mpStatus?.oauth_connected && !mpStatus?.configured) ?? false;
  const demoActive = mpStatus?.simulation ?? false;

  return (
    <div className="space-y-8">
      <section>
        <h4 className="text-sm font-semibold text-ink">Mercado Pago — cobro con QR</h4>
        <p className="mt-1 text-xs text-ink-muted">
          Vinculá tu cuenta de Mercado Pago desde acá. No hace falta entrar a developers ni copiar
          claves: solo un clic, iniciar sesión en el navegador y listo.
        </p>

        <ol className="mt-4 space-y-2 text-sm text-ink-muted">
          <li className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700 dark:text-brand-300">
              1
            </span>
            <span>Pulsá «Conectar con Mercado Pago».</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700 dark:text-brand-300">
              2
            </span>
            <span>Iniciá sesión con tu cuenta de vendedor y autorizá la app.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-700 dark:text-brand-300">
              3
            </span>
            <span>En el POS elegí «Mercado Pago QR» al cobrar.</span>
          </li>
        </ol>

        {oauthIncomplete ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-ink">Cuenta autorizada, falta la caja QR</p>
            <p className="mt-1 text-xs text-ink-muted">
              La vinculación quedó a medias. Pulsá «Conectar con Mercado Pago» otra vez (dejá la app
              abierta) para crear la caja automáticamente.
            </p>
            <Button
              className="mt-3 w-full justify-center bg-[#009ee3] text-white hover:bg-[#0088c7] sm:w-auto"
              onClick={() => void handleConnectMp()}
              disabled={mpConnecting || demoActive}
            >
              {mpConnecting ? (
                <>
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Completando vinculación…
                </>
              ) : (
                <>
                  <ExternalLink size={18} className="mr-2" />
                  Completar conexión
                </>
              )}
            </Button>
          </div>
        ) : oauthConnected ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <div>
                  <p className="font-semibold text-ink">Cuenta conectada</p>
                  <p className="text-sm text-ink-muted">
                    {mpStatus?.nickname ? `@${mpStatus.nickname}` : "Mercado Pago vinculado"}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    La sucursal y la caja se crearon solas. El acceso se renueva automáticamente.
                  </p>
                </div>
              </div>
              <Button variant="secondary" onClick={() => void handleDisconnectMp()}>
                <Unplug size={16} className="mr-1.5 inline" />
                Desvincular
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {mpStatus?.oauth_available ? (
              <>
                <Button
                  className="w-full justify-center bg-[#009ee3] text-white hover:bg-[#0088c7] sm:w-auto"
                  onClick={() => void handleConnectMp()}
                  disabled={mpConnecting || demoActive}
                >
                  {mpConnecting ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Esperando autorización en el navegador…
                    </>
                  ) : (
                    <>
                      <ExternalLink size={18} className="mr-2" />
                      Conectar con Mercado Pago
                    </>
                  )}
                </Button>
                {mpConnecting && (
                  <p className="text-xs text-ink-muted">
                    Completá el login en el navegador. Cuando termines, esta pantalla se actualiza sola.
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-ink">
                Actualizá Gestión Comercios a la última versión para vincular Mercado Pago desde acá. Si
                ya estás actualizado, contactá soporte.
              </div>
            )}
          </div>
        )}

        {!oauthConnected && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-panel-border)] p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={demoActive}
              onChange={(e) => void toggleDemoMode(e.target.checked)}
              disabled={mpConnecting}
            />
            <span>
              <span className="block text-sm font-medium text-ink">Probar cobro QR (demostración)</span>
              <span className="block text-xs text-ink-muted">
                Sin cuenta de Mercado Pago. Sirve para practicar en el POS; el QR se aprueba solo en unos
                segundos.
              </span>
            </span>
          </label>
        )}
      </section>

      <section>
        <h4 className="text-sm font-semibold text-ink">Impresora térmica (ESC/POS)</h4>
        <p className="mt-1 text-xs text-ink-muted">
          Imprime ticket al finalizar venta. En efectivo también envía pulso para abrir el cajón. Red: IP
          puerto 9100 (Epson y compatibles).
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setPrinterEnabled(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              printerEnabled ? "bg-brand-600 text-white" : "border text-ink-muted"
            }`}
          >
            Activa
          </button>
          <button
            type="button"
            onClick={() => setPrinterEnabled(false)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              !printerEnabled ? "bg-[var(--color-panel)] ring-1 ring-brand-200" : "border text-ink-muted"
            }`}
          >
            Inactiva
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-muted">Modo</span>
            <select
              value={printerMode}
              onChange={(e) => setPrinterMode(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3 py-2.5"
            >
              <option value="network">Red (IP)</option>
              <option value="file">Archivo (prueba local)</option>
            </select>
          </label>
          <Input
            label="Ancho papel (caracteres)"
            value={printerWidth}
            onChange={(e) => setPrinterWidth(e.target.value)}
          />
          {printerMode === "network" && (
            <>
              <Input
                label="IP impresora"
                value={printerHost}
                onChange={(e) => setPrinterHost(e.target.value)}
              />
              <Input
                label="Puerto"
                value={printerPort}
                onChange={(e) => setPrinterPort(e.target.value)}
              />
            </>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void savePrinter()}>
            Guardar impresora
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await savePrinter();
                const msg = await testPrinterConnection();
                onFlash(msg);
              } catch (e) {
                alert(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Probar impresión y cajón
          </Button>
        </div>
      </section>
    </div>
  );
}
