import { useLocation, useNavigate } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/** Vuelve del modo administrador (cajero que ingresó PIN en Configuración) al rol normal. */
export default function ExitAdminModeButton({ className = "" }: { className?: string }) {
  const { user, elevatedAdmin, revokeAdminElevation } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!user || !elevatedAdmin || user.role === "admin") return null;

  function handleExit() {
    revokeAdminElevation();
    if (pathname.startsWith("/admin")) {
      navigate("/", { replace: true });
    }
  }

  return (
    <button
      type="button"
      onClick={handleExit}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[11px] font-medium text-red-300/70 transition-colors hover:bg-red-500/10 hover:text-red-200/90 ${className}`}
    >
      <ShieldOff size={13} strokeWidth={2} />
      Salir del modo administrador
    </button>
  );
}
