import { Navigate, Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import SyncStatusBadge from "./SyncStatusBadge";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-surface">
        <Outlet />
      </main>
      <SyncStatusBadge />
    </div>
  );
}
