import { LayoutGrid } from "lucide-react";
import { Button } from "../ui";
import { entitlementBlockedMessage } from "../../config/planEntitlements";
import { formatPriceArs, PRICE_BASIC_MONTHLY_ARS } from "../../config/pricing";
import { openSalesWhatsApp } from "../../lib/supportContact";

/** Gratis y Permanente: mesas de prueba, con el pase a WalQo Completo. */
export default function TablesTrialNotice({ className = "" }: { className?: string }) {
  const upgrade = () =>
    void openSalesWhatsApp(
      `Hola! Quiero pasar a WalQo Completo (${formatPriceArs(PRICE_BASIC_MONTHLY_ARS)} por mes) para usar todas las mesas del salón.`,
    );
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-sm text-ink ${className}`}
    >
      <p className="flex min-w-0 flex-1 items-start gap-2">
        <LayoutGrid size={16} className="mt-0.5 shrink-0 text-sky-700 dark:text-sky-300" />
        <span className="min-w-0">{entitlementBlockedMessage("tables")}</span>
      </p>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={upgrade}>
        Pasar a WalQo Completo
      </Button>
    </div>
  );
}
