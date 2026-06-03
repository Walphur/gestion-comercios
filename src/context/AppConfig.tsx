import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { countActiveProducts, seedDemoCatalog } from "../db/demo";
import { getAllSettings, setSetting } from "../db/settings";
import { RUBROS, resolveFeatures, type RubroDefinition } from "../config/rubros";
import type { FeatureFlags, Rubro } from "../types";

interface AppConfigValue {
  loading: boolean;
  rubro: Rubro;
  rubroDef: RubroDefinition;
  businessName: string;
  currency: string;
  adminPin: string;
  features: FeatureFlags;
  featureOverrides: Partial<FeatureFlags>;
  setRubro: (r: Rubro) => Promise<void>;
  setBusinessName: (name: string) => Promise<void>;
  setCurrency: (c: string) => Promise<void>;
  setAdminPin: (pin: string) => Promise<void>;
  setFeatureOverride: (key: keyof FeatureFlags, value: boolean | null) => Promise<void>;
  reload: () => Promise<void>;
}

const AppConfigContext = createContext<AppConfigValue | null>(null);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [rubro, setRubroState] = useState<Rubro>("general");
  const [businessName, setBusinessNameState] = useState("Mi Comercio");
  const [currency, setCurrencyState] = useState("$");
  const [adminPin, setAdminPinState] = useState("1234");
  const [featureOverrides, setFeatureOverrides] = useState<Partial<FeatureFlags>>({});

  const load = useCallback(async () => {
    const s = await getAllSettings();
    const r = (s.rubro as Rubro) in RUBROS ? (s.rubro as Rubro) : "general";
    setRubroState(r);
    setBusinessNameState(s.business_name ?? "Mi Comercio");
    setCurrencyState(s.currency ?? "$");
    setAdminPinState(s.admin_pin ?? "1234");
    try {
      setFeatureOverrides(JSON.parse(s.feature_overrides ?? "{}"));
    } catch {
      setFeatureOverrides({});
    }
    const count = await countActiveProducts();
    if (count === 0) {
      await seedDemoCatalog();
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setRubro = useCallback(async (r: Rubro) => {
    await setSetting("rubro", r);
    setRubroState(r);
  }, []);

  const setBusinessName = useCallback(async (name: string) => {
    await setSetting("business_name", name);
    setBusinessNameState(name);
  }, []);

  const setCurrency = useCallback(async (c: string) => {
    await setSetting("currency", c);
    setCurrencyState(c);
  }, []);

  const setAdminPin = useCallback(async (pin: string) => {
    await setSetting("admin_pin", pin);
    setAdminPinState(pin);
  }, []);

  const setFeatureOverride = useCallback(
    async (key: keyof FeatureFlags, value: boolean | null) => {
      setFeatureOverrides((prev) => {
        const next = { ...prev };
        if (value === null) delete next[key];
        else next[key] = value;
        void setSetting("feature_overrides", JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const value = useMemo<AppConfigValue>(() => {
    return {
      loading,
      rubro,
      rubroDef: RUBROS[rubro],
      businessName,
      currency,
      adminPin,
      featureOverrides,
      features: resolveFeatures(rubro, featureOverrides),
      setRubro,
      setBusinessName,
      setCurrency,
      setAdminPin,
      setFeatureOverride,
      reload: load,
    };
  }, [
    loading,
    rubro,
    businessName,
    currency,
    adminPin,
    featureOverrides,
    setRubro,
    setBusinessName,
    setCurrency,
    setAdminPin,
    setFeatureOverride,
    load,
  ]);

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfigValue {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error("useAppConfig debe usarse dentro de AppConfigProvider");
  return ctx;
}
