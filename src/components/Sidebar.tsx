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
  type LucideIcon,
} from "lucide-react";
import { useAppConfig } from "../context/AppConfig";
import type { FeatureFlags } from "../types";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  feature?: keyof FeatureFlags;
}

const ITEMS: NavItem[] = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  { to: "/pos", label: "Punto de venta", icon: ShoppingCart, feature: "pos" },
  { to: "/ventas", label: "Ventas", icon: Receipt, feature: "pos" },
  { to: "/productos", label: "Productos", icon: Package, feature: "products" },
  { to: "/stock", label: "Stock", icon: Boxes, feature: "stock" },
  { to: "/clientes", label: "Clientes", icon: Users, feature: "customers" },
  { to: "/reportes", label: "Reportes", icon: BarChart3, feature: "reports" },
  { to: "/facturacion", label: "Facturación (ARCA)", icon: FileText, feature: "invoicing" },
];

export default function Sidebar() {
  const { businessName, rubroDef, features } = useAppConfig();

  const visible = ITEMS.filter((i) => !i.feature || features[i.feature]);

  return (
    <aside className="flex h-full w-64 flex-col bg-slate-900 text-slate-100">
      <div className="px-5 py-5 border-b border-white/10">
        <p className="text-base font-semibold leading-tight truncate">{businessName}</p>
        <p className="text-xs text-slate-400 mt-0.5">Modo: {rubroDef.label}</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`
          }
        >
          <Settings size={18} />
          Administración
        </NavLink>
      </div>
    </aside>
  );
}
