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
  | "close_cash_blind";

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
      const id = await getSetting("current_user_id");
      if (id === "1") {
        setUser({
          id: 1,
          username: "admin",
          display_name: "Administrador",
          role: "admin",
        });
      } else if (id === "2") {
        setUser({
          id: 2,
          username: "cajero",
          display_name: "Cajero",
          role: "cashier",
        });
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
