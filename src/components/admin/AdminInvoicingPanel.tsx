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
        <p className="mb-4 text-sm text-ink-muted">
          Al activar, cada venta encola la emisión del comprobante vía WSFEv1. Configurá certificado y
          ambiente en la sección ARCA antes de usar en producción.
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
