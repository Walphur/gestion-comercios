import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  activateLicense,
  getLicenseStatus,
  refreshLicense,
  skipTrialOffer,
  startTrialLicense,
  type LicenseStatus,
} from "../lib/license";
import { subscriptionAlert } from "../lib/licenseDisplay";
import { showNotice, showUserError, showUserSuccess } from "../lib/notice";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
/** Plan por vencer o vencido: se consulta seguido para que el pago se note enseguida. */
const DUE_REFRESH_INTERVAL_MS = 2 * 60 * 1000;

function planDue(status: LicenseStatus | null): boolean {
  const alert = subscriptionAlert(status);
  return alert?.kind === "monthly" && (alert.daysLeft == null || alert.daysLeft <= 3);
}

function paymentRegistered(prev: LicenseStatus | null, next: LicenseStatus): boolean {
  if (!prev || !planDue(prev) || !next.active) return false;
  return next.billing !== "free" && next.billing !== "trial" && !planDue(next);
}

interface LicenseContextValue {
  loading: boolean;
  status: LicenseStatus | null;
  activate: (key: string) => Promise<LicenseStatus>;
  refresh: () => Promise<LicenseStatus>;
  startTrial: () => Promise<LicenseStatus>;
  skipTrialOffer: () => Promise<LicenseStatus>;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LicenseStatus | null>(null);

  const statusRef = useRef<LicenseStatus | null>(null);

  const applyStatus = useCallback((next: LicenseStatus) => {
    if (paymentRegistered(statusRef.current, next)) {
      showUserSuccess("Se registró el pago: tu plan volvió a estar activo.");
    }
    statusRef.current = next;
    setStatus(next);
    return next;
  }, []);

  const load = useCallback(async () => {
    // Estado local primero (rápido). El refresh online va diferido para no
    // trabar el arranque ni las primeras navegaciones.
    const current = await getLicenseStatus();
    applyStatus(current);
    setLoading(false);

    if (current.active && !current.is_trial) {
      window.setTimeout(() => {
        void refreshLicense()
          .then(applyStatus)
          .catch(() => {
            // Mantener estado local si no hay internet.
          });
      }, 8000);
    }
    return current;
  }, [applyStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    const next = status?.is_trial ? await getLicenseStatus() : await refreshLicense();
    return applyStatus(next);
  }, [applyStatus, status?.is_trial]);

  const due = planDue(status);

  useEffect(() => {
    if (!status?.active) return;

    // NO refrescar en focus/visibility: cada refresh pegaba HTTP con la base
    // abierta y congelaba la UI al cambiar de sección.
    const interval = window.setInterval(() => {
      void refresh().catch(() => {
        // Sin internet: se mantiene la licencia local hasta agotar gracia offline.
      });
    }, due ? DUE_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [status?.active, due, refresh]);

  const activate = useCallback(
    async (key: string) => {
      const next = await activateLicense(key);
      return applyStatus(next);
    },
    [applyStatus],
  );

  const startTrial = useCallback(async () => {
    const next = await startTrialLicense();
    return applyStatus(next);
  }, [applyStatus]);

  const skipTrialOfferFn = useCallback(async () => {
    const next = await skipTrialOffer();
    return applyStatus(next);
  }, [applyStatus]);

  const value = useMemo(
    () => ({
      loading,
      status,
      activate,
      refresh,
      startTrial,
      skipTrialOffer: skipTrialOfferFn,
    }),
    [loading, status, activate, refresh, startTrial, skipTrialOfferFn],
  );

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense debe usarse dentro de LicenseProvider");
  return ctx;
}

/** Botón «Ya pagué»: consulta la licencia al momento. Devuelve true si el plan ya quedó al día. */
export function usePaymentCheck() {
  const { status, refresh } = useLicense();
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    const before = status;
    setChecking(true);
    try {
      const next = await refresh();
      const extended =
        before?.billing === "monthly" &&
        (next.days_until_expiry ?? 0) > (before.days_until_expiry ?? 0);
      const paid =
        next.active &&
        next.billing !== "free" &&
        next.billing !== "trial" &&
        (subscriptionAlert(next) == null || extended);
      if (paid) {
        if (!paymentRegistered(before, next)) {
          showUserSuccess("Se registró el pago: tu plan está al día.");
        }
        return true;
      }
      showNotice({
        title: "Pago pendiente",
        message: "Todavía no figura el pago. Si ya lo hiciste, en unos minutos se actualiza solo.",
        variant: "info",
      });
      return false;
    } catch (e) {
      showUserError(e, "No se pudo consultar el plan");
      return false;
    } finally {
      setChecking(false);
    }
  }, [status, refresh]);

  return { checking, check };
}
