import { useEffect, useState } from "react";
import { LogIn, User } from "lucide-react";
import { Card, Button, Input } from "./ui";
import { useAuth } from "../context/AuthContext";
import { listStaffUsers, type StaffUser } from "../db/users";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
};

/** Inicio de sesión / cambio de cajero integrado en Empleados. */
export default function EmployeeSessionPanel() {
  const { user, login } = useAuth();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listStaffUsers()
      .then((rows) => setStaff(rows.filter((u) => u.active)))
      .catch(console.error);
  }, []);

  function pickUser(u: StaffUser) {
    setUsername(u.username);
    setPin("");
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username.trim(), pin);
      setPin("");
    } catch {
      setError("Usuario o PIN incorrecto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mb-6 max-w-xl border-[var(--color-panel-border)]">
      {user && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-brand-50/60 px-4 py-3 dark:bg-brand-900/25">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
            <User size={20} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Sesión actual</p>
            <p className="font-semibold text-ink">{user.display_name}</p>
          </div>
        </div>
      )}

      <p className="text-sm text-ink-muted">
        Elegí quién opera la caja. Cada empleado usa su usuario y PIN; el admin siempre puede entrar.
      </p>

      {staff.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {staff.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => pickUser(u)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                username === u.username
                  ? "border-brand-500 bg-brand-500/15 font-semibold text-ink"
                  : "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] text-ink hover:border-brand-400"
              }`}
            >
              {u.display_name}
              <span className="ml-1.5 text-xs font-normal text-ink-muted">
                ({ROLE_LABEL[u.role] ?? u.role})
              </span>
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="cajero"
            autoComplete="username"
          />
          <Input
            label="PIN"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            inputMode="numeric"
          />
        </div>
        <Button type="submit" className="w-full sm:w-auto" disabled={loading}>
          <LogIn size={18} />
          {loading ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </Card>
  );
}
