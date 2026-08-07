import { useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { Button, Input } from "./ui";
import { registerAccount, resendAccountCode, verifyAccountCode } from "../lib/accountAuth";
import { applyAccountSession } from "../lib/accountSession";
import { useLicense } from "../context/LicenseContext";
import { APP_NAME } from "../config/product";
import { RUBROS } from "../config/rubros";
import type { Rubro } from "../types";
import walqoMark from "../assets/branding/walqo-logo.png";

interface Props {
  onDone: () => void;
  onBack: () => void;
}

type Step = "form" | "code";

export default function AccountRegister({ onDone, onBack }: Props) {
  const { refresh } = useLicense();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [rubro, setRubro] = useState<Rubro>("general");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const rubroList = useMemo(
    () => Object.values(RUBROS).sort((a, b) => a.label.localeCompare(b.label, "es")),
    [],
  );

  const formValid =
    name.trim().length >= 2 &&
    email.includes("@") &&
    password.length >= 8 &&
    businessName.trim().length >= 2;

  async function handleRegister() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await registerAccount({
        name: name.trim(),
        email: email.trim(),
        password,
        business_name: businessName.trim(),
        rubro,
        phone: phone.trim() || undefined,
      });
      if (res.dev_code) setDevCode(res.dev_code);
      setInfo(res.message || "Revisá tu email.");
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setError("");
    setLoading(true);
    try {
      const res = await verifyAccountCode(email.trim(), code.trim());
      if (!res.ok || !res.verified) {
        setError(res.message || "Código incorrecto");
        return;
      }
      await applyAccountSession(
        {
          email: res.email || email.trim().toLowerCase(),
          name: res.name || name.trim(),
          business_name: res.business_name || businessName.trim(),
          rubro: res.rubro || rubro,
          license_key: res.license_key,
        },
        refresh,
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo verificar");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError("");
    setLoading(true);
    try {
      const res = await resendAccountCode(email.trim());
      if (res.dev_code) setDevCode(res.dev_code);
      setInfo(res.message || "Código reenviado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reenviar");
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (step === "code") setStep("form");
    else onBack();
  }

  return (
    <div className="walqo-auth">
      <div className="walqo-auth__card walqo-auth__card--wide">
        <button type="button" className="walqo-auth__back" onClick={handleBack}>
          <ArrowLeft size={18} />
          Volver
        </button>

        <div className="walqo-auth__head">
          <img src={walqoMark} alt="" width={48} height={48} className="walqo-auth__mark" />
          <h1>{step === "form" ? "Crear cuenta" : "Verificá tu email"}</h1>
          <p>
            {step === "form"
              ? `Registrate en ${APP_NAME} y configurá tu comercio en un paso.`
              : `Ingresá el código que enviamos a ${email.trim()}.`}
          </p>
        </div>

        {error && <p className="walqo-auth__error">{error}</p>}
        {info && !error && (
          <p className="walqo-auth__info">
            {info}
            {devCode ? ` (dev: ${devCode})` : ""}
          </p>
        )}

        {step === "form" ? (
          <form
            className="walqo-auth__form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleRegister();
            }}
          >
            <Input
              label="Nombre completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Juan Pérez"
              autoFocus
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
            <div className="relative">
              <Input
                label="Contraseña"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="walqo-auth__eye"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? "Ocultar" : "Mostrar"}
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <Input
              label="Nombre del negocio"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Mi kiosco"
            />
            <Input
              label="WhatsApp (opcional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="11 1234-5678"
            />
            <div>
              <label className="field-label">Rubro / tipo de negocio</label>
              <select
                className="wt-field wt-select w-full rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-3.5 py-3 text-sm text-ink"
                value={rubro}
                onChange={(e) => setRubro(e.target.value as Rubro)}
              >
                {rubroList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-ink-muted">{RUBROS[rubro].description}</p>
            </div>
            <Button type="submit" className="w-full" loading={loading} disabled={loading || !formValid}>
              <UserPlus size={18} />
              Crear cuenta
            </Button>
          </form>
        ) : (
          <form
            className="walqo-auth__form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleVerify();
            }}
          >
            <Input
              label="Código de 6 dígitos"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="text-center text-lg tracking-[0.35em]"
              autoFocus
            />
            <Button type="submit" className="w-full" loading={loading} disabled={loading || code.length !== 6}>
              <ShieldCheck size={18} />
              Verificar y continuar
            </Button>
            <Button variant="secondary" className="w-full" disabled={loading} onClick={() => void handleResend()}>
              <Mail size={18} />
              Reenviar código
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
