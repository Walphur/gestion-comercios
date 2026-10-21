import { useCallback, useEffect, useState } from "react";
import { Lock, Smartphone } from "lucide-react";
import { Button } from "../ui";
import { useLicense } from "../../context/LicenseContext";
import { getPhoneUnitQuota, type PhoneUnitQuota } from "../../db/phoneUnits";
import { entitlementBlockedMessage } from "../../config/planEntitlements";
import { formatPriceArs, PRICE_BASIC_MONTHLY_ARS } from "../../config/pricing";
import { openSalesWhatsApp } from "../../lib/supportContact";

/** Equipos de prueba que quedan en Gratis y Permanente; null mientras carga. */
export function usePhoneUnitQuota(refreshKey?: unknown): { quota: PhoneUnitQuota | null; reload: () => void } {
  const { status } = useLicense();
  const [quota, setQuota] = useState<PhoneUnitQuota | null>(null);
  const reload = useCallback(() => {
    void getPhoneUnitQuota()
      .then(setQuota)
      .catch(() => setQuota(null));
  }, []);
  useEffect(() => {
    reload();
  }, [reload, status, refreshKey]);
  return { quota, reload };
}

export default function PhoneTrialNotice({ quota, className = "" }: { quota: PhoneUnitQuota | null; className?: string }) {
  if (!quota?.limited) return null;
  const blocked = quota.left <= 0;
  const upgrade = () =>
    void openSalesWhatsApp(
      `Hola! Quiero pasar a WalQo Completo (${formatPriceArs(PRICE_BASIC_MONTHLY_ARS)} por mes) para vender celulares sin límite de equipos.`,
    );
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm text-ink ${
        blocked ? "border-amber-500/30 bg-amber-500/10" : "border-sky-500/30 bg-sky-500/10"
      } ${className}`}
    >
      <p className="flex min-w-0 flex-1 items-start gap-2">
        {blocked ? (
          <Lock size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : (
          <Smartphone size={16} className="mt-0.5 shrink-0 text-sky-700 dark:text-sky-300" />
        )}
        <span className="min-w-0">
          {blocked
            ? entitlementBlockedMessage("phoneStore")
            : `Te ${quota.left === 1 ? "queda" : "quedan"} ${quota.left} de ${quota.max} equipos de prueba. Con WalQo Completo cargás todos los que quieras.`}
        </span>
      </p>
      <Button size="sm" variant={blocked ? "primary" : "secondary"} className="shrink-0" onClick={upgrade}>
        Pasar a WalQo Completo
      </Button>
    </div>
  );
}
