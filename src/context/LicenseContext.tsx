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

  const load = useCallback(async () => {
    let current = await getLicenseStatus();
    if (current.active) {
      try {
        current = await refreshLicense();
      } catch {
        // Mantener estado local si no hay internet.
      }
    }
    setStatus(current);
    setLoading(false);
    return current;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activate = useCallback(async (key: string) => {
    const next = await activateLicense(key);
    setStatus(next);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    const next = await refreshLicense();
    setStatus(next);
    return next;
  }, []);

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
