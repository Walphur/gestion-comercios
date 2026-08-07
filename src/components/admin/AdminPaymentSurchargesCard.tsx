import { useEffect, useState } from "react";
import { Percent } from "lucide-react";
import { Button, Card, Input } from "../ui";
import {
  loadPaymentSurcharges,
  savePaymentSurcharges,
  SURCHARGE_METHOD_LABELS,
  SURCHARGE_METHODS,
  type PaymentSurchargeMap,
} from "../../lib/paymentSurcharges";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPaymentSurchargesCard({ onFlash }: Props) {
  const [map, setMap] = useState<PaymentSurchargeMap>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadPaymentSurcharges().then(setMap);
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await savePaymentSurcharges(map);
      onFlash("Recargos por medio de pago guardados");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <Percent size={18} className="text-brand-600" />
        Recargos por medio de pago
      </h3>
      <p className="mb-4 text-sm text-ink-muted">
        Porcentajes que el POS aplica al elegir el medio (ej. crédito +10%). Efectivo y fiado no
        llevan recargo. El cajero puede cambiar el ajuste a mano en la venta.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SURCHARGE_METHODS.map((method) => (
          <Input
            key={method}
            label={`${SURCHARGE_METHOD_LABELS[method] ?? method} (%)`}
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={map[method] ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              setMap((prev) => {
                const next = { ...prev };
                if (raw === "") {
                  delete next[method];
                } else {
                  next[method] = Number(raw);
                }
                return next;
              });
            }}
            placeholder="0"
          />
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Guardando…" : "Guardar recargos"}
        </Button>
      </div>
    </Card>
  );
}
