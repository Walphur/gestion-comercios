import { AlertTriangle } from "lucide-react";
import { useLicense } from "../context/LicenseContext";
import { subscriptionWarning } from "../lib/licenseDisplay";
import { openSupportWhatsApp } from "../lib/supportContact";

export default function SubscriptionBanner() {
  const { status } = useLicense();
  const warning = subscriptionWarning(status);
  if (!warning) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-ink">
      <p className="flex items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-amber-600" />
        {warning}
      </p>
      <button
        type="button"
        onClick={() => void openSupportWhatsApp("renovar suscripción")}
        className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
      >
        Renovar por WhatsApp
      </button>
    </div>
  );
}
