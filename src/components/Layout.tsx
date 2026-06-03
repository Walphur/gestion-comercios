import { Navigate, Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import CatalogImportOverlay from "./CatalogImportOverlay";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const isPos = pathname === "/pos";

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <CatalogImportOverlay />
      <Sidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
        <div
          className={`min-h-0 flex-1 ${isPos ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
