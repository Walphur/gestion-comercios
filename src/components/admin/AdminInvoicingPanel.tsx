import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../../db/settings";
import { Card, SegmentToggle } from "../ui";
import AdminMercadoPagoCard from "./AdminMercadoPagoCard";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminInvoicingPanel({ onFlash }: Props) {
  const [fiscalEnabled, setFiscalEnabled] = useState(false);

  useEffect(() => {
    getSetting("fiscal_enabled").then((v) => setFiscalEnabled(v === "1"));
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
          <FileText size={18} className="text-brand-600" />
          Facturación electrónica
        </h3>
        <p className="mb-2 text-sm text-ink-muted">
          Activá la emisión de comprobantes fiscales cuando tu comercio esté habilitado en ARCA.
        </p>
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Consultá con soporte WalTech el estado de tu integración fiscal antes de activar en producción.
        </p>
        <SegmentToggle
          value={fiscalEnabled}
          onChange={async (v) => {
            setFiscalEnabled(v);
            await setSetting("fiscal_enabled", v ? "1" : "0");
            onFlash(v ? "Facturación activada" : "Facturación desactivada");
          }}
        />
      </Card>

      <AdminMercadoPagoCard onFlash={onFlash} />
    </div>
  );
}
