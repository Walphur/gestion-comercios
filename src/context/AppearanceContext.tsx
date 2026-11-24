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
  applyAppearanceColors,
  applyUiDensity,
  appearanceToSettings,
  BRAND_PRESETS,
  DEFAULT_COLORS,
  findMatchingPresetId,
  normalizeHex,
  parseBrandAppearance,
  type AppearanceColors,
  type AppearanceSlot,
  type BrandAppearance,
  type UiDensity,
} from "../config/branding";
import { getAllSettings, setSetting } from "../db/settings";
import {
  getBusinessLogoUrl,
  pickAndSaveBusinessLogo,
  removeBusinessLogo,
} from "../lib/brandingApi";
import { scheduleMenuPortalPush } from "../lib/menuPortalPush";
import { scheduleWorkshopPortalPush } from "../lib/workshopPortalPush";

interface AppearanceValue extends BrandAppearance {
  logoUrl: string | null;
  loading: boolean;
  setPrimaryColor: (hex: string, presetId?: string) => Promise<void>;
  setSlotColor: (slot: AppearanceSlot, hex: string) => Promise<void>;
  applyPreset: (presetId: string) => Promise<void>;
  setDensity: (d: UiDensity) => Promise<void>;
  setSidebarTagline: (text: string) => Promise<void>;
  setShowSidebarClock: (show: boolean) => Promise<void>;
  uploadLogo: () => Promise<void>;
  clearLogo: () => Promise<void>;
  resetBranding: () => Promise<void>;
  resetSlot: (slot: AppearanceSlot) => Promise<void>;
  reload: () => Promise<void>;
  colors: AppearanceColors;
}

const AppearanceContext = createContext<AppearanceValue | null>(null);

/** Un data URL (logo en WalQo Web) se rompe si se le agrega una query. */
function withCacheBust(url: string): string {
  if (url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

function colorsFromState(s: {
  primary: string;
  sidebar: string;
  accent: string;
  pageBgLight: string;
  pageBgDark: string;
  surfaceLight: string;
  surfaceDark: string;
}): AppearanceColors {
  return {
    primary: s.primary,
    sidebar: s.sidebar,
    accent: s.accent,
    pageBgLight: s.pageBgLight,
    pageBgDark: s.pageBgDark,
    surfaceLight: s.surfaceLight,
    surfaceDark: s.surfaceDark,
  };
}

async function persistColors(colors: AppearanceColors, presetId: string): Promise<void> {
  const map = appearanceToSettings(colors, presetId);
  for (const [key, value] of Object.entries(map)) {
    await setSetting(key, value);
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [primary, setPrimary] = useState(DEFAULT_COLORS.primary);
  const [sidebar, setSidebar] = useState(DEFAULT_COLORS.sidebar);
  const [accent, setAccent] = useState(DEFAULT_COLORS.accent);
  const [pageBgLight, setPageBgLight] = useState(DEFAULT_COLORS.pageBgLight);
  const [pageBgDark, setPageBgDark] = useState(DEFAULT_COLORS.pageBgDark);
  const [surfaceLight, setSurfaceLight] = useState(DEFAULT_COLORS.surfaceLight);
  const [surfaceDark, setSurfaceDark] = useState(DEFAULT_COLORS.surfaceDark);
  const [presetId, setPresetId] = useState("classic");
  const [density, setDensityState] = useState<UiDensity>("comfortable");
  const [sidebarTitle, setSidebarTitle] = useState("");
  const [showSidebarClock, setShowSidebarClockState] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await getAllSettings();
    const brand = parseBrandAppearance(s);
    setPrimary(brand.primary);
    setSidebar(brand.sidebar);
    setAccent(brand.accent);
    setPageBgLight(brand.pageBgLight);
    setPageBgDark(brand.pageBgDark);
    setSurfaceLight(brand.surfaceLight);
    setSurfaceDark(brand.surfaceDark);
    setPresetId(brand.presetId);
    setDensityState(brand.density);
    setSidebarTitle(brand.sidebarTitle);
    setShowSidebarClockState(brand.showSidebarClock);
    applyAppearanceColors(brand);
    applyUiDensity(brand.density);

    // Migración silenciosa: escribe keys nuevas si faltaban (mantiene primary viejo).
    const needsMigrate =
      !s.brand_sidebar ||
      !s.brand_accent ||
      !s.brand_page_bg_light ||
      !s.brand_page_bg_dark ||
      !s.brand_surface_light ||
      !s.brand_surface_dark ||
      s.brand_preset === "blue" ||
      s.brand_preset === "teal" ||
      s.brand_preset === "orange" ||
      s.brand_preset === "rose";
    if (needsMigrate) {
      await persistColors(brand, brand.presetId);
    }

    try {
      const raw = await getBusinessLogoUrl();
      setLogoUrl(raw ? withCacheBust(raw) : null);
    } catch {
      setLogoUrl(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const commitColors = useCallback(async (next: AppearanceColors, forcePreset?: string) => {
    const nextPreset = forcePreset ?? findMatchingPresetId(next);
    setPrimary(next.primary);
    setSidebar(next.sidebar);
    setAccent(next.accent);
    setPageBgLight(next.pageBgLight);
    setPageBgDark(next.pageBgDark);
    setSurfaceLight(next.surfaceLight);
    setSurfaceDark(next.surfaceDark);
    setPresetId(nextPreset);
    applyAppearanceColors(next);
    await persistColors(next, nextPreset);
  }, []);

  const setPrimaryColor = useCallback(
    async (hex: string, preset = "custom") => {
      const normalized = normalizeHex(hex);
      if (!normalized) return;
      const current = colorsFromState({
        primary,
        sidebar,
        accent,
        pageBgLight,
        pageBgDark,
        surfaceLight,
        surfaceDark,
      });
      await commitColors({ ...current, primary: normalized }, preset === "custom" ? undefined : preset);
    },
    [primary, sidebar, accent, pageBgLight, pageBgDark, surfaceLight, surfaceDark, commitColors],
  );

  const setSlotColor = useCallback(
    async (slot: AppearanceSlot, hex: string) => {
      const normalized = normalizeHex(hex);
      if (!normalized) return;
      const isDark = document.documentElement.classList.contains("dark");
      const current = colorsFromState({
        primary,
        sidebar,
        accent,
        pageBgLight,
        pageBgDark,
        surfaceLight,
        surfaceDark,
      });
      const next = { ...current };
      switch (slot) {
        case "primary":
          next.primary = normalized;
          break;
        case "sidebar":
          next.sidebar = normalized;
          break;
        case "accent":
          next.accent = normalized;
          break;
        case "pageBg":
          if (isDark) next.pageBgDark = normalized;
          else next.pageBgLight = normalized;
          break;
        case "surface":
          if (isDark) next.surfaceDark = normalized;
          else next.surfaceLight = normalized;
          break;
      }
      await commitColors(next);
    },
    [primary, sidebar, accent, pageBgLight, pageBgDark, surfaceLight, surfaceDark, commitColors],
  );

  const applyPreset = useCallback(
    async (id: string) => {
      const preset = BRAND_PRESETS.find((p) => p.id === id);
      if (!preset) return;
      const { id: _id, label: _label, ...colors } = preset;
      await commitColors(colors, id);
    },
    [commitColors],
  );

  const resetSlot = useCallback(
    async (slot: AppearanceSlot) => {
      const classic = BRAND_PRESETS.find((p) => p.id === "classic")!;
      const isDark = document.documentElement.classList.contains("dark");
      const current = colorsFromState({
        primary,
        sidebar,
        accent,
        pageBgLight,
        pageBgDark,
        surfaceLight,
        surfaceDark,
      });
      const next = { ...current };
      switch (slot) {
        case "primary":
          next.primary = classic.primary;
          break;
        case "sidebar":
          next.sidebar = classic.sidebar;
          break;
        case "accent":
          next.accent = classic.accent;
          break;
        case "pageBg":
          if (isDark) next.pageBgDark = classic.pageBgDark;
          else next.pageBgLight = classic.pageBgLight;
          break;
        case "surface":
          if (isDark) next.surfaceDark = classic.surfaceDark;
          else next.surfaceLight = classic.surfaceLight;
          break;
      }
      await commitColors(next);
    },
    [primary, sidebar, accent, pageBgLight, pageBgDark, surfaceLight, surfaceDark, commitColors],
  );

  const setDensity = useCallback(async (d: UiDensity) => {
    setDensityState(d);
    applyUiDensity(d);
    await setSetting("ui_density", d);
  }, []);

  const setSidebarTagline = useCallback(async (text: string) => {
    setSidebarTitle(text);
    await setSetting("sidebar_tagline", text.trim());
  }, []);

  const setShowSidebarClock = useCallback(async (show: boolean) => {
    setShowSidebarClockState(show);
    await setSetting("sidebar_show_clock", show ? "1" : "0");
  }, []);

  const uploadLogo = useCallback(async () => {
    const url = await pickAndSaveBusinessLogo();
    if (url) {
      setLogoUrl(withCacheBust(url));
      scheduleMenuPortalPush();
      scheduleWorkshopPortalPush();
    }
  }, []);

  const clearLogo = useCallback(async () => {
    await removeBusinessLogo();
    setLogoUrl(null);
    scheduleMenuPortalPush();
    scheduleWorkshopPortalPush();
  }, []);

  const resetBranding = useCallback(async () => {
    const classic = BRAND_PRESETS.find((p) => p.id === "classic")!;
    const { id: _id, label: _label, ...colors } = classic;
    await commitColors(colors, "classic");
    await setDensity("comfortable");
    await setSidebarTagline("");
    await setShowSidebarClock(false);
    await clearLogo();
  }, [commitColors, setDensity, setSidebarTagline, setShowSidebarClock, clearLogo]);

  const colors = useMemo(
    () =>
      colorsFromState({
        primary,
        sidebar,
        accent,
        pageBgLight,
        pageBgDark,
        surfaceLight,
        surfaceDark,
      }),
    [primary, sidebar, accent, pageBgLight, pageBgDark, surfaceLight, surfaceDark],
  );

  const value = useMemo<AppearanceValue>(
    () => ({
      primary,
      sidebar,
      accent,
      pageBgLight,
      pageBgDark,
      surfaceLight,
      surfaceDark,
      presetId,
      density,
      sidebarTitle,
      showSidebarClock,
      logoUrl,
      loading,
      colors,
      setPrimaryColor,
      setSlotColor,
      applyPreset,
      setDensity,
      setSidebarTagline,
      setShowSidebarClock,
      uploadLogo,
      clearLogo,
      resetBranding,
      resetSlot,
      reload: load,
    }),
    [
      primary,
      sidebar,
      accent,
      pageBgLight,
      pageBgDark,
      surfaceLight,
      surfaceDark,
      presetId,
      density,
      sidebarTitle,
      showSidebarClock,
      logoUrl,
      loading,
      colors,
      setPrimaryColor,
      setSlotColor,
      applyPreset,
      setDensity,
      setSidebarTagline,
      setShowSidebarClock,
      uploadLogo,
      clearLogo,
      resetBranding,
      resetSlot,
      load,
    ],
  );

  return (
    <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance debe usarse dentro de AppearanceProvider");
  return ctx;
}
