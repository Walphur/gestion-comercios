import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import SubscriptionBanner from "./SubscriptionBanner";
import FreePlanBanner from "./FreePlanBanner";
import LanSyncIndicator from "./LanSyncIndicator";
import CatalogImportOverlay from "./CatalogImportOverlay";
import CatalogSetupWizard, { fetchCatalogWizardNeeded } from "./CatalogSetupWizard";
import BusinessOnboarding, { fetchBusinessOnboardingNeeded } from "./BusinessOnboarding";
import AccountRegister from "./AccountRegister";
import RescheduleAlertWatcher from "./RescheduleAlertWatcher";
import { useAuth } from "../context/AuthContext";
import { useLicense } from "../context/LicenseContext";
import { checkAndInstallUpdate } from "../lib/updater";
import { getConnectionStatus } from "../lib/tauri";
import { getSetting } from "../db/settings";
import { isFreePlan } from "../config/pricing";

const CASHIER_ROUTES = ["/pos", "/ventas", "/caja"];

export default function Layout() {
  const { user, loading, elevatedAdmin, revokeAdminElevation } = useAuth();
  const { status: licenseStatus } = useLicense();
  const { pathname } = useLocation();
  const isPos = pathname === "/pos";
  const [onboardingNeeded, setOnboardingNeeded] = useState<boolean | null>(null);
  const [wizardNeeded, setWizardNeeded] = useState<boolean | null>(null);
  const [accountNeeded, setAccountNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!elevatedAdmin) return;
    if (CASHIER_ROUTES.includes(pathname)) {
      revokeAdminElevation();
    }
  }, [pathname, elevatedAdmin, revokeAdminElevation]);

  useEffect(() => {
    if (loading || !user) return;
    fetchBusinessOnboardingNeeded()
      .then(setOnboardingNeeded)
      .catch(() => setOnboardingNeeded(false));
  }, [loading, user]);

  useEffect(() => {
    if (loading || !user || onboardingNeeded !== false) return;
    fetchCatalogWizardNeeded().then(setWizardNeeded).catch(() => setWizardNeeded(false));
  }, [loading, user, onboardingNeeded]);

  useEffect(() => {
    if (loading || !user || onboardingNeeded !== false || wizardNeeded !== false) return;
    if (!isFreePlan(licenseStatus?.plan)) {
      setAccountNeeded(false);
      return;
    }
    getSetting("account_prompt_done")
      .then((v) => setAccountNeeded(v !== "1"))
      .catch(() => setAccountNeeded(false));
  }, [loading, user, onboardingNeeded, wizardNeeded, licenseStatus?.plan]);

  useEffect(() => {
    if (loading || !user) return;
    (async () => {
      try {
        const st = await getConnectionStatus();
        if (st.online) await checkAndInstallUpdate(true);
      } catch {
        /* updater opcional */
      }
    })();
  }, [loading, user]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (onboardingNeeded === null) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-muted">Cargando…</div>
    );
  }

  if (onboardingNeeded) {
    return (
      <BusinessOnboarding
        onFinished={() => {
          setOnboardingNeeded(false);
        }}
      />
    );
  }

  if (wizardNeeded === null) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-muted">Cargando…</div>
    );
  }

  if (wizardNeeded) {
    return (
      <CatalogSetupWizard
        onFinished={() => {
          setWizardNeeded(false);
        }}
      />
    );
  }

  if (accountNeeded === null) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-muted">Cargando…</div>
    );
  }

  if (accountNeeded) {
    return (
      <AccountRegister
        onDone={() => setAccountNeeded(false)}
        onSkip={() => setAccountNeeded(false)}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <RescheduleAlertWatcher />
      <CatalogImportOverlay />
      <Sidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
        <SubscriptionBanner />
        <FreePlanBanner />
        <div
          className={`min-h-0 flex-1 ${isPos ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          <Outlet />
        </div>
        <LanSyncIndicator />
      </main>
    </div>
  );
}
