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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mpEnabled, setMpEnabled] = useState(false);
  const [mpSimulation, setMpSimulation] = useState(false);
  const [mpToken, setMpToken] = useState("");
  const [mpPosId, setMpPosId] = useState("CAJA1");
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
      getSetting("mp_enabled"),
      getSetting("mp_simulation"),
      getSetting("mp_access_token"),
      getSetting("mp_external_pos_id"),
      getSetting("printer_enabled"),
      getSetting("printer_mode"),
      getSetting("printer_host"),
      getSetting("printer_port"),
      getSetting("printer_width"),
    ]).then(([en, sim, tok, pos, pen, pmode, phost, pport, pwidth]) => {
      setMpEnabled(en === "1");
      setMpSimulation(sim === "1");
      setMpToken(tok ?? "");
      setMpPosId(pos ?? "CAJA1");
      setPrinterEnabled(pen === "1");
      setPrinterMode(pmode ?? "network");
      setPrinterHost(phost ?? "192.168.1.100");
      setPrinterPort(pport ?? "9100");
      setPrinterWidth(pwidth ?? "42");
    });
  }, [reloadMpStatus]);

  async function handleConnectMp() {
    setMpConnecting(true);
    try {
      const result = await connectMpOauth();
      setMpEnabled(true);
      setMpPosId(result.external_pos_id);
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
      setMpEnabled(false);
      setMpToken("");
      reloadMpStatus();
      onFlash("Mercado Pago desvinculado");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveMpManual() {
    await setSetting("mp_enabled", mpEnabled ? "1" : "0");
    await setSetting("mp_simulation", mpSimulation ? "1" : "0");
    await setSetting("mp_access_token", mpToken.trim());
    await setSetting("mp_external_pos_id", mpPosId.trim() || "CAJA1");
    reloadMpStatus();
    const st = await getMpConfigStatus();
    onFlash(
      st.enabled && st.configured
        ? "Mercado Pago guardado y listo"
        : "Mercado Pago guardado (revisá token y caja)",
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

  const oauthConnected = mpStatus?.oauth_connected ?? false;

  return (
    <div className="space-y-8">
      <section>
        <h4 className="text-sm font-semibold text-ink">Mercado Pago — QR dinámico</h4>
        <p className="mt-1 text-xs text-ink-muted">
          Cobrá en el POS con un código QR por cada venta. Conectá tu cuenta en un paso: la app crea la
          sucursal y la caja en Mercado Pago automáticamente.
        </p>

        {oauthConnected ? (
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
                    En el POS elegí «Mercado Pago QR» al cobrar. El token se renueva solo.
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
                  disabled={mpConnecting}
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
                <p className="text-xs text-ink-muted">
                  Se abrirá el navegador para que inicies sesión y autorices la app. No hace falta copiar
                  tokens ni crear cajas a mano.
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-ink">
                La conexión en un clic estará disponible en la próxima actualización del instalador. Por
                ahora usá la configuración manual más abajo.
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="mt-4 text-xs font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Ocultar configuración manual" : "Configuración manual o modo prueba"}
        </button>

        {showAdvanced && (
          <div className="mt-3 rounded-xl border border-[var(--color-panel-border)] bg-brand-50/50 p-4 dark:bg-brand-900/20">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMpEnabled(true)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  mpEnabled ? "bg-brand-600 text-white" : "border text-ink-muted"
                }`}
              >
                Activo
              </button>
              <button
                type="button"
                onClick={() => setMpEnabled(false)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  !mpEnabled ? "bg-[var(--color-panel)] ring-1 ring-brand-200" : "border text-ink-muted"
                }`}
              >
                Inactivo
              </button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={mpSimulation}
                onChange={(e) => setMpSimulation(e.target.checked)}
              />
              Modo prueba (QR simulado que se aprueba solo)
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                label="Access Token (manual)"
                type="password"
                value={mpToken}
                onChange={(e) => setMpToken(e.target.value)}
                placeholder="APP_USR-… o TEST"
              />
              <Input
                label="ID caja (external_pos_id)"
                value={mpPosId}
                onChange={(e) => setMpPosId(e.target.value)}
                placeholder="CAJA1"
              />
            </div>
            <Button className="mt-3" variant="secondary" onClick={() => void saveMpManual()}>
              Guardar configuración manual
            </Button>
          </div>
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
