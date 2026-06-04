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
    <Card className="mb-6 border-[var(--color-panel-border)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {user && (
          <div className="flex items-center gap-3">
            <User className="text-brand-600 dark:text-brand-300" size={22} />
            <div>
              <p className="text-sm text-ink-muted">Sesión actual</p>
              <p className="font-semibold text-ink">{user.display_name}</p>
            </div>
          </div>
        )}
        <p className="max-w-xl text-sm text-ink-muted">
          Elegí quién opera la caja. Cada empleado usa su usuario y PIN; el{" "}
          <strong className="text-ink">admin</strong> siempre puede entrar.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {staff.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => pickUser(u)}
            className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
              username === u.username
                ? "border-brand-500 bg-brand-500/15 text-ink"
                : "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] text-ink hover:border-brand-400"
            }`}
          >
            <span className="font-semibold">{u.display_name}</span>
            <span className="ml-2 text-xs text-ink-muted">({ROLE_LABEL[u.role] ?? u.role})</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Input
          label="Usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Ej: cajero, admin"
          autoComplete="username"
        />
        <Input
          label="PIN"
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
        />
        <Button type="submit" className="sm:mb-0.5" disabled={loading}>
          <LogIn size={18} />
          {loading ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </Card>
  );
}
