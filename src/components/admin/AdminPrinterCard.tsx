import { useEffect, useMemo, useState } from "react";
import { Eye, Printer } from "lucide-react";
import { getSetting, setSetting } from "../../db/settings";
import { testPrinterConnection } from "../../lib/posIntegrations";
import { showUserError } from "../../lib/notice";
import { useAppConfig } from "../../context/AppConfig";
import { Button, Card, Input, SegmentToggle } from "../ui";

interface Props {
  onFlash: (msg: string) => void;
}

function padLine(left: string, right: string, width: number): string {
  const maxLeft = Math.max(0, width - right.length - 1);
  const L = left.length > maxLeft ? `${left.slice(0, Math.max(0, maxLeft - 1))}…` : left;
  const spaces = Math.max(1, width - L.length - right.length);
  return `${L}${" ".repeat(spaces)}${right}`;
}

export default function AdminPrinterCard({ onFlash }: Props) {
  const { businessName, currency } = useAppConfig();
  const [printerEnabled, setPrinterEnabled] = useState(false);
  const [printerMode, setPrinterMode] = useState("network");
  const [printerHost, setPrinterHost] = useState("192.168.1.100");
  const [printerPort, setPrinterPort] = useState("9100");
  const [printerWidth, setPrinterWidth] = useState("42");
  const [showDemo, setShowDemo] = useState(true);

  useEffect(() => {
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
  }, []);

  const width = Math.min(64, Math.max(24, Number(printerWidth) || 42));

  const ticketPreview = useMemo(() => {
    const line = "=".repeat(width);
    const dash = "-".repeat(width);
    const name = businessName || "Mi Comercio";
    const title = name.length > width ? `${name.slice(0, width - 1)}…` : name;
    const lines = [
      title.padStart(Math.floor((width + title.length) / 2)).padEnd(width),
      "Ticket de demostración".padStart(Math.floor((width + 22) / 2)).slice(0, width),
      line,
      padLine("1x Producto ejemplo", `${currency} 1.250`, width),
      padLine("2x Bebida demo", `${currency} 800`, width),
      dash,
      padLine("TOTAL", `${currency} 2.050`, width),
      dash,
      "Gracias por su compra".padStart(Math.floor((width + 20) / 2)).slice(0, width),
      printerMode === "network"
        ? `IP ${printerHost}:${printerPort || "9100"}`.slice(0, width)
        : "Modo archivo (prueba)".slice(0, width),
    ];
    return lines.join("\n");
  }, [businessName, currency, printerHost, printerMode, printerPort, width]);

  async function savePrinter() {
    await setSetting("printer_enabled", printerEnabled ? "1" : "0");
    await setSetting("printer_mode", printerMode);
    await setSetting("printer_host", printerHost.trim());
    await setSetting("printer_port", printerPort.trim() || "9100");
    await setSetting("printer_width", printerWidth.trim() || "42");
    onFlash("Impresora guardada");
  }

  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <Printer size={18} className="text-brand-600 dark:text-brand-300" />
        Impresora térmica (ESC/POS)
      </h3>
      <p className="mb-4 text-sm text-ink-muted">
        Imprime ticket al finalizar venta. En efectivo también envía pulso para abrir el cajón.
      </p>

      <SegmentToggle
        value={printerEnabled}
        onChange={setPrinterEnabled}
        onActiveLabel="Activa"
        offActiveLabel="Inactiva"
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            <Input label="Puerto" value={printerPort} onChange={(e) => setPrinterPort(e.target.value)} />
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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
              showUserError(e);
            }
          }}
        >
          Probar impresión y cajón
        </Button>
        <Button variant="secondary" onClick={() => setShowDemo((v) => !v)}>
          <Eye size={16} />
          {showDemo ? "Ocultar demo" : "Ver demo ticket"}
        </Button>
      </div>

      {showDemo && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--color-panel-border)] bg-slate-950 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Vista previa · {width} caracteres
          </p>
          <pre className="max-w-full overflow-x-auto whitespace-pre font-mono text-[11px] leading-relaxed text-emerald-300">
            {ticketPreview}
          </pre>
        </div>
      )}
    </Card>
  );
}
