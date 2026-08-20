import { useMemo } from "react";
import { useLicense } from "../context/LicenseContext";
import {
  entitlementBlockedMessage,
  resolvePlanEntitlements,
  type PlanEntitlementKey,
  type PlanEntitlements,
} from "../config/planEntitlements";

export function usePlanEntitlements(): PlanEntitlements & {
  can: (key: PlanEntitlementKey) => boolean;
  denyMessage: (key: PlanEntitlementKey) => string;
  isPermanent: boolean;
  isMonthly: boolean;
} {
  const { status } = useLicense();
  const entitlements = useMemo(() => resolvePlanEntitlements(status), [status]);

  return {
    ...entitlements,
    can: (key) => entitlements[key],
    denyMessage: entitlementBlockedMessage,
    isPermanent: status?.billing === "perpetual",
    isMonthly: status?.billing === "monthly",
  };
}
