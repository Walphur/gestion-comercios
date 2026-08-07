import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface WelcomeContextValue {
  forceWelcome: boolean;
  openWelcome: () => void;
  closeWelcome: () => void;
}

const WelcomeContext = createContext<WelcomeContextValue | null>(null);

export function WelcomeProvider({ children }: { children: ReactNode }) {
  const [forceWelcome, setForceWelcome] = useState(false);

  const openWelcome = useCallback(() => setForceWelcome(true), []);
  const closeWelcome = useCallback(() => setForceWelcome(false), []);

  const value = useMemo(
    () => ({ forceWelcome, openWelcome, closeWelcome }),
    [forceWelcome, openWelcome, closeWelcome],
  );

  return <WelcomeContext.Provider value={value}>{children}</WelcomeContext.Provider>;
}

export function useWelcome(): WelcomeContextValue {
  const ctx = useContext(WelcomeContext);
  if (!ctx) throw new Error("useWelcome debe usarse dentro de WelcomeProvider");
  return ctx;
}
