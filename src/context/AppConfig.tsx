import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getAllSettings, setSetting } from "../db/settings";
import {
  DEFAULT_PRO_MODULES,
  parseProModules,
  proModuleEnabled,
  type ProModuleKey,
  type ProModulesState,
} from "../config/modules";
import { RUBROS, resolveFeatures, type RubroDefinition } from "../config/rubros";
import { useLicense } from "./LicenseContext";
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
  proPlanEnabled: boolean;
  proModules: ProModulesState;
  isProModuleActive: (key: ProModuleKey) => boolean;
  setRubro: (r: Rubro) => Promise<void>;
  setProPlanEnabled: (on: boolean) => Promise<void>;
  setProModule: (key: ProModuleKey, on: boolean) => Promise<void>;
  setBusinessName: (name: string) => Promise<void>;
  setCurrency: (c: string) => Promise<void>;
  setAdminPin: (pin: string) => Promise<void>;
  setFeatureOverride: (key: keyof FeatureFlags, value: boolean | null) => Promise<void>;
  reload: () => Promise<void>;
}

const AppConfigContext = createContext<AppConfigValue | null>(null);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const { status: licenseStatus } = useLicense();
  const licensedPro = licenseStatus?.pro_enabled ?? false;
  const [loading, setLoading] = useState(true);
  const [rubro, setRubroState] = useState<Rubro>("general");
  const [businessName, setBusinessNameState] = useState("Mi Comercio");
  const [currency, setCurrencyState] = useState("$");
  const [adminPin, setAdminPinState] = useState("1234");
  const [featureOverrides, setFeatureOverrides] = useState<Partial<FeatureFlags>>({});
  const [proPlanEnabled, setProPlanEnabledState] = useState(false);
  const [proModules, setProModulesState] = useState<ProModulesState>(DEFAULT_PRO_MODULES);

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
    setProPlanEnabledState(s.pro_plan_enabled === "1");
    setProModulesState(parseProModules(s.pro_modules));
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

  const setProPlanEnabled = useCallback(async (on: boolean) => {
    if (!on) {
      const off = { ...DEFAULT_PRO_MODULES };
      setProModulesState(off);
      await setSetting("pro_modules", JSON.stringify(off));
    }
    await setSetting("pro_plan_enabled", on ? "1" : "0");
    setProPlanEnabledState(on);
  }, []);

  const setProModule = useCallback(async (key: ProModuleKey, on: boolean) => {
    setProModulesState((prev) => {
      const next = { ...prev, [key]: on };
      void setSetting("pro_modules", JSON.stringify(next));
      return next;
    });
  }, []);

  const isProModuleActive = useCallback(
    (key: ProModuleKey) =>
      licensedPro && proModuleEnabled(proPlanEnabled, proModules, key),
    [licensedPro, proPlanEnabled, proModules],
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
      proPlanEnabled,
      proModules,
      isProModuleActive,
      setRubro,
      setBusinessName,
      setCurrency,
      setAdminPin,
      setFeatureOverride,
      setProPlanEnabled,
      setProModule,
      reload: load,
    };
  }, [
    loading,
    rubro,
    businessName,
    currency,
    adminPin,
    featureOverrides,
    proPlanEnabled,
    proModules,
    isProModuleActive,
    setRubro,
    setBusinessName,
    setCurrency,
    setAdminPin,
    setFeatureOverride,
    setProPlanEnabled,
    setProModule,
    load,
  ]);

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfigValue {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error("useAppConfig debe usarse dentro de AppConfigProvider");
  return ctx;
}
