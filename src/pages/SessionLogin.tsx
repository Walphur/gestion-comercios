import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, User } from "lucide-react";
import { PageHeader, Card, Button, Input } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { listStaffUsers, type StaffUser } from "../db/users";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
};

export default function SessionLogin() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
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
      navigate("/", { replace: true });
    } catch {
      setError("Usuario o PIN incorrecto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Iniciar sesión"
        subtitle="Elegí quién opera la caja. Cada empleado usa su usuario y PIN."
      />

      <div className="mx-auto max-w-lg space-y-6 p-8">
        {user && (
          <Card className="flex items-center gap-3 border-brand-500/30 bg-brand-500/10">
            <User className="text-brand-600 dark:text-brand-300" size={22} />
            <div>
              <p className="text-sm text-ink-muted">Sesión actual</p>
              <p className="font-semibold text-ink">{user.display_name}</p>
            </div>
          </Card>
        )}

        <Card>
          <p className="mb-3 text-sm font-medium text-ink">Usuarios del comercio</p>
          <div className="mb-5 flex flex-wrap gap-2">
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

          <form onSubmit={handleSubmit} className="space-y-4">
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
              autoFocus
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full py-3" disabled={loading}>
              <LogIn size={18} />
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>

          <p className="mt-4 text-xs text-ink-muted">
            El usuario <strong className="text-ink">admin</strong> siempre puede entrar (configuración
            y administración). Los cajeros solo ven lo que permite su rol.
          </p>
        </Card>
      </div>
    </div>
  );
}
