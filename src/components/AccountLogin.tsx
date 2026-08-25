import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn } from "lucide-react";
import { Button, Input } from "./ui";
import {
  forgotAccountPassword,
  loginAccount,
  resetAccountPassword,
} from "../lib/accountAuth";
import { applyAccountSession } from "../lib/accountSession";
import { useLicense } from "../context/LicenseContext";
import { APP_NAME } from "../config/product";
import walqoMark from "../assets/branding/walqo-logo.png";

interface Props {
  onSuccess: () => void;
  onBack: () => void;
}

type Mode = "login" | "forgot" | "reset";

export default function AccountLogin({ onSuccess, onBack }: Props) {
  const { refresh } = useLicense();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await loginAccount({ email: email.trim(), password });
      if (!res.ok) {
        setError(res.message || "No se pudo iniciar sesión");
        return;
      }
      await applyAccountSession(
        {
          email: res.email || email.trim().toLowerCase(),
          name: res.name || "",
          business_name: res.business_name,
          rubro: res.rubro,
          license_key: res.license_key,
        },
        refresh,
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setDevCode("");
    setLoading(true);
    try {
      const res = await forgotAccountPassword(email.trim());
      setInfo(res.message || "Si ese email tiene cuenta, te enviamos un código.");
      if (res.dev_code) setDevCode(res.dev_code);
      setMode("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el código");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await resetAccountPassword({
        email: email.trim(),
        code: code.trim(),
        password: newPassword,
      });
      setInfo(res.message || "Contraseña actualizada.");
      setPassword("");
      setNewPassword("");
      setCode("");
      setMode("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === "login" ? "Iniciar sesión" : mode === "forgot" ? "Recuperar contraseña" : "Nueva contraseña";
  const lead =
    mode === "login"
      ? `Ingresá con el email y la contraseña de tu cuenta ${APP_NAME}.`
      : mode === "forgot"
        ? "Te enviamos un código de 6 dígitos al email para crear una nueva contraseña."
        : "Ingresá el código del email y elegí una contraseña nueva (mín. 8 caracteres).";

  return (
    <div className="walqo-auth">
      <div className="walqo-auth__card walqo-auth__card--dock">
        <form
          className="walqo-auth__dock-form"
          onSubmit={(e) =>
            void (mode === "login"
              ? handleLogin(e)
              : mode === "forgot"
                ? handleForgot(e)
                : handleReset(e))
          }
        >
          <div className="walqo-auth__card-body">
            <button
              type="button"
              className="walqo-auth__back"
              onClick={() => {
                if (mode === "login") onBack();
                else {
                  setMode("login");
                  setError("");
                  setInfo("");
                  setDevCode("");
                }
              }}
            >
              <ArrowLeft size={18} />
              Volver
            </button>

            <div className="walqo-auth__head">
              <img src={walqoMark} alt="" width={40} height={40} className="walqo-auth__mark" />
              <h1>{title}</h1>
              <p>{lead}</p>
            </div>

            {error && <p className="walqo-auth__error">{error}</p>}
            {info && (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
                {info}
              </p>
            )}
            {devCode && (
              <p className="text-xs text-ink-muted">
                Código de desarrollo: <strong className="tracking-widest">{devCode}</strong>
              </p>
            )}

            <div className="walqo-auth__form">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoFocus={mode !== "reset"}
                disabled={mode === "reset"}
              />

              {mode === "login" && (
                <div className="relative">
                  <Input
                    label="Contraseña"
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="La que elegiste al registrarte"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="walqo-auth__eye"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "Ocultar" : "Mostrar"}
                  >
                    {showPass ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
              )}

              {mode === "reset" && (
                <>
                  <Input
                    label="Código de 6 dígitos"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    autoFocus
                  />
                  <div className="relative">
                    <Input
                      label="Nueva contraseña"
                      type={showPass ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="walqo-auth__eye"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? "Ocultar" : "Mostrar"}
                    >
                      {showPass ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  </div>
                </>
              )}
            </div>

            {mode === "login" && (
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setInfo("");
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}
          </div>

          <div className="walqo-auth__card-actions">
            <Button
              type="submit"
              className="w-full"
              loading={loading}
              disabled={
                loading ||
                !email.includes("@") ||
                (mode === "login" && password.length < 8) ||
                (mode === "reset" && (code.length !== 6 || newPassword.length < 8))
              }
            >
              {mode === "login" ? (
                <>
                  <LogIn size={18} />
                  Entrar
                </>
              ) : mode === "forgot" ? (
                <>
                  <KeyRound size={18} />
                  Enviar código
                </>
              ) : (
                <>
                  <KeyRound size={18} />
                  Guardar contraseña
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
