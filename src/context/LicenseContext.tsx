import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

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

  const applyStatus = useCallback((next: LicenseStatus) => {
    setStatus(next);
    return next;
  }, []);

  const load = useCallback(async () => {
    let current = await getLicenseStatus();
    if (current.active && !current.is_trial) {
      try {
        current = await refreshLicense();
      } catch {
        // Mantener estado local si no hay internet.
      }
    }
    applyStatus(current);
    setLoading(false);
    return current;
  }, [applyStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    const next = status?.is_trial ? await getLicenseStatus() : await refreshLicense();
    return applyStatus(next);
  }, [applyStatus, status?.is_trial]);

  useEffect(() => {
    if (!status?.active) return;

    const tick = () => {
      void refresh().catch(() => {
        // Sin internet: se mantiene la licencia local hasta agotar gracia offline.
      });
    };

    // Menos agresivo: evita pelear el lock SQLite mientras el usuario opera.
    const interval = window.setInterval(tick, REFRESH_INTERVAL_MS);
    let focusTimer: number | null = null;
    const onFocus = () => {
      if (focusTimer != null) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(tick, 2500);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      if (focusTimer != null) window.clearTimeout(focusTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status?.active, refresh]);

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
