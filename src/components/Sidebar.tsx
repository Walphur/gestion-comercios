import { Fragment, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  ReceiptText,
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
  CalendarClock,
  ClipboardList,
  ClipboardCheck,
  Truck,
  Wrench,
  Sparkles,
  HeartPulse,
  PanelLeft,
  CloudDownload,
  HandCoins,
  Handshake,
  Landmark,
  CircleHelp,
  ChevronDown,
  Smartphone,
  Armchair,
  type LucideIcon,
} from "lucide-react";
import { PRO_MODULES, getProModuleNavLabel, type ProModuleKey } from "../config/modules";
import { useAppConfig } from "../context/AppConfig";
import { useAuth, type Permission } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useUpdateAvailability } from "../context/UpdateAvailabilityContext";
import type { FeatureFlags } from "../types";
import InternetFooterStatus from "./InternetFooterStatus";
import WalTechCredit from "./WalTechCredit";
import AppVersionLabel from "./AppVersionLabel";
import SwitchCashierButton from "./SwitchCashierButton";
import ExitAdminModeButton from "./ExitAdminModeButton";
import { useAppearance } from "../context/AppearanceContext";
import { listStaffUsers } from "../db/users";
import { useRescheduleAlerts } from "../hooks/useRescheduleAlerts";
import { useWebOrders } from "../hooks/useWebOrders";
import { useTableAlerts } from "../hooks/useTableAlerts";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import { checkAndInstallUpdate } from "../lib/updater";
import { showUserError } from "../lib/notice";
import type { AuthUser } from "../lib/tauri";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
};

const SIDEBAR_PIN_KEY = "wt_sidebar_expanded";
const SIDEBAR_GROUPS_KEY = "wt_sidebar_groups";

type NavGroupId = "catalogo" | "plata" | "trabajos" | "mas";

/** Lo que no está en ningún grupo (Inicio, Punto de venta) queda suelto arriba. */
const NAV_GROUPS: { id: NavGroupId; label: string; routes: string[] }[] = [
  {
    id: "catalogo",
    label: "Productos y clientes",
    routes: [
      "/productos",
      "/productos?vista=servicios",
      "/celulares",
      "/stock",
      "/proveedores",
      "/clientes",
      "/obras-sociales",
    ],
  },
  {
    id: "plata",
    label: "Caja y números",
    routes: ["/caja", "/gastos", "/tesoreria", "/ventas", "/reportes", "/comisiones", "/facturacion"],
  },
  { id: "trabajos", label: "Trabajos", routes: [] },
  { id: "mas", label: "Más", routes: ["/asistente", "/auditoria"] },
];

function readOpenGroups(): NavGroupId[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SIDEBAR_GROUPS_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((id): id is NavGroupId => NAV_GROUPS.some((g) => g.id === id))
      : [];
  } catch {
    return [];
  }
}

function saveOpenGroups(ids: NavGroupId[]) {
  try {
    localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(ids));
  } catch {
    /* ok */
  }
}

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

function workGroupLabel(items: NavItem[]): string {
  const keys = items.map((i) => i.proModule);
  if (keys.includes("appointments")) return "Turnos y trabajos";
  if (keys.every((k) => k === "quotes" || k === "delivery_notes")) return "Presupuestos y remitos";
  return "Trabajos";
}

const ITEMS: NavItem[] = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/pos", label: "Punto de venta", icon: ShoppingCart, feature: "pos" },
  { to: "/ventas", label: "Ventas", icon: Receipt, feature: "pos" },
  { to: "/productos", label: "Productos", icon: Package, feature: "products" },
  { to: "/stock", label: "Stock", icon: Boxes, feature: "stock" },
  { to: "/proveedores", label: "Proveedores", icon: Handshake, feature: "stock", permission: "manage_products" },
  { to: "/clientes", label: "Clientes", icon: Users, feature: "customers" },
  { to: "/caja", label: "Caja", icon: Wallet },
  { to: "/gastos", label: "Gastos", icon: ReceiptText, permission: "view_reports" },
  { to: "/tesoreria", label: "Tesorería", icon: Landmark, permission: "view_reports" },
  { to: "/reportes", label: "Reportes", icon: BarChart3, feature: "reports", permission: "view_reports" },
  { to: "/asistente", label: "Sugerencias", icon: Brain, feature: "reports", permission: "view_reports" },
  { to: "/facturacion", label: "Facturación", icon: FileText, feature: "invoicing" },
  { to: "/auditoria", label: "Historial", icon: Shield, permission: "view_audit" },
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
  const { businessName, rubroDef, features, isProModuleActive, phoneStore, tablesEnabled } = useAppConfig();
  const { can, user, elevatedAdmin, canViewStock } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { logoUrl, sidebarTitle } = useAppearance();
  const { latestVersion, clear: clearUpdate } = useUpdateAvailability();
  const { businessIntelligence, autoUpdates } = usePlanEntitlements();
  const [updateBusy, setUpdateBusy] = useState(false);
  const [activeStaffCount, setActiveStaffCount] = useState(0);
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_PIN_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    listStaffUsers()
      .then((rows) => setActiveStaffCount(rows.filter((u) => u.active && !u.is_cadete).length))
      .catch(() => setActiveStaffCount(0));
  }, []);

  /** Solo se abre completa si el usuario la fija; por defecto queda en rail de íconos. */
  const expanded = pinned;
  const roleHint = user ? sessionRoleHint(user, elevatedAdmin) : null;
  const showSwitchEmployee = Boolean(user && activeStaffCount > 1);

  const location = useLocation();
  const splitCatalog =
    rubroDef.id === "estetica" || rubroDef.id === "clinica" || rubroDef.id === "taller";
  const onServices =
    location.pathname === "/productos" && location.search.includes("vista=servicios");
  const visible = ITEMS.filter((i) => {
    if (i.to === "/asistente" && !businessIntelligence) return false;
    if ((i.to === "/stock" || i.to === "/proveedores") && !canViewStock) return false;
    if (i.feature && !features[i.feature]) return false;
    if (i.permission && !can(i.permission)) return false;
    return true;
  }).flatMap((item) => {
    if (item.to === "/clientes" && rubroDef.id === "clinica") {
      return [{ ...item, label: "Pacientes" }];
    }
    if (item.to === "/reportes" && rubroDef.posProfessional) {
      return [item, { to: "/comisiones", label: "Comisiones", icon: HandCoins }];
    }
    if (item.to === "/pos" && tablesEnabled) {
      return [item, { to: "/mesas", label: "Mesas", icon: Armchair }];
    }
    if (item.to === "/productos" && phoneStore) {
      return [item, { to: "/celulares", label: "Celulares", icon: Smartphone }];
    }
    if (item.to === "/productos" && splitCatalog) {
      return [
        item,
        {
          to: "/productos?vista=servicios",
          label: "Servicios",
          icon: Sparkles,
          feature: "products" as const,
        },
      ];
    }
    return [item];
  });

  const clinicNav = rubroDef.id === "clinica";
  const menu = clinicNav
    ? visible.filter(
        (item) =>
          ![
            "/pos",
            "/ventas",
            "/productos",
            "/stock",
            "/proveedores",
            "/caja",
            "/gastos",
            "/tesoreria",
            "/reportes",
            "/asistente",
            "/facturacion",
          ].includes(item.to),
      )
    : visible;
  if (clinicNav && !menu.some((item) => item.to === "/obras-sociales")) {
    const pacientes = menu.findIndex((item) => item.to === "/clientes");
    menu.splice(pacientes >= 0 ? pacientes + 1 : 1, 0, {
      to: "/obras-sociales",
      label: "Obras sociales",
      icon: HeartPulse,
    });
  }
  const historyItem = clinicNav ? menu.find((item) => item.to === "/auditoria") : undefined;
  const mainMenu = clinicNav ? menu.filter((item) => item.to !== "/auditoria") : menu;

  const proVisible = PRO_MODULES.filter((m) => isProModuleActive(m.key)).flatMap((m) => {
    const item = {
      to: m.route,
      label: getProModuleNavLabel(m.key, rubroDef.id),
      icon: proNavIcon(m.key, rubroDef.id),
      proModule: m.key as ProModuleKey | undefined,
    };
    if (clinicNav && m.key === "appointments") {
      return [
        item,
        {
          to: "/agenda-profesional",
          label: "Agenda del profesional",
          icon: CalendarClock,
          proModule: undefined,
        },
      ];
    }
    return [item];
  });
  const { count: rescheduleCount } = useRescheduleAlerts(isProModuleActive("appointments"));
  const webOrderCount = useWebOrders().orders.length;
  const tableAlerts = useTableAlerts(tablesEnabled && features.pos);
  const tableAlertCount = tableAlerts.calls + tableAlerts.pendingOrders;
  const [openGroups, setOpenGroups] = useState<NavGroupId[]>(readOpenGroups);

  function isItemActive(to: string) {
    if (to.includes("vista=servicios")) return onServices;
    if (to === "/productos") return location.pathname === "/productos" && !onServices;
    if (to === "/") return location.pathname === "/";
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  }

  const topItems = mainMenu.filter((item) => !NAV_GROUPS.some((g) => g.routes.includes(item.to)));
  const navGroups = NAV_GROUPS.map((g) => ({
    id: g.id,
    label: g.id === "trabajos" ? workGroupLabel(proVisible) : g.label,
    items:
      g.id === "trabajos"
        ? proVisible
        : mainMenu
            .filter((item) => g.routes.includes(item.to))
            .sort((a, b) => g.routes.indexOf(a.to) - g.routes.indexOf(b.to)),
  })).filter((g) => g.items.length > 0);
  const activeGroupId = clinicNav
    ? null
    : (navGroups.find((g) => g.items.length > 1 && g.items.some((i) => isItemActive(i.to)))?.id ??
      null);

  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((prev) => {
      if (prev.includes(activeGroupId)) return prev;
      const next = [...prev, activeGroupId];
      saveOpenGroups(next);
      return next;
    });
  }, [activeGroupId]);

  function toggleGroup(id: NavGroupId) {
    setOpenGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id];
      saveOpenGroups(next);
      return next;
    });
  }

  function renderLink({ to, label, icon: Icon, proModule }: NavItem) {
    const rescheduleBadge = proModule === "appointments" && rescheduleCount > 0;
    return (
      <NavLink
        key={to}
        to={to}
        end={to === "/"}
        aria-label={label}
        className={() => navLinkClass(isItemActive(to), !expanded)}
      >
        <Icon size={18} strokeWidth={2} className="shrink-0" />
        {expanded && <span className="min-w-0 flex-1 truncate">{label}</span>}
        {expanded && rescheduleBadge && (
          <span
            className="ml-1 shrink-0 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-950"
            title="Clientes que quieren reprogramar"
          >
            {rescheduleCount}
          </span>
        )}
        {!expanded && rescheduleBadge && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400" />
        )}
        {to === "/pos" && webOrderCount > 0 && (
          <span
            className={`shrink-0 rounded-full bg-sky-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-sky-950 ${
              expanded ? "ml-1" : "absolute right-0.5 top-0.5"
            }`}
            title="Pedidos web sin cobrar"
          >
            {webOrderCount}
          </span>
        )}
        {to === "/mesas" && tableAlertCount > 0 && (
          <span
            className={`shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ${
              expanded ? "ml-1" : "absolute right-0.5 top-0.5"
            }`}
            title="Mesas que llaman al mozo, piden la cuenta o pidieron por QR"
          >
            {tableAlertCount}
          </span>
        )}
        {!expanded && <span className="sidebar-rail-tooltip">{label}</span>}
      </NavLink>
    );
  }

  function renderGroup(group: (typeof navGroups)[number]) {
    if (group.items.length === 1) return renderLink(group.items[0]);
    const open = openGroups.includes(group.id);
    const hasActive = group.items.some((i) => isItemActive(i.to));
    const hasBadge =
      rescheduleCount > 0 && group.items.some((i) => i.proModule === "appointments");
    const panelId = `sidebar-group-${group.id}`;
    return (
      <div key={group.id} className="pt-1.5">
        <button
          type="button"
          data-nav-group={group.id}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => toggleGroup(group.id)}
          className={`flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
            hasActive && !open ? "text-white" : "text-brand-300/80"
          }`}
        >
          <span className="min-w-0 flex-1 truncate">{group.label}</span>
          {group.id === "trabajos" && (
            <span className="shrink-0 rounded bg-white/10 px-1 py-px text-[8px] font-bold tracking-wider text-brand-200/90">
              Pro
            </span>
          )}
          {!open && hasBadge && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Clientes que quieren reprogramar" />
          )}
          <ChevronDown
            size={13}
            strokeWidth={2.5}
            className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
              open ? "" : "-rotate-90"
            }`}
          />
        </button>
        <div
          id={panelId}
          className={`grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none ${
            open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 space-y-px overflow-hidden">{group.items.map(renderLink)}</div>
        </div>
      </div>
    );
  }

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
        className={`relative border-b border-white/10 ${expanded ? "px-2.5 py-2.5" : "px-1.5 py-2"}`}
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
          <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
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
          <div className="mt-1.5 flex flex-col gap-0.5">
            {showSwitchEmployee && <SwitchCashierButton variant="sidebar" />}
            {elevatedAdmin && <ExitAdminModeButton />}
          </div>
        )}
      </div>

      <nav
        className={`relative flex-1 space-y-px py-2 ${
          expanded ? "overflow-y-auto overflow-x-hidden px-1.5" : "overflow-visible px-1.5"
        }`}
      >
        {clinicNav ? (
          <>
            {mainMenu.map(renderLink)}
            {proVisible.length > 0 && (
              <>
                {expanded && (
                  <p className="mb-0.5 mt-2 px-2 text-[9px] font-semibold uppercase tracking-wider text-brand-300/70">
                    Pro
                  </p>
                )}
                {!expanded && <div className="my-2 mx-auto h-px w-6 bg-white/15" />}
                {proVisible.map(renderLink)}
              </>
            )}
            {historyItem && renderLink(historyItem)}
          </>
        ) : (
          <>
            {topItems.map(renderLink)}
            {expanded
              ? navGroups.map(renderGroup)
              : navGroups.map((group) => (
                  <Fragment key={group.id}>
                    <div className="mx-auto my-1 h-px w-6 bg-white/15" />
                    {group.items.map(renderLink)}
                  </Fragment>
                ))}
          </>
        )}
      </nav>

      <div
        className={`relative z-10 shrink-0 space-y-px border-t border-white/10 py-1.5 ${
          expanded ? "px-1.5" : "px-1.5"
        }`}
      >
        <NavLink
          to="/ayuda"
          aria-label="Ayuda"
          className={({ isActive }) => navLinkClass(isActive, !expanded)}
        >
          <CircleHelp size={18} strokeWidth={2} className="shrink-0" />
          {expanded && <span className="min-w-0 flex-1 truncate">Ayuda</span>}
          {!expanded && <span className="sidebar-rail-tooltip">Ayuda</span>}
        </NavLink>
        <NavLink
          to="/admin"
          aria-label="Configuración"
          className={({ isActive }) => navLinkClass(isActive, !expanded)}
        >
          <Settings size={18} strokeWidth={2} className="shrink-0" />
          {expanded && <span className="min-w-0 flex-1 truncate">Configuración</span>}
          {!expanded && <span className="sidebar-rail-tooltip">Configuración</span>}
        </NavLink>
        {latestVersion && (
          <button
            type="button"
            disabled={updateBusy}
            onClick={() => {
              setUpdateBusy(true);
              void checkAndInstallUpdate(false, { autoUpdates })
                .then((r) => {
                  if (!r.available) clearUpdate();
                })
                .catch((e) => showUserError(e))
                .finally(() => setUpdateBusy(false));
            }}
            title={`Actualización v${latestVersion} disponible`}
            className={navLinkClass(false, !expanded) + " relative"}
          >
            <CloudDownload size={18} strokeWidth={2} className="shrink-0 text-sky-300" />
            {expanded && (
              <span className="min-w-0 flex-1 truncate text-sky-200">
                {updateBusy ? "Actualizando…" : `Actualizar v${latestVersion}`}
              </span>
            )}
            {!expanded && <span className="sidebar-rail-tooltip">Actualizar</span>}
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sky-400" />
          </button>
        )}
        {expanded && (
          <>
            <div className="flex items-end justify-between gap-2 px-1 pt-1">
              <WalTechCredit />
              <InternetFooterStatus />
            </div>
            <AppVersionLabel variant="sidebar" />
          </>
        )}
        {!expanded && (
          <div className="flex flex-col items-center gap-1 pt-1">
            <InternetFooterStatus />
          </div>
        )}
      </div>
    </aside>
  );
}
