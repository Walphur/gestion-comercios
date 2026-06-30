import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Lock,
  Shield,
  ShoppingBag,
  Store,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Button, Card, IconButton, Input, SelectableCard } from "../components/ui";
import AppVersionLabel from "../components/AppVersionLabel";
import WalTechCredit from "../components/WalTechCredit";
import { useAuth } from "../context/AuthContext";
import { useLicense } from "../context/LicenseContext";
import { useAppearance } from "../context/AppearanceContext";
import { useAppConfig } from "../context/AppConfig";
import { listStaffUsers, type StaffUser } from "../db/users";
import { planLabel } from "../lib/license";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
};

const ROLE_ICON: Record<string, LucideIcon> = {
  admin: Shield,
  manager: UserCog,
  cashier: ShoppingBag,
};

function sortForLogin(a: StaffUser, b: StaffUser): number {
  const order = { cashier: 0, manager: 1, admin: 2 };
  const ra = order[a.role] ?? 3;
  const rb = order[b.role] ?? 3;
  if (ra !== rb) return ra - rb;
  return a.display_name.localeCompare(b.display_name, "es");
}

function licenseFooterLabel(active: boolean, plan: string | undefined): string {
  if (active) return "Licencia activada";
  if (plan && plan !== "none") return planLabel(plan);
  return "Sin licencia";
}

export default function Login() {
  const { login, user } = useAuth();
  const { status: licenseStatus } = useLicense();
  const { businessName } = useAppConfig();
  const { logoUrl } = useAppearance();
  const navigate = useNavigate();
  const pinRef = useRef<HTMLInputElement>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
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
  const displayTitle = businessName?.trim() || "Mi Comercio";

  return (
    <div className="app-shell-bg flex items-center justify-center p-4">
      <Card variant="form" className="wt-animate-in relative z-[1] w-full max-w-md">
        <header className="mb-6 text-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="mx-auto mb-4 h-20 w-20 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] object-contain p-2 shadow-sm"
            />
          ) : (
            <div className="stat-icon mx-auto mb-4 h-14 w-14">
              <Store size={28} strokeWidth={1.75} className="text-brand-600" />
            </div>
          )}
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{displayTitle}</h1>
          <p className="mt-1 text-sm text-ink-muted">Software de gestión comercial</p>
          <p className="mt-2 text-xs text-ink-muted">Elegí quién entra y poné tu PIN</p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 border-t border-[var(--color-panel-border)] pt-4">
            {[
              "Funciona sin internet",
              "Tus datos quedan en tu PC",
              "Copias de seguridad automáticas",
            ].map((text) => (
              <span key={text} className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                <Check size={11} strokeWidth={2.5} className="shrink-0 text-brand-600" />
                {text}
              </span>
            ))}
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <section>
            <p className="field-label">¿Quién entra?</p>
            {loadingStaff ? (
              <p className="text-sm text-ink-muted">Cargando empleados…</p>
            ) : staff.length === 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                No hay empleados activos. Creálos en Configuración → Usuarios.
              </p>
            ) : (
              <div className="grid gap-2">
                {staff.map((u) => {
                  const Icon = ROLE_ICON[u.role] ?? ShoppingBag;
                  return (
                    <SelectableCard
                      key={u.id}
                      selected={username === u.username}
                      onClick={() => pickUser(u)}
                      icon={Icon}
                      title={u.display_name}
                      subtitle={ROLE_LABEL[u.role] ?? u.role}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <hr className="form-section-divider" />

          {manualUser ? (
            <Input
              label="Usuario (manual)"
              id="login-manual-user"
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
                Ingresando como <strong className="font-semibold text-ink">{selected.display_name}</strong>
              </p>
            )
          )}

          <Input
            ref={pinRef}
            id="login-pin"
            label="PIN"
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError("");
            }}
            placeholder="••••"
            autoComplete="current-password"
            autoFocus={!loadingStaff && staff.length > 0}
            error={error || undefined}
            className="text-base tracking-widest"
            startAdornment={<Lock size={18} aria-hidden />}
            endAdornment={
              <IconButton
                label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                onClick={() => setShowPin((v) => !v)}
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </IconButton>
            }
          />

          <Button
            type="submit"
            className="w-full py-3"
            loading={submitting}
            disabled={submitting || loadingStaff || !username.trim()}
          >
            {submitting ? "Ingresando…" : "Entrar"}
          </Button>

          {!manualUser && staff.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setManualUser(true)}
            >
              Ingresar con otro usuario (escribir manualmente)
            </Button>
          )}
        </form>

        <footer className="mt-6 space-y-3 border-t border-[var(--color-panel-border)] pt-4">
          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[11px] text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <KeyRound size={11} strokeWidth={2} className="text-brand-600" />
              {licenseFooterLabel(licenseStatus?.active ?? false, licenseStatus?.plan)}
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <HardDrive size={11} strokeWidth={2} className="text-brand-600" />
              Sistema local
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <WalTechCredit variant="light" />
            <AppVersionLabel variant="light" />
          </div>
        </footer>
      </Card>
    </div>
  );
}
