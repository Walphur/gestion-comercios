import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Input, Switch } from "../ui";
import UsdRateCard from "../phone/UsdRateCard";
import PhoneTrialNotice, { usePhoneUnitQuota } from "../phone/PhoneTrialNotice";
import { useAppConfig } from "../../context/AppConfig";
import { getPhoneSettings } from "../../db/phoneUnits";
import { setSetting } from "../../db/settings";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPhoneStorePanel({ onFlash }: Props) {
  const cfg = useAppConfig();
  const [warrantyNew, setWarrantyNew] = useState("");
  const [warrantyUsed, setWarrantyUsed] = useState("");
  const { quota } = usePhoneUnitQuota();

  useEffect(() => {
    void getPhoneSettings().then((s) => {
      setWarrantyNew(String(s.warrantyNewMonths));
      setWarrantyUsed(String(s.warrantyUsedMonths));
    });
  }, []);

  async function saveMonths(key: string, raw: string) {
    const n = Math.max(0, Math.round(Number(raw) || 0));
    await setSetting(key, String(n));
    onFlash("Garantía guardada");
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Smartphone size={18} className="text-brand-600" />
            Venta de celulares
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            Cada equipo con su IMEI, garantía al vender, precios en dólares, toma de usados y reservas. Suma
            «Celulares» al menú.
          </p>
        </div>
        <Switch
          checked={cfg.phoneStore}
          onChange={(v) => void cfg.setPhoneStore(v).then(() => onFlash(v ? "Celulares activado" : "Celulares apagado"))}
        />
      </div>
      {cfg.phoneStore ? (
        <>
          <PhoneTrialNotice quota={quota} />
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Input
              label="Garantía de un equipo nuevo (meses)"
              type="number"
              min={0}
              value={warrantyNew}
              onChange={(e) => setWarrantyNew(e.target.value)}
              onBlur={() => void saveMonths("phone_warranty_new_months", warrantyNew)}
              hint="Se usa si el modelo no tiene otra."
            />
            <Input
              label="Garantía de un usado o reacondicionado (meses)"
              type="number"
              min={0}
              value={warrantyUsed}
              onChange={(e) => setWarrantyUsed(e.target.value)}
              onBlur={() => void saveMonths("phone_warranty_used_months", warrantyUsed)}
            />
          </div>
          <UsdRateCard currency={cfg.currency} canEdit />
        </>
      ) : null}
    </div>
  );
}
