import { useEffect, useState } from "react";
import { Input } from "../ui";
import { getSetting, setSetting } from "../../db/settings";
import { getMpConfigStatus, testPrinterConnection } from "../../lib/posIntegrations";
import { Button } from "../ui";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPosIntegrationsPanel({ onFlash }: Props) {
  const [mpEnabled, setMpEnabled] = useState(false);
  const [mpSimulation, setMpSimulation] = useState(false);
  const [mpToken, setMpToken] = useState("");
  const [mpPosId, setMpPosId] = useState("CAJA1");
  const [printerEnabled, setPrinterEnabled] = useState(false);
  const [printerMode, setPrinterMode] = useState("network");
  const [printerHost, setPrinterHost] = useState("192.168.1.100");
  const [printerPort, setPrinterPort] = useState("9100");
  const [printerWidth, setPrinterWidth] = useState("42");

  useEffect(() => {
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
  }, []);

  async function saveMp() {
    await setSetting("mp_enabled", mpEnabled ? "1" : "0");
    await setSetting("mp_simulation", mpSimulation ? "1" : "0");
    await setSetting("mp_access_token", mpToken.trim());
    await setSetting("mp_external_pos_id", mpPosId.trim() || "CAJA1");
    const st = await getMpConfigStatus();
    onFlash(
      st.enabled && st.configured
        ? "Mercado Pago guardado y listo"
        : "Mercado Pago guardado (revisá token y POS)",
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

  return (
    <div className="space-y-8">
      <section>
        <h4 className="text-sm font-semibold text-ink">Mercado Pago — QR dinámico</h4>
        <p className="mt-1 text-xs text-ink-muted">
          Al cobrar con «Mercado Pago QR» en el POS se genera un código por el monto de la venta. Necesitás
          Access Token de producción y el ID del punto de venta (caja) creado en Mercado Pago.
        </p>
        <div className="mt-3 flex gap-2">
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
          Modo prueba (sin API real; QR simulado que se aprueba solo)
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            label="Access Token"
            type="password"
            value={mpToken}
            onChange={(e) => setMpToken(e.target.value)}
            placeholder="APP_USR-… o TEST"
          />
          <Input
            label="ID caja Mercado Pago (external_pos_id)"
            value={mpPosId}
            onChange={(e) => setMpPosId(e.target.value)}
            placeholder="CAJA1"
          />
        </div>
        <Button className="mt-3" variant="secondary" onClick={() => void saveMp()}>
          Guardar Mercado Pago
        </Button>
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
