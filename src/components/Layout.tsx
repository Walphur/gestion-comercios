import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import SubscriptionBanner from "./SubscriptionBanner";
import LanSyncIndicator from "./LanSyncIndicator";
import CatalogImportOverlay from "./CatalogImportOverlay";
import CatalogSetupWizard, { fetchCatalogWizardNeeded } from "./CatalogSetupWizard";
import RescheduleAlertWatcher from "./RescheduleAlertWatcher";
import { useAuth } from "../context/AuthContext";
import { checkAndInstallUpdate } from "../lib/updater";
import { getConnectionStatus } from "../lib/tauri";

const CASHIER_ROUTES = ["/pos", "/ventas", "/caja"];

export default function Layout() {
  const { user, loading, elevatedAdmin, revokeAdminElevation } = useAuth();
  const { pathname } = useLocation();
  const isPos = pathname === "/pos";
  const [wizardNeeded, setWizardNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!elevatedAdmin) return;
    if (CASHIER_ROUTES.includes(pathname)) {
      revokeAdminElevation();
    }
  }, [pathname, elevatedAdmin, revokeAdminElevation]);

  useEffect(() => {
    if (loading || !user) return;
    fetchCatalogWizardNeeded().then(setWizardNeeded).catch(() => setWizardNeeded(false));
  }, [loading, user]);

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
    <div className="flex h-screen w-screen overflow-hidden">
      <RescheduleAlertWatcher />
      <CatalogImportOverlay />
      <Sidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
        <SubscriptionBanner />
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
