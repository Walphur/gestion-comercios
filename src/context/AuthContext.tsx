import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setSetting } from "../db/settings";
import type { AuthUser } from "../lib/tauri";
import { verifyUserPin } from "../lib/tauri";

type Role = AuthUser["role"];

interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  /** Cajero/encargado con PIN de admin: permisos completos hasta volver al mostrador. */
  elevatedAdmin: boolean;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => void;
  elevateAdmin: () => void;
  revokeAdminElevation: () => void;
  can: (permission: Permission) => boolean;
}

export type Permission =
  | "view_reports"
  | "view_audit"
  | "view_profits"
  | "manage_products"
  | "manage_admin"
  | "void_sale"
  | "apply_manual_discount"
  | "close_cash_blind"
  | "manage_users";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "view_reports",
    "view_audit",
    "view_profits",
    "manage_products",
    "manage_admin",
    "void_sale",
    "apply_manual_discount",
    "close_cash_blind",
    "manage_users",
  ],
  manager: [
    "view_reports",
    "view_profits",
    "manage_products",
    "void_sale",
    "apply_manual_discount",
    "close_cash_blind",
  ],
  cashier: ["apply_manual_discount", "close_cash_blind"],
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [elevatedAdmin, setElevatedAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // No restaurar sesión al abrir la app: cada turno inicia con usuario y PIN.
      await setSetting("current_user_id", "");
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (username: string, pin: string) => {
    const u = await verifyUserPin(username, pin);
    setElevatedAdmin(false);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    setElevatedAdmin(false);
    setUser(null);
    void setSetting("current_user_id", "");
  }, []);

  const elevateAdmin = useCallback(() => setElevatedAdmin(true), []);

  const revokeAdminElevation = useCallback(() => setElevatedAdmin(false), []);

  const can = useCallback(
    (permission: Permission) => {
      if (!user) return false;
      if (elevatedAdmin || user.role === "admin") {
        return ROLE_PERMISSIONS.admin.includes(permission);
      }
      return ROLE_PERMISSIONS[user.role].includes(permission);
    },
    [user, elevatedAdmin],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      elevatedAdmin,
      login,
      logout,
      elevateAdmin,
      revokeAdminElevation,
      can,
    }),
    [user, loading, elevatedAdmin, login, logout, elevateAdmin, revokeAdminElevation, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
