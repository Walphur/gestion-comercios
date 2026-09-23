import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  CloudDownload,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Lock,
  ShieldCheck,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";
import { Button, Card, IconButton, Input, Modal, SelectableCard } from "../components/ui";
import AppVersionLabel from "../components/AppVersionLabel";
import WalTechCredit from "../components/WalTechCredit";
import { useAuth } from "../context/AuthContext";
import { useLicense } from "../context/LicenseContext";
import { useWelcome } from "../context/WelcomeContext";
import { useAppConfig } from "../context/AppConfig";
import { listStaffUsers, type StaffUser } from "../db/users";
import { planLabel, recoverAdminPin, getMachineId } from "../lib/license";
import { checkAndInstallUpdate, peekAvailableUpdate } from "../lib/updater";
import { openExternalUrl } from "../lib/openExternal";
import { APP_NAME } from "../config/product";
import walqoLogo from "../assets/branding/walqo-logo.png";
import { openSupportWhatsApp } from "../lib/supportContact";

const RELEASES_URL = "https://github.com/Walphur/gestion-comercios/releases/latest";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Encargado",
  cashier: "Cajero",
};

const ROLE_ICON: Record<string, LucideIcon> = {
  admin: ShieldCheck,
  manager: UserRoundCog,
  cashier: Banknote,
};

const DEFAULT_PINS_KEY = "walqo-seen-default-pins";

function sortForLogin(a: StaffUser, b: StaffUser): number {
  const order = { cashier: 0, manager: 1, admin: 2 };
  const ra = order[a.role] ?? 3;
  const rb = order[b.role] ?? 3;
  if (ra !== rb) return ra - rb;
  return a.display_name.localeCompare(b.display_name, "es");
}

function licenseFooterLabel(active: boolean, plan: string | undefined, isTrial?: boolean): string {
  if (active && isTrial) return "Prueba gratuita activa";
  if (active) return "Licencia activada";
  if (plan && plan !== "none") return planLabel(plan);
  return "Sin licencia";
}

export default function Login() {
  const { login, user } = useAuth();
  const { status: licenseStatus } = useLicense();
  const { openWelcome } = useWelcome();
  const { businessName } = useAppConfig();
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
  const [showDefaultPins, setShowDefaultPins] = useState(() => {
    try {
      return localStorage.getItem(DEFAULT_PINS_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverKey, setRecoverKey] = useState("");
  const [recoverPin, setRecoverPin] = useState("");
  const [recoverPin2, setRecoverPin2] = useState("");
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [recoverError, setRecoverError] = useState("");
  const [recoverOk, setRecoverOk] = useState("");
  const [machineId, setMachineId] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [pendingUpdateVersion, setPendingUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!recoverOpen) return;
    void getMachineId()
      .then(setMachineId)
      .catch(() => setMachineId(""));
  }, [recoverOpen]);

  // En login: buscar update sin necesidad de entrar al sistema (sirve si olvidaron el PIN).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const peek = await peekAvailableUpdate({ autoUpdates: true });
        if (cancelled || !peek) return;
        setPendingUpdateVersion(peek.version);
        setUpdateStatus(`Hay una versión nueva (v${peek.version}). Actualizando…`);
        setUpdateBusy(true);
        const r = await checkAndInstallUpdate(true, { autoUpdates: true });
        if (cancelled) return;
        if (r.available && r.message.includes("Reiniciando")) {
          setUpdateStatus(r.message);
        } else if (r.message) {
          setUpdateStatus(r.message);
          setUpdateBusy(false);
        } else {
          setUpdateBusy(false);
        }
      } catch {
        if (!cancelled) {
          setUpdateBusy(false);
          setUpdateStatus("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleManualUpdate() {
    setUpdateBusy(true);
    setUpdateStatus("Buscando actualización…");
    try {
      const r = await checkAndInstallUpdate(true, { autoUpdates: true });
      if (r.available) {
        setPendingUpdateVersion(r.latestVersion ?? pendingUpdateVersion);
        setUpdateStatus(r.message || "Actualizando…");
      } else {
        setUpdateStatus(r.message || "Ya tenés la última versión.");
        setUpdateBusy(false);
      }
    } catch (e) {
      setUpdateStatus(e instanceof Error ? e.message : String(e));
      setUpdateBusy(false);
    }
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setRecoverError("");
    setRecoverOk("");
    if (recoverPin.trim() !== recoverPin2.trim()) {
      setRecoverError("Los PIN nuevos no coinciden.");
      return;
    }
    setRecoverBusy(true);
    try {
      await recoverAdminPin(recoverKey, recoverPin);
      setRecoverOk("Listo. Entrá como Administrador con el PIN nuevo.");
      setUsername("admin");
      setPin(recoverPin.trim());
      setRecoverKey("");
      setRecoverPin("");
      setRecoverPin2("");
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecoverBusy(false);
    }
  }

  useEffect(() => {
    listStaffUsers()
      .then((rows) => {
        const active = rows.filter((u) => u.active && !u.is_cadete).sort(sortForLogin);
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

  function dismissDefaultPins() {
    setShowDefaultPins(false);
    try {
      localStorage.setItem(DEFAULT_PINS_KEY, "1");
    } catch {
      /* ignore */
    }
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
      dismissDefaultPins();
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
    <div className="walqo-brand-lock walqo-pin-shell app-shell-bg flex h-full items-start justify-center overflow-y-auto p-4">
      <Card variant="form" className="wt-animate-in relative z-[1] my-auto w-full max-w-md !bg-white !text-slate-900 shadow-lg">
        <button
          type="button"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
          onClick={openWelcome}
        >
          <ArrowLeft size={18} />
          Volver al inicio
        </button>

        <header className="mb-6 text-center">
          <div className="brand-mark brand-mark--logo">
            <img src={walqoLogo} alt={APP_NAME} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">{displayTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {APP_NAME} · Ingresá tu PIN
          </p>
        </header>

        {showDefaultPins && (
          <div className="mb-5 rounded-xl border border-sky-300/60 bg-sky-50 px-3.5 py-3 text-left text-sm text-sky-950">
            <p className="font-semibold">Primera vez</p>
            <p className="mt-1 text-xs leading-relaxed opacity-95">
              PIN por defecto: <strong>Cajero 0000</strong> · <strong>Admin 1234</strong>.
              Cambialos después en Configuración → Usuarios.
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold underline opacity-90 hover:opacity-100"
              onClick={dismissDefaultPins}
            >
              Entendido
            </button>
          </div>
        )}

        {(pendingUpdateVersion || updateStatus) && (
          <div className="mb-5 rounded-xl border border-emerald-400/50 bg-emerald-50 px-3.5 py-3 text-left text-sm text-emerald-950">
            <p className="flex items-center gap-2 font-semibold">
              <CloudDownload size={16} className="shrink-0" />
              Actualización
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              {updateStatus ||
                (pendingUpdateVersion
                  ? `Hay v${pendingUpdateVersion} disponible.`
                  : "")}
            </p>
            {!updateBusy ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                  onClick={() => void handleManualUpdate()}
                >
                  Actualizar ahora
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold underline opacity-90 hover:opacity-100"
                  onClick={() => void openExternalUrl(RELEASES_URL)}
                >
                  Descargar instalador
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs font-medium opacity-90">No cierres la ventana…</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <section>
            <p className="field-label">¿Quién entra?</p>
            {loadingStaff ? (
              <p className="text-sm text-slate-500">Cargando empleados…</p>
            ) : staff.length === 0 ? (
              <p className="text-sm text-amber-700">
                No hay empleados activos. Creálos en Configuración → Usuarios.
              </p>
            ) : (
              <div className="grid gap-2">
                {staff.map((u) => {
                  const Icon = ROLE_ICON[u.role] ?? Banknote;
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
              <p className="text-sm text-slate-500">
                Ingresando como <strong className="font-semibold text-slate-900">{selected.display_name}</strong>
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
            className="text-base tracking-[0.2em]"
            startAdornment={<Lock size={17} strokeWidth={2} aria-hidden />}
            endAdornment={
              <IconButton
                label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                onClick={() => setShowPin((v) => !v)}
              >
                {showPin ? <Eye size={18} /> : <EyeOff size={18} />}
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

          <button
            type="button"
            className="w-full text-center text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            onClick={() => {
              setRecoverOpen(true);
              setRecoverError("");
              setRecoverOk("");
            }}
          >
            ¿Olvidaste el PIN?
          </button>

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

        <Modal
          open={recoverOpen}
          title="Recuperar acceso"
          onClose={() => !recoverBusy && setRecoverOpen(false)}
        >
          <form onSubmit={(e) => void handleRecover(e)} className="space-y-4">
            <p className="text-sm text-ink-muted">
              Si olvidaste el PIN del administrador y del cajero, podés poner uno nuevo con la{" "}
              <strong className="text-ink">clave de licencia</strong> de este local
              {licenseStatus?.key_mask ? (
                <>
                  {" "}
                  (empieza por <code className="text-xs">{licenseStatus.key_mask}</code>)
                </>
              ) : null}
              .
            </p>
            <Input
              label="Clave de licencia"
              value={recoverKey}
              onChange={(e) => setRecoverKey(e.target.value)}
              placeholder="GC-XXXX-XXXX-XXXX"
              autoComplete="off"
            />
            <Input
              label="PIN nuevo (admin)"
              type="password"
              inputMode="numeric"
              value={recoverPin}
              onChange={(e) => setRecoverPin(e.target.value)}
              placeholder="••••"
            />
            <Input
              label="Repetir PIN nuevo"
              type="password"
              inputMode="numeric"
              value={recoverPin2}
              onChange={(e) => setRecoverPin2(e.target.value)}
              placeholder="••••"
            />
            {recoverError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{recoverError}</p>
            ) : null}
            {recoverOk ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-300">{recoverOk}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={recoverBusy} loading={recoverBusy}>
                Restablecer PIN admin
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={recoverBusy}
                onClick={() => setRecoverOpen(false)}
              >
                Cerrar
              </Button>
            </div>
            <p className="text-xs text-ink-muted">
              ¿No tenés la clave?{" "}
              <button
                type="button"
                className="font-semibold text-brand-700 underline dark:text-brand-300"
                onClick={() => void openSupportWhatsApp("recuperar PIN (olvidé admin y cajero)")}
              >
                Escribinos por WhatsApp
              </button>
              {machineId ? (
                <>
                  {" "}
                  · Código de equipo: <code className="break-all text-[10px]">{machineId}</code>
                </>
              ) : null}
            </p>
          </form>
        </Modal>

        <footer className="mt-6 space-y-3 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <KeyRound size={11} strokeWidth={2} className="text-[#2563eb]" />
              {licenseFooterLabel(
                licenseStatus?.active ?? false,
                licenseStatus?.plan,
                licenseStatus?.is_trial,
              )}
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <HardDrive size={11} strokeWidth={2} className="text-[#2563eb]" />
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
