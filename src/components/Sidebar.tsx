import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Package,
  Boxes,
  Users,
  BarChart3,
  FileText,
  Settings,
  Wallet,
  Shield,
  UserCog,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useAppConfig } from "../context/AppConfig";
import { useAuth, type Permission } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import type { FeatureFlags } from "../types";
import SyncStatusBadge from "./SyncStatusBadge";
import WalTechCredit from "./WalTechCredit";
import { useAppearance } from "../context/AppearanceContext";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  feature?: keyof FeatureFlags;
  permission?: Permission;
}

const ITEMS: NavItem[] = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/pos", label: "Punto de venta", icon: ShoppingCart, feature: "pos" },
  { to: "/ventas", label: "Ventas", icon: Receipt, feature: "pos" },
  { to: "/productos", label: "Productos", icon: Package, feature: "products" },
  { to: "/stock", label: "Stock", icon: Boxes, feature: "stock" },
  { to: "/clientes", label: "Clientes", icon: Users, feature: "customers" },
  { to: "/caja", label: "Caja", icon: Wallet },
  { to: "/empleados", label: "Empleados", icon: UserCog, permission: "manage_users" },
  { to: "/reportes", label: "Reportes", icon: BarChart3, feature: "reports", permission: "view_reports" },
  { to: "/facturacion", label: "Facturación (ARCA)", icon: FileText, feature: "invoicing" },
  { to: "/auditoria", label: "Auditoría", icon: Shield, permission: "view_audit" },
];

export default function Sidebar() {
  const { businessName, rubroDef, features } = useAppConfig();
  const { can, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { logoUrl, sidebarTitle } = useAppearance();

  const visible = ITEMS.filter((i) => {
    if (i.feature && !features[i.feature]) return false;
    if (i.permission && !can(i.permission)) return false;
    return true;
  });

  return (
    <aside
      className="relative flex h-full w-64 flex-col text-white"
      style={{
        backgroundImage:
          "linear-gradient(to bottom, var(--color-brand-900), var(--color-brand-950) 55%, var(--color-brand-950))",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% -10%, var(--brand-glow, var(--color-brand-400)) 0%, transparent 55%)",
        }}
      />

      <div className="relative border-b border-white/10 px-5 py-5">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="mb-4 h-24 w-full max-w-[240px] bg-transparent object-contain object-left drop-shadow-md"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
        <p className="font-display text-lg font-semibold leading-tight tracking-tight truncate">
          {businessName}
        </p>
        <p className="mt-1 text-xs font-medium text-brand-300/90">
          {sidebarTitle || `Modo ${rubroDef.label}`}
        </p>
        {user && (
          <p className="mt-2 truncate text-[11px] text-brand-200/70">{user.display_name}</p>
        )}
      </div>

      <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-brand-500/25 text-white ring-1 ring-brand-400/40"
                  : "text-brand-100/90 hover:bg-white/8 hover:text-white"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="relative z-10 shrink-0 space-y-2 border-t border-white/10 px-3 py-3">
        <button
          type="button"
          onClick={() => void toggleTheme()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-200/80 transition-colors hover:bg-white/8 hover:text-white"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {theme === "dark" ? "Tema claro" : "Tema oscuro"}
        </button>
        <SyncStatusBadge />
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-white/12 text-white"
                : "text-brand-200/80 hover:bg-white/8 hover:text-white"
            }`
          }
        >
          <Settings size={18} />
          Administración
        </NavLink>
        <div className="px-2 pt-3">
          <WalTechCredit />
        </div>
      </div>
    </aside>
  );
}
