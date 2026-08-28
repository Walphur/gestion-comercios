import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Package,
  Boxes,
  Users,
  BarChart3,
  Brain,
  FileText,
  Settings,
  Wallet,
  Shield,
  Moon,
  Sun,
  Calendar,
  ClipboardList,
  ClipboardCheck,
  Truck,
  Wrench,
  PanelLeft,
  CloudDownload,
  Calculator,
  type LucideIcon,
} from "lucide-react";
import { PRO_MODULES, getProModuleNavLabel, type ProModuleKey } from "../config/modules";
import { useAppConfig } from "../context/AppConfig";
import { useAuth, type Permission } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useUpdateAvailability } from "../context/UpdateAvailabilityContext";
import type { FeatureFlags } from "../types";
import InternetFooterStatus from "./InternetFooterStatus";
import VirtualAssistButton from "./VirtualAssistButton";
import CommunityGroupButton from "./CommunityGroupButton";
import WalTechCredit from "./WalTechCredit";
import AppVersionLabel from "./AppVersionLabel";
import ClockDisplay from "./ClockDisplay";
import CalculatorModal from "./CalculatorModal";
import SwitchCashierButton from "./SwitchCashierButton";
import ExitAdminModeButton from "./ExitAdminModeButton";
import { useAppearance } from "../context/AppearanceContext";
import { listStaffUsers } from "../db/users";
import { useRescheduleAlerts } from "../hooks/useRescheduleAlerts";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import type { AuthUser } from "../lib/tauri";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
};

const SIDEBAR_PIN_KEY = "wt_sidebar_expanded";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  feature?: keyof FeatureFlags;
  proModule?: ProModuleKey;
  permission?: Permission;
}

function proNavIcon(key: ProModuleKey, rubroId: string): LucideIcon {
  if (key === "quotes") return ClipboardList;
  if (key === "appointments") return Calendar;
  if (key === "delivery_notes") return Truck;
  if (key === "service_orders") {
    return rubroId === "taller" ? Wrench : ClipboardCheck;
  }
  return ClipboardList;
}

const ITEMS: NavItem[] = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/pos", label: "Punto de venta", icon: ShoppingCart, feature: "pos" },
  { to: "/ventas", label: "Ventas", icon: Receipt, feature: "pos" },
  { to: "/productos", label: "Productos", icon: Package, feature: "products" },
  { to: "/stock", label: "Stock", icon: Boxes, feature: "stock" },
  { to: "/clientes", label: "Clientes", icon: Users, feature: "customers" },
  { to: "/caja", label: "Caja", icon: Wallet },
  { to: "/reportes", label: "Reportes", icon: BarChart3, feature: "reports", permission: "view_reports" },
  { to: "/asistente", label: "Inteligencia", icon: Brain, feature: "reports", permission: "view_reports" },
  { to: "/facturacion", label: "Facturación", icon: FileText, feature: "invoicing" },
  { to: "/auditoria", label: "Auditoría", icon: Shield, permission: "view_audit" },
];

function navLinkClass(isActive: boolean, compact: boolean) {
  return `sidebar-nav-link ${isActive ? "sidebar-nav-link--active" : ""} ${
    compact ? "sidebar-nav-link--compact" : ""
  }`;
}

function sessionRoleHint(user: AuthUser, elevatedAdmin: boolean): string | null {
  if (elevatedAdmin) return "Modo administrador";
  const roleLabel = ROLE_LABEL[user.role] ?? user.role;
  if (roleLabel.localeCompare(user.display_name, "es", { sensitivity: "accent" }) === 0) {
    return null;
  }
  return roleLabel;
}

export default function Sidebar() {
  const navigate = useNavigate();
  const { businessName, rubroDef, features, isProModuleActive } = useAppConfig();
  const { can, user, elevatedAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { logoUrl, sidebarTitle } = useAppearance();
  const { latestVersion } = useUpdateAvailability();
  const { virtualAssist, businessIntelligence } = usePlanEntitlements();
  const [activeStaffCount, setActiveStaffCount] = useState(0);
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_PIN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [calcOpen, setCalcOpen] = useState(false);

  useEffect(() => {
    listStaffUsers()
      .then((rows) => setActiveStaffCount(rows.filter((u) => u.active).length))
      .catch(() => setActiveStaffCount(0));
  }, []);

  /** Solo se abre completa si el usuario la fija; por defecto queda en rail de íconos. */
  const expanded = pinned;
  const roleHint = user ? sessionRoleHint(user, elevatedAdmin) : null;
  const showSwitchEmployee = Boolean(user && activeStaffCount > 1);

  const visible = ITEMS.filter((i) => {
    if (i.to === "/asistente" && !businessIntelligence) return false;
    if (i.feature && !features[i.feature]) return false;
    if (i.permission && !can(i.permission)) return false;
    return true;
  });

  const proVisible = PRO_MODULES.filter((m) => isProModuleActive(m.key)).map((m) => ({
    to: m.route,
    label: getProModuleNavLabel(m.key, rubroDef.id),
    icon: proNavIcon(m.key, rubroDef.id),
    proModule: m.key,
  }));
  const { count: rescheduleCount } = useRescheduleAlerts(isProModuleActive("appointments"));

  function togglePin() {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_PIN_KEY, next ? "1" : "0");
      } catch {
        /* ok */
      }
      return next;
    });
  }

  return (
    <aside
      className={`sidebar-rail relative z-20 flex h-full shrink-0 flex-col text-white transition-[width] duration-200 ease-out ${
        expanded ? "sidebar-rail--expanded w-56" : "w-[4.25rem]"
      }`}
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

      <div
        className={`relative border-b border-white/10 ${expanded ? "px-3 py-4" : "px-2 py-3"}`}
      >
        <div className={`flex items-center ${expanded ? "gap-2" : "flex-col gap-2"}`}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className={`bg-transparent object-contain drop-shadow-md ${
                expanded ? "h-10 w-10 shrink-0" : "h-9 w-9"
              }`}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              className={`flex shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-white/90 ${
                expanded ? "h-10 w-10" : "h-9 w-9"
              }`}
              aria-hidden
            >
              {(businessName || "GC").trim().charAt(0).toUpperCase()}
            </div>
          )}
          {expanded && (
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold leading-tight tracking-tight">
                {businessName}
              </p>
              <p className="truncate text-[10px] font-medium text-brand-300/90">
                {sidebarTitle || `Modo ${rubroDef.label}`}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={togglePin}
            title={pinned ? "Volver a solo íconos" : "Abrir menú completo"}
            aria-label={pinned ? "Volver a solo íconos" : "Abrir menú completo"}
            aria-pressed={pinned}
            className={`shrink-0 rounded-lg p-1.5 transition-colors hover:bg-white/10 hover:text-white ${
              pinned ? "bg-white/15 text-white" : "text-brand-200/80"
            }`}
          >
            <PanelLeft size={15} />
          </button>
        </div>

        {expanded && user && (
          <div className="mt-3 flex items-center justify-between gap-2 px-0.5">
            <p className="min-w-0 truncate text-[11px] text-brand-200/70">
              {user.display_name}
              {roleHint && <span className="text-brand-300/60"> · {roleHint}</span>}
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
        {!expanded && (
          <button
            type="button"
            onClick={() => void toggleTheme()}
            title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
            className="mx-auto mt-2 flex rounded-lg p-1.5 text-brand-200/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        )}
        {expanded && user && (showSwitchEmployee || elevatedAdmin) && (
          <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] p-1">
            {showSwitchEmployee && <SwitchCashierButton variant="sidebar" />}
            {elevatedAdmin && <ExitAdminModeButton />}
            <p className="px-2 pb-1 pt-0.5 text-[9px] leading-snug text-white/35">
              También en Configuración → Sistema
            </p>
          </div>
        )}
      </div>

      <nav
        className={`relative flex-1 space-y-0.5 py-3 ${
          expanded ? "overflow-y-auto overflow-x-hidden px-2" : "overflow-visible px-1.5"
        }`}
      >
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => navLinkClass(isActive, !expanded)}
          >
            <Icon size={20} strokeWidth={2} className="shrink-0" />
            {expanded && <span className="min-w-0 flex-1 truncate">{label}</span>}
            {!expanded && <span className="sidebar-rail-tooltip">{label}</span>}
          </NavLink>
        ))}
        {proVisible.length > 0 && (
          <>
            {expanded && (
              <p className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-brand-300/70">
                Pro
              </p>
            )}
            {!expanded && <div className="my-2 mx-auto h-px w-6 bg-white/15" />}
            {proVisible.map(({ to, label, icon: Icon, proModule }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => navLinkClass(isActive, !expanded)}
              >
                <Icon size={20} strokeWidth={2} className="shrink-0" />
                {expanded && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {proModule === "appointments" && rescheduleCount > 0 && (
                      <span
                        className="ml-1 shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-950"
                        title="Clientes que quieren reprogramar"
                      >
                        {rescheduleCount}
                      </span>
                    )}
                  </>
                )}
                {!expanded && (
                  <>
                    {proModule === "appointments" && rescheduleCount > 0 && (
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400" />
                    )}
                    <span className="sidebar-rail-tooltip">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div
        className={`relative z-10 shrink-0 space-y-1 border-t border-white/10 py-2 ${
          expanded ? "px-2" : "px-1.5"
        }`}
      >
        {expanded && (
          <>
            <div className="px-2 pb-2">
              <ClockDisplay variant="card" />
            </div>
            <button
              type="button"
              onClick={() => setCalcOpen(true)}
              className={navLinkClass(false, false) + " w-full"}
            >
              <Calculator size={20} strokeWidth={2} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">Calculadora</span>
            </button>
            {virtualAssist && <VirtualAssistButton />}
            <CommunityGroupButton />
          </>
        )}
        <NavLink
          to="/admin"
          className={({ isActive }) => navLinkClass(isActive, !expanded)}
        >
          <Settings size={20} strokeWidth={2} className="shrink-0" />
          {expanded && <span className="min-w-0 flex-1 truncate">Configuración</span>}
          {!expanded && <span className="sidebar-rail-tooltip">Configuración</span>}
        </NavLink>
        {latestVersion && (
          <button
            type="button"
            onClick={() => navigate("/admin?section=system")}
            title={`Actualización v${latestVersion} disponible`}
            className={navLinkClass(false, !expanded) + " relative"}
          >
            <CloudDownload size={20} strokeWidth={2} className="shrink-0 text-sky-300" />
            {expanded && (
              <span className="min-w-0 flex-1 truncate text-sky-200">
                Actualizar v{latestVersion}
              </span>
            )}
            {!expanded && <span className="sidebar-rail-tooltip">Actualizar</span>}
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sky-400" />
          </button>
        )}
        {expanded && (
          <>
            <div className="flex items-end justify-between gap-2 px-1 pt-2">
              <WalTechCredit />
              <InternetFooterStatus />
            </div>
            <AppVersionLabel variant="sidebar" />
          </>
        )}
        {!expanded && (
          <div className="flex flex-col items-center gap-1 pt-1">
            <button
              type="button"
              onClick={() => setCalcOpen(true)}
              className="rounded-lg p-2 text-white/70 hover:bg-white/10"
              title="Calculadora"
            >
              <Calculator size={18} />
            </button>
            <InternetFooterStatus />
          </div>
        )}
      </div>
      <CalculatorModal open={calcOpen} onClose={() => setCalcOpen(false)} />
    </aside>
  );
}
