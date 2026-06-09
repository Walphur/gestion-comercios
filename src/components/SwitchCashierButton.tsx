import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui";

interface Props {
  variant?: "sidebar" | "inline";
  className?: string;
}

/** Cierra sesión para que otro empleado entre con su usuario y PIN. */
export default function SwitchCashierButton({ variant = "inline", className = "" }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  function handleSwitch() {
    logout();
    navigate("/login", { replace: true });
  }

  if (variant === "sidebar") {
    return (
      <button
        type="button"
        onClick={handleSwitch}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-medium text-brand-200/80 transition-colors hover:bg-white/8 hover:text-white ${className}`}
      >
        <LogOut size={14} />
        Cambiar empleado ({user.display_name})
      </button>
    );
  }

  return (
    <Button variant="secondary" onClick={handleSwitch} className={className}>
      <LogOut size={16} /> Cambiar empleado
    </Button>
  );
}
