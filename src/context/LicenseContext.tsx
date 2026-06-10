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
  type LicenseStatus,
} from "../lib/license";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

interface LicenseContextValue {
  loading: boolean;
  status: LicenseStatus | null;
  activate: (key: string) => Promise<LicenseStatus>;
  refresh: () => Promise<LicenseStatus>;
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
    if (current.active) {
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
    const next = await refreshLicense();
    return applyStatus(next);
  }, [applyStatus]);

  useEffect(() => {
    if (!status?.active) return;

    const tick = () => {
      void refresh().catch(() => {
        // Sin internet: se mantiene la licencia local hasta agotar gracia offline.
      });
    };

    const interval = window.setInterval(tick, REFRESH_INTERVAL_MS);
    const onFocus = () => tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
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

  const value = useMemo(
    () => ({ loading, status, activate, refresh }),
    [loading, status, activate, refresh],
  );

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense debe usarse dentro de LicenseProvider");
  return ctx;
}
