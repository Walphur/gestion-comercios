import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { getSetting, setSetting } from "../../db/settings";
import { testPrinterConnection } from "../../lib/posIntegrations";
import { Button, Card, Input, SegmentToggle } from "../ui";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPrinterCard({ onFlash }: Props) {
  const [printerEnabled, setPrinterEnabled] = useState(false);
  const [printerMode, setPrinterMode] = useState("network");
  const [printerHost, setPrinterHost] = useState("192.168.1.100");
  const [printerPort, setPrinterPort] = useState("9100");
  const [printerWidth, setPrinterWidth] = useState("42");

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
              alert(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Probar impresión y cajón
        </Button>
      </div>
    </Card>
  );
}
