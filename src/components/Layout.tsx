import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import CatalogImportOverlay from "./CatalogImportOverlay";
import WalTechCredit from "./WalTechCredit";
import { useAuth } from "../context/AuthContext";
import { checkAndInstallUpdate } from "../lib/updater";
import { getConnectionStatus } from "../lib/tauri";

export default function Layout() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const isPos = pathname === "/pos";

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

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <CatalogImportOverlay />
      <Sidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
        <header className="flex shrink-0 items-center justify-end border-b border-[var(--color-panel-border)] bg-[var(--color-panel)] px-5 py-2">
          <WalTechCredit variant="header" />
        </header>
        <div
          className={`min-h-0 flex-1 ${isPos ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
