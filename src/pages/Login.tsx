import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Card } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import WalTechCredit from "../components/WalTechCredit";
import AppVersionLabel from "../components/AppVersionLabel";
import { useAppearance } from "../context/AppearanceContext";
import { useAppConfig } from "../context/AppConfig";
import { listStaffUsers, type StaffUser } from "../db/users";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
};

function sortForLogin(a: StaffUser, b: StaffUser): number {
  const order = { cashier: 0, manager: 1, admin: 2 };
  const ra = order[a.role] ?? 3;
  const rb = order[b.role] ?? 3;
  if (ra !== rb) return ra - rb;
  return a.display_name.localeCompare(b.display_name, "es");
}

export default function Login() {
  const { login, user } = useAuth();
  const { businessName } = useAppConfig();
  const { logoUrl } = useAppearance();
  const navigate = useNavigate();
  const pinRef = useRef<HTMLInputElement>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [manualUser, setManualUser] = useState(false);

  useEffect(() => {
    listStaffUsers()
      .then((rows) => {
        const active = rows.filter((u) => u.active).sort(sortForLogin);
        setStaff(active);
        const cajero = active.find((u) => u.username === "cajero");
        const pick = cajero ?? active[0];
        if (pick) setUsername(pick.username);
      })
      .catch(console.error)
      .finally(() => setLoadingStaff(false));
  }, []);

  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  function pickUser(u: StaffUser) {
    setUsername(u.username);
    setPin("");
    setError("");
    setManualUser(false);
    requestAnimationFrame(() => pinRef.current?.focus());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) {
      setError("Elegí un empleado.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await login(username.trim(), pin);
      navigate("/", { replace: true });
    } catch {
      setError("PIN incorrecto.");
    } finally {
      setSubmitting(false);
    }
  }

  const selected = staff.find((u) => u.username === username);

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-surface p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 15% 20%, var(--color-brand-200) 0%, transparent 45%), radial-gradient(circle at 85% 80%, var(--color-brand-300) 0%, transparent 40%)",
        }}
      />
      <Card className="relative w-full max-w-lg border-[var(--color-panel-border)] shadow-xl shadow-brand-900/10">
        <div className="mb-6 text-center">
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              className="mx-auto mb-4 h-24 max-w-[280px] object-contain"
            />
          )}
          <p className="font-display text-2xl font-bold tracking-tight text-brand-800 dark:text-brand-200">
            {businessName || "Gestión Comercios"}
          </p>
          <p className="mt-1 text-sm text-ink-muted">Tu caja, tu negocio — siempre local</p>
          <p className="mt-2 text-xs text-ink-muted/90">
            Elegí quién entra y poné tu PIN.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">¿Quién entra?</p>
            {loadingStaff ? (
              <p className="text-sm text-ink-muted">Cargando empleados…</p>
            ) : staff.length === 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                No hay empleados activos. Creálos en Administración → Empleados.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {staff.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => pickUser(u)}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                      username === u.username
                        ? "border-brand-500 bg-brand-500/15 text-ink ring-1 ring-brand-400/50"
                        : "border-[var(--color-panel-border)] bg-[var(--color-input-bg)] text-ink hover:border-brand-400"
                    }`}
                  >
                    <span className="block font-semibold">{u.display_name}</span>
                    <span className="text-xs text-ink-muted">
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {manualUser ? (
            <Input
              label="Usuario (manual)"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError("");
              }}
              placeholder="Ej: cajero, admin"
              autoComplete="username"
            />
          ) : (
            selected && (
              <p className="text-sm text-ink-muted">
                Ingresando como{" "}
                <strong className="text-ink">{selected.display_name}</strong>
              </p>
            )
          )}

          <Input
            ref={pinRef}
            label="PIN"
            type="password"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError("");
            }}
            placeholder="••••"
            autoFocus={!loadingStaff && staff.length > 0}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="submit"
            className="w-full py-3"
            disabled={submitting || loadingStaff || !username.trim()}
          >
            {submitting ? "Ingresando…" : "Entrar"}
          </Button>

          {!manualUser && staff.length > 0 && (
            <button
              type="button"
              onClick={() => setManualUser(true)}
              className="w-full text-center text-xs text-ink-muted hover:text-brand-700 hover:underline"
            >
              Ingresar con otro usuario (escribir manualmente)
            </button>
          )}
        </form>

        <div className="mt-6 space-y-2 border-t border-brand-100 pt-4">
          <div className="flex justify-center">
            <WalTechCredit variant="light" />
          </div>
          <AppVersionLabel variant="light" />
        </div>
      </Card>
    </div>
  );
}
