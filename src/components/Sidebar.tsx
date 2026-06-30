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
  Moon,
  Sun,
  Calendar,
  ClipboardList,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PRO_MODULES, type ProModuleKey } from "../config/modules";
import { useAppConfig } from "../context/AppConfig";
import { useAuth, type Permission } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import type { FeatureFlags } from "../types";
import InternetFooterStatus from "./InternetFooterStatus";
import SupportLegalLinks from "./SupportLegalLinks";
import VirtualAssistButton from "./VirtualAssistButton";
import CommunityGroupButton from "./CommunityGroupButton";
import WalTechCredit from "./WalTechCredit";
import AppVersionLabel from "./AppVersionLabel";
import SwitchCashierButton from "./SwitchCashierButton";
import { useAppearance } from "../context/AppearanceContext";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
};

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  feature?: keyof FeatureFlags;
  proModule?: ProModuleKey;
  permission?: Permission;
}

const PRO_NAV_ICONS: Record<ProModuleKey, LucideIcon> = {
  quotes: ClipboardList,
  appointments: Calendar,
  delivery_notes: Truck,
  service_orders: Wrench,
};

const ITEMS: NavItem[] = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/pos", label: "Punto de venta", icon: ShoppingCart, feature: "pos" },
  { to: "/ventas", label: "Ventas", icon: Receipt, feature: "pos" },
  { to: "/productos", label: "Productos", icon: Package, feature: "products" },
  { to: "/stock", label: "Stock", icon: Boxes, feature: "stock" },
  { to: "/clientes", label: "Clientes", icon: Users, feature: "customers" },
  { to: "/caja", label: "Caja", icon: Wallet },
  { to: "/reportes", label: "Reportes", icon: BarChart3, feature: "reports", permission: "view_reports" },
  { to: "/facturacion", label: "Facturación (ARCA)", icon: FileText, feature: "invoicing" },
  { to: "/auditoria", label: "Auditoría", icon: Shield, permission: "view_audit" },
];

const PRO_NAV: NavItem[] = PRO_MODULES.map((m) => ({
  to: m.route,
  label: m.label,
  icon: PRO_NAV_ICONS[m.key],
  proModule: m.key,
}));

function navLinkClass(isActive: boolean) {
  return `sidebar-nav-link ${isActive ? "sidebar-nav-link--active" : ""}`;
}

export default function Sidebar() {
  const { businessName, rubroDef, features, isProModuleActive } = useAppConfig();
  const { can, user, elevatedAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { logoUrl, sidebarTitle } = useAppearance();

  const visible = ITEMS.filter((i) => {
    if (i.feature && !features[i.feature]) return false;
    if (i.permission && !can(i.permission)) return false;
    return true;
  });

  const proVisible = PRO_NAV.filter(
    (i) => i.proModule && isProModuleActive(i.proModule),
  );

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
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] text-brand-200/70">
              {user.display_name}
              <span className="text-brand-300/60">
                {" "}
                · {elevatedAdmin ? "Modo administrador" : ROLE_LABEL[user.role] ?? user.role}
              </span>
            </p>
            <button
              type="button"
              onClick={() => void toggleTheme()}
              title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
              className="shrink-0 rounded-lg p-1.5 text-brand-200/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        )}
        {user && (
          <div className="mt-2">
            <SwitchCashierButton variant="sidebar" />
          </div>
        )}
      </div>

      <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-brand-300/60">
          Principal
        </p>
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => navLinkClass(isActive)}
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
        {proVisible.length > 0 && (
          <>
            <p className="mb-2 mt-4 px-3 text-[10px] font-semibold uppercase tracking-wider text-brand-300/70">
              Pro
            </p>
            {proVisible.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => navLinkClass(isActive)}>
                <Icon size={18} strokeWidth={2} />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="relative z-10 shrink-0 space-y-2 border-t border-white/10 px-3 py-3">
        <VirtualAssistButton />
        <CommunityGroupButton />
        <NavLink
          to="/admin"
          className={({ isActive }) => navLinkClass(isActive)}
        >
          <Settings size={18} strokeWidth={2} />
          Configuración
        </NavLink>
        <div className="flex items-end justify-between gap-2 px-2 pt-3">
          <WalTechCredit />
          <InternetFooterStatus />
        </div>
        <AppVersionLabel variant="sidebar" />
        <SupportLegalLinks variant="muted" className="px-1 pt-1" />
      </div>
    </aside>
  );
}
