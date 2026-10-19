import { useState } from "react";
import { AlertTriangle, Clock, X } from "lucide-react";
import { useLicense } from "../context/LicenseContext";
import { useAuth } from "../context/AuthContext";
import { useAppConfig } from "../context/AppConfig";
import { subscriptionAlert } from "../lib/licenseDisplay";
import { openSalesWhatsApp } from "../lib/supportContact";
import { todayYmd } from "../lib/format";
import {
  ANNUAL_PAID_MONTHS,
  QUARTER_DISCOUNT_PCT,
  formatPriceArs,
  suggestedPlanFor,
} from "../config/pricing";

const LEVEL_STYLES = {
  info: "border-b border-sky-500/35 bg-sky-500/10 text-ink",
  warn: "border-b border-amber-500/40 bg-amber-500/15 text-ink",
  critical: "border-b border-red-500/50 bg-red-500/15 text-ink",
} as const;

const ICON_STYLES = {
  info: "text-sky-600",
  warn: "text-amber-600",
  critical: "text-red-600",
} as const;

/** Se cierra solo por hoy: al día siguiente vuelve mientras siga por vencer. */
const HIDDEN_DAY_KEY = "walqo_plan_notice_hidden_day";

function hiddenToday(): boolean {
  try {
    return localStorage.getItem(HIDDEN_DAY_KEY) === todayYmd();
  } catch {
    return false;
  }
}

/** Aviso de plan o prueba por vencer, solo para el dueño. */
export default function SubscriptionBanner() {
  const { status } = useLicense();
  const { can } = useAuth();
  const { rubro } = useAppConfig();
  const [hidden, setHidden] = useState(hiddenToday);

  const alert = subscriptionAlert(status);
  if (!alert || hidden || !can("manage_admin")) return null;

  const isTrial = alert.kind === "trial";
  const plan = suggestedPlanFor(rubro);
  const offer = isTrial
    ? `${plan.name} cuesta ${formatPriceArs(plan.monthly)} por mes. Pagando 3 meses tenés ${QUARTER_DISCOUNT_PCT}% menos, y el año te sale 12 meses por ${ANNUAL_PAID_MONTHS}.`
    : `Pagando 3 meses tenés ${QUARTER_DISCOUNT_PCT}% menos, y el año te sale 12 meses por ${ANNUAL_PAID_MONTHS}.`;

  function contact() {
    void openSalesWhatsApp(
      isTrial
        ? `Hola! Estoy probando WalQo y quiero contratar ${plan.name}. ¿Me pasás cómo pagar 1 mes, 3 meses o el año?`
        : "Hola! Quiero renovar mi plan de WalQo. ¿Me pasás cómo pagar 1 mes, 3 meses o el año?",
    );
  }

  function hide() {
    setHidden(true);
    try {
      localStorage.setItem(HIDDEN_DAY_KEY, todayYmd());
    } catch {
      /* sin almacenamiento: se oculta hasta reabrir */
    }
  }

  const Icon = alert.level === "info" ? Clock : AlertTriangle;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 text-sm ${LEVEL_STYLES[alert.level]}`}
      role="status"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Icon size={16} className={`mt-0.5 shrink-0 ${ICON_STYLES[alert.level]}`} />
        <p className="min-w-0">
          <span className="font-semibold">{alert.message}</span>{" "}
          <span className="text-ink-muted">{offer}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={contact}
          className="rounded-lg bg-[#25D366] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1ebe57]"
        >
          {isTrial ? "Contratar por WhatsApp" : "Renovar por WhatsApp"}
        </button>
        <button
          type="button"
          onClick={hide}
          className="rounded-lg p-1 text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
          aria-label="Ocultar por hoy"
          title="Ocultar por hoy"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
