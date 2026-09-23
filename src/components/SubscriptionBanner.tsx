import { AlertTriangle } from "lucide-react";
import { useLicense } from "../context/LicenseContext";
import { subscriptionAlert } from "../lib/licenseDisplay";
import { openSalesWhatsApp, openSupportWhatsApp } from "../lib/supportContact";

const LEVEL_STYLES = {
  info: "border-b border-sky-500/35 bg-sky-500/10 text-ink",
  warn: "border-b border-amber-500/40 bg-amber-500/15 text-ink",
  critical: "border-b border-red-500/50 bg-red-500/15 text-ink font-medium",
} as const;

const ICON_STYLES = {
  info: "text-sky-600",
  warn: "text-amber-600",
  critical: "text-red-600",
} as const;

export default function SubscriptionBanner() {
  const { status } = useLicense();
  const alert = subscriptionAlert(status);
  if (!alert) return null;

  const isTrial = status?.is_trial || status?.billing === "trial";
  const showCta = alert.level === "warn" || alert.level === "critical" || isTrial;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm ${LEVEL_STYLES[alert.level]}`}
      role="status"
    >
      <p className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={16} className={`shrink-0 ${ICON_STYLES[alert.level]}`} />
        <span className="min-w-0">{alert.message}</span>
      </p>
      {showCta ? (
        <button
          type="button"
          onClick={() => void (isTrial ? openSalesWhatsApp() : openSupportWhatsApp("renovar suscripción"))}
          className="shrink-0 rounded-lg bg-[#25D366] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1ebe57]"
        >
          {isTrial ? "Contratar por WhatsApp" : "Renovar por WhatsApp"}
        </button>
      ) : null}
    </div>
  );
}
