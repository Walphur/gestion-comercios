import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import { peekAvailableUpdate } from "../lib/updater";
import { getConnectionStatus } from "../lib/tauri";

interface UpdateAvailabilityValue {
  latestVersion: string | null;
  currentVersion: string | null;
  checking: boolean;
  refresh: () => Promise<void>;
  clear: () => void;
}

const UpdateAvailabilityContext = createContext<UpdateAvailabilityValue | null>(null);

const POLL_MS = 30 * 60 * 1000;

export function UpdateAvailabilityProvider({ children }: { children: ReactNode }) {
  const { autoUpdates } = usePlanEntitlements();
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    if (!autoUpdates) {
      setLatestVersion(null);
      return;
    }
    setChecking(true);
    try {
      const st = await getConnectionStatus();
      if (!st.online) return;
      const peek = await peekAvailableUpdate({ autoUpdates: true });
      if (peek) {
        setLatestVersion(peek.version);
        setCurrentVersion(peek.currentVersion);
      } else {
        setLatestVersion(null);
      }
    } catch {
      /* ignore */
    } finally {
      setChecking(false);
    }
  }, [autoUpdates]);

  useEffect(() => {
    void refresh();
    if (!autoUpdates) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [autoUpdates, refresh]);

  const clear = useCallback(() => setLatestVersion(null), []);

  const value = useMemo(
    () => ({ latestVersion, currentVersion, checking, refresh, clear }),
    [latestVersion, currentVersion, checking, refresh, clear],
  );

  return (
    <UpdateAvailabilityContext.Provider value={value}>
      {children}
    </UpdateAvailabilityContext.Provider>
  );
}

export function useUpdateAvailability(): UpdateAvailabilityValue {
  const ctx = useContext(UpdateAvailabilityContext);
  if (!ctx) {
    return {
      latestVersion: null,
      currentVersion: null,
      checking: false,
      refresh: async () => {},
      clear: () => {},
    };
  }
  return ctx;
}
