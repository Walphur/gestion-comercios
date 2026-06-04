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
  applyBrandColors,
  applyUiDensity,
  BRAND_PRESETS,
  DEFAULT_BRAND_PRIMARY,
  parseBrandAppearance,
  type BrandAppearance,
  type UiDensity,
} from "../config/branding";
import { getAllSettings, setSetting } from "../db/settings";
import {
  getBusinessLogoUrl,
  pickAndSaveBusinessLogo,
  removeBusinessLogo,
} from "../lib/brandingApi";

interface AppearanceValue extends BrandAppearance {
  logoUrl: string | null;
  loading: boolean;
  setPrimaryColor: (hex: string, presetId?: string) => Promise<void>;
  applyPreset: (presetId: string) => Promise<void>;
  setDensity: (d: UiDensity) => Promise<void>;
  setSidebarTagline: (text: string) => Promise<void>;
  uploadLogo: () => Promise<void>;
  clearLogo: () => Promise<void>;
  resetBranding: () => Promise<void>;
  reload: () => Promise<void>;
}

const AppearanceContext = createContext<AppearanceValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [primary, setPrimary] = useState(DEFAULT_BRAND_PRIMARY);
  const [presetId, setPresetId] = useState("teal");
  const [density, setDensityState] = useState<UiDensity>("comfortable");
  const [sidebarTitle, setSidebarTitle] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = await getAllSettings();
    const brand = parseBrandAppearance(s);
    setPrimary(brand.primary);
    setPresetId(brand.presetId);
    setDensityState(brand.density);
    setSidebarTitle(brand.sidebarTitle);
    applyBrandColors(brand.primary);
    applyUiDensity(brand.density);
    try {
      const raw = await getBusinessLogoUrl();
      setLogoUrl(raw ? `${raw}${raw.includes("?") ? "&" : "?"}t=${Date.now()}` : null);
    } catch {
      setLogoUrl(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setPrimaryColor = useCallback(async (hex: string, preset = "custom") => {
    const normalized = hex.startsWith("#") ? hex : `#${hex}`;
    setPrimary(normalized);
    setPresetId(preset);
    applyBrandColors(normalized);
    await setSetting("brand_primary", normalized);
    await setSetting("brand_preset", preset);
  }, []);

  const applyPreset = useCallback(
    async (id: string) => {
      const preset = BRAND_PRESETS.find((p) => p.id === id);
      if (!preset) return;
      await setPrimaryColor(preset.primary, id);
    },
    [setPrimaryColor],
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

  const uploadLogo = useCallback(async () => {
    const url = await pickAndSaveBusinessLogo();
    if (url) setLogoUrl(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`);
  }, []);

  const clearLogo = useCallback(async () => {
    await removeBusinessLogo();
    setLogoUrl(null);
  }, []);

  const resetBranding = useCallback(async () => {
    await setPrimaryColor(DEFAULT_BRAND_PRIMARY, "teal");
    await setDensity("comfortable");
    await setSidebarTagline("");
    await clearLogo();
  }, [setPrimaryColor, setDensity, setSidebarTagline, clearLogo]);

  const value = useMemo<AppearanceValue>(
    () => ({
      primary,
      presetId,
      density,
      sidebarTitle,
      logoUrl,
      loading,
      setPrimaryColor,
      applyPreset,
      setDensity,
      setSidebarTagline,
      uploadLogo,
      clearLogo,
      resetBranding,
      reload: load,
    }),
    [
      primary,
      presetId,
      density,
      sidebarTitle,
      logoUrl,
      loading,
      setPrimaryColor,
      applyPreset,
      setDensity,
      setSidebarTagline,
      uploadLogo,
      clearLogo,
      resetBranding,
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
