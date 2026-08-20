import { Lock } from "lucide-react";
import { Button } from "./ui";
import { openSalesWhatsApp } from "../lib/supportContact";
import type { PlanEntitlementKey } from "../config/planEntitlements";
import { entitlementBlockedMessage } from "../config/planEntitlements";

interface Props {
  feature: PlanEntitlementKey;
  className?: string;
  compact?: boolean;
}

/** Aviso cuando una función está en el plan mensual / Pro+. */
export default function PlanUpsellNotice({ feature, className = "", compact }: Props) {
  const message = entitlementBlockedMessage(feature);
  return (
    <div
      className={`rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-ink ${className}`}
    >
      <p className={`flex gap-2 ${compact ? "items-start" : "items-center"}`}>
        <Lock size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>{message}</span>
      </p>
      {!compact && (
        <div className="mt-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void openSalesWhatsApp(
                "Hola! Tengo licencia permanente y quiero pasar al plan mensual de WalQo.",
              )
            }
          >
            Consultar plan mensual
          </Button>
        </div>
      )}
    </div>
  );
}
