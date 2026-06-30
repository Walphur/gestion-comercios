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
  Tag,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLicense } from "../context/LicenseContext";
import { useAppearance } from "../context/AppearanceContext";
import { useAppConfig } from "../context/AppConfig";
import { listStaffUsers, type StaffUser } from "../db/users";
import { resolveAppVersion } from "../lib/appVersion";
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
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    resolveAppVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

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
    <div className="login-screen">
      <div className="login-screen__glow" aria-hidden />
      <div className="login-screen__noise" aria-hidden />

      <div className="login-panel">
        <header className="login-stagger mb-8 text-center">
          <div className="login-isotype" aria-hidden>
            {logoUrl ? (
              <img src={logoUrl} alt="" />
            ) : (
              <Store size={36} strokeWidth={1.75} className="text-white" />
            )}
          </div>
          <h1 className="login-title mt-5">{displayTitle}</h1>
          <p className="login-subtitle">Software de gestión comercial</p>
          <p className="login-hint">Elegí quién entra y poné tu PIN</p>

          <div className="login-trust">
            <span>
              <Check size={11} strokeWidth={2.5} />
              Funciona sin internet
            </span>
            <span>
              <Check size={11} strokeWidth={2.5} />
              Tus datos quedan en tu PC
            </span>
            <span>
              <Check size={11} strokeWidth={2.5} />
              Copias de seguridad automáticas
            </span>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="login-stagger space-y-5">
          <section>
            <p className="login-section-label">¿Quién entra?</p>
            {loadingStaff ? (
              <p className="text-sm text-slate-400">Cargando empleados…</p>
            ) : staff.length === 0 ? (
              <p className="text-sm text-amber-400/90">
                No hay empleados activos. Creálos en Configuración → Usuarios.
              </p>
            ) : (
              <div className="login-user-grid">
                {staff.map((u) => {
                  const Icon = ROLE_ICON[u.role] ?? ShoppingBag;
                  const isActive = username === u.username;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => pickUser(u)}
                      className={`login-user-card ${isActive ? "login-user-card--active" : ""}`}
                      aria-pressed={isActive}
                    >
                      <span className="login-user-card__icon">
                        <Icon size={20} strokeWidth={2} />
                      </span>
                      <span className="min-w-0">
                        <span className="login-user-card__name">{u.display_name}</span>
                        <span className="login-user-card__role">
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <div className="login-form-divider" />

          {manualUser ? (
            <div>
              <label htmlFor="login-manual-user" className="login-section-label">
                Usuario (manual)
              </label>
              <input
                id="login-manual-user"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                placeholder="Ej: cajero, admin"
                autoComplete="username"
                className="login-pin-field !pl-4 !text-base !tracking-normal"
              />
            </div>
          ) : (
            selected && (
              <p className="login-selected-hint">
                Ingresando como <strong>{selected.display_name}</strong>
              </p>
            )
          )}

          <div>
            <label htmlFor="login-pin" className="login-section-label">
              PIN
            </label>
            <div className="login-pin-wrap">
              <Lock size={18} className="login-pin-icon" aria-hidden />
              <input
                ref={pinRef}
                id="login-pin"
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
                className="login-pin-field"
                aria-invalid={error ? true : undefined}
              />
              <button
                type="button"
                className="login-pin-toggle"
                onClick={() => setShowPin((v) => !v)}
                aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button
            type="submit"
            className="login-submit inline-flex items-center justify-center gap-2"
            disabled={submitting || loadingStaff || !username.trim()}
            aria-busy={submitting}
          >
            {submitting && (
              <svg
                className="wt-spinner"
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
              </svg>
            )}
            {submitting ? "Ingresando…" : "Entrar"}
          </button>

          {!manualUser && staff.length > 0 && (
            <button
              type="button"
              onClick={() => setManualUser(true)}
              className="login-manual-link"
            >
              Ingresar con otro usuario (escribir manualmente)
            </button>
          )}
        </form>

        <footer className="login-footer">
          <span className="login-footer__item login-footer__brand">
            <span>Wal</span>
            <span>tech</span>
          </span>
          {version && (
            <>
              <span className="login-footer__sep" aria-hidden>
                ·
              </span>
              <span className="login-footer__item">
                <Tag size={11} strokeWidth={2} />
                v{version}
              </span>
            </>
          )}
          <span className="login-footer__sep" aria-hidden>
            ·
          </span>
          <span className="login-footer__item">
            <KeyRound size={11} strokeWidth={2} />
            {licenseFooterLabel(licenseStatus?.active ?? false, licenseStatus?.plan)}
          </span>
          <span className="login-footer__sep" aria-hidden>
            ·
          </span>
          <span className="login-footer__item">
            <HardDrive size={11} strokeWidth={2} />
            Sistema local
          </span>
        </footer>
      </div>
    </div>
  );
}
