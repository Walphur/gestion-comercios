import { AlertTriangle } from "lucide-react";
import { useLicense } from "../context/LicenseContext";
import { subscriptionWarning } from "../lib/licenseDisplay";
import { openSalesWhatsApp, openSupportWhatsApp } from "../lib/supportContact";

export default function SubscriptionBanner() {
  const { status } = useLicense();
  const warning = subscriptionWarning(status);
  if (!warning) return null;

  const isTrial = status?.is_trial || status?.billing === "trial";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-ink">
      <p className="flex items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-amber-600" />
        {warning}
      </p>
      <button
        type="button"
        onClick={() => void (isTrial ? openSalesWhatsApp() : openSupportWhatsApp("renovar suscripción"))}
        className="rounded-lg bg-[#25D366] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1ebe57]"
      >
        {isTrial ? "Contratar por WhatsApp" : "Renovar por WhatsApp"}
      </button>
    </div>
  );
}
