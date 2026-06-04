import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSetting, setSetting } from "../db/settings";
import { applyBrandSurfacesForTheme } from "../config/branding";

export type ThemeMode = "light" | "dark";

interface ThemeValue {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");

  useEffect(() => {
    (async () => {
      const stored = await getSetting("ui_theme");
      const mode: ThemeMode = stored === "dark" ? "dark" : "light";
      setThemeState(mode);
      applyTheme(mode);
      applyBrandSurfacesForTheme(mode === "dark");
    })();
  }, []);

  const setTheme = useCallback(async (t: ThemeMode) => {
    setThemeState(t);
    applyTheme(t);
    applyBrandSurfacesForTheme(t === "dark");
    await setSetting("ui_theme", t);
  }, []);

  const toggleTheme = useCallback(async () => {
    await setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de ThemeProvider");
  return ctx;
}
