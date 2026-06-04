import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSetting, setSetting } from "../db/settings";
import { getUserById } from "../db/users";
import type { AuthUser } from "../lib/tauri";
import { verifyUserPin } from "../lib/tauri";

type Role = AuthUser["role"];

interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => void;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const idRaw = await getSetting("current_user_id");
      const id = Number(idRaw);
      if (idRaw && Number.isFinite(id)) {
        const u = await getUserById(id);
        if (u) setUser(u);
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (username: string, pin: string) => {
    const u = await verifyUserPin(username, pin);
    setUser(u);
    await setSetting("current_user_id", String(u.id));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    void setSetting("current_user_id", "");
  }, []);

  const can = useCallback(
    (permission: Permission) => {
      if (!user) return false;
      return ROLE_PERMISSIONS[user.role].includes(permission);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, can }),
    [user, loading, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
