import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import SubscriptionBanner from "./SubscriptionBanner";
import FreePlanBanner from "./FreePlanBanner";
import LanSyncIndicator from "./LanSyncIndicator";
import CatalogImportOverlay from "./CatalogImportOverlay";
import CatalogSetupWizard, { fetchCatalogWizardNeeded } from "./CatalogSetupWizard";
import BusinessOnboarding, { fetchBusinessOnboardingNeeded } from "./BusinessOnboarding";
import RescheduleAlertWatcher from "./RescheduleAlertWatcher";
import { useAuth } from "../context/AuthContext";
import UpdateAvailableBanner from "./UpdateAvailableBanner";
import { UpdateAvailabilityProvider } from "../context/UpdateAvailabilityContext";
import { startOwnerPortalPushLoop } from "../lib/ownerPortalPush";
import { startWorkshopPortalPushLoop } from "../lib/workshopPortalPush";

const CASHIER_ROUTES = ["/pos", "/ventas", "/caja"];

export default function Layout() {
  const { user, loading, elevatedAdmin, revokeAdminElevation } = useAuth();
  const { pathname } = useLocation();
  const isPos = pathname === "/pos";
  const [onboardingNeeded, setOnboardingNeeded] = useState<boolean | null>(null);
  const [wizardNeeded, setWizardNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!elevatedAdmin) return;
    if (CASHIER_ROUTES.includes(pathname)) {
      revokeAdminElevation();
    }
  }, [pathname, elevatedAdmin, revokeAdminElevation]);

  useEffect(() => {
    if (loading || !user) return;
    startOwnerPortalPushLoop();
    startWorkshopPortalPushLoop();
  }, [loading, user]);

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

  return (
    <UpdateAvailabilityProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <RescheduleAlertWatcher />
        <CatalogImportOverlay />
        <Sidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
          <SubscriptionBanner />
          <FreePlanBanner />
          <UpdateAvailableBanner />
          <div
            className={`min-h-0 min-w-0 flex-1 overflow-x-hidden ${isPos ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
          >
            <Outlet />
          </div>
          <LanSyncIndicator />
        </main>
      </div>
    </UpdateAvailabilityProvider>
  );
}
