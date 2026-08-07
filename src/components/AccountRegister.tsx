import { useState } from "react";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { Button, Input } from "./ui";
import { registerAccount, resendAccountCode, verifyAccountCode } from "../lib/accountAuth";
import { activateLicense } from "../lib/license";
import { setSetting } from "../db/settings";
import { useLicense } from "../context/LicenseContext";
import { APP_NAME } from "../config/product";
import walqoLogo from "../assets/branding/walqo-logo.png";

interface Props {
  onDone: () => void;
  onSkip?: () => void;
  onBack?: () => void;
  /** Estilo oscuro de bienvenida (primera apertura). */
  variant?: "default" | "welcome";
}

type Step = "form" | "code";

export default function AccountRegister({
  onDone,
  onSkip,
  onBack,
  variant = "default",
}: Props) {
  const { refresh } = useLicense();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const welcome = variant === "welcome";

  async function saveLocalVerified(verifiedEmail: string, verifiedName: string, licenseKey?: string) {
    await setSetting("account_email", verifiedEmail);
    await setSetting("account_name", verifiedName);
    await setSetting("account_verified", "1");
    await setSetting("account_prompt_done", "1");
    if (licenseKey) {
      await setSetting("account_license_key", licenseKey);
      try {
        await activateLicense(licenseKey);
        await refresh();
      } catch {
        /* la clave queda guardada / en el mail */
      }
    }
  }

  async function handleRegister() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await registerAccount({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      if (res.already_verified) {
        await saveLocalVerified(email.trim().toLowerCase(), name.trim(), res.license_key);
        onDone();
        return;
      }
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
      await saveLocalVerified(
        res.email || email.trim().toLowerCase(),
        res.name || name.trim(),
        res.license_key,
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

  async function handleSkip() {
    await setSetting("account_prompt_done", "1");
    if (onSkip) onSkip();
    else onDone();
  }

  const body = (
    <>
      {(onBack || welcome) && (
        <button
          type="button"
          className={welcome ? "walqo-welcome__back" : "mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"}
          onClick={() => (step === "code" ? setStep("form") : onBack?.())}
        >
          <ArrowLeft size={18} />
          Volver
        </button>
      )}

      <div className={welcome ? "walqo-welcome__form-head" : "mb-6 text-center"}>
        {!welcome && (
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            {step === "form" ? <Mail size={22} /> : <ShieldCheck size={22} />}
          </div>
        )}
        {welcome && (
          <img src={walqoLogo} alt="" width={56} height={56} className="mx-auto mb-3" />
        )}
        <p className={welcome ? "walqo-welcome__eyebrow" : "sr-only"}>{APP_NAME}</p>
        <h1 className={welcome ? "walqo-welcome__form-title" : "text-xl font-semibold text-ink"}>
          {step === "form" ? "Crear cuenta" : "Verificá tu email"}
        </h1>
        <p className={welcome ? "walqo-welcome__form-sub" : "mt-2 text-sm text-ink-muted"}>
          {step === "form"
            ? "Completá tus datos y empezá en minutos"
            : `Ingresá el código que enviamos a ${email.trim()}.`}
        </p>
      </div>

      {error && (
        <p
          className={
            welcome
              ? "walqo-welcome__error"
              : "mb-4 rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
          }
        >
          {error}
        </p>
      )}
      {info && !error && (
        <p
          className={
            welcome
              ? "mb-4 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100"
              : "mb-4 rounded-lg border border-sky-300/60 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
          }
        >
          {info}
          {devCode ? ` (dev: ${devCode})` : ""}
        </p>
      )}

      {step === "form" ? (
        <div className="space-y-3">
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
          <Input
            label="WhatsApp (opcional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="11 1234-5678"
          />
          <Button
            className="w-full"
            loading={loading}
            disabled={loading || name.trim().length < 2 || !email.includes("@")}
            onClick={() => void handleRegister()}
          >
            Crear cuenta
          </Button>
          {onSkip && (
            <Button variant="ghost" className="w-full" disabled={loading} onClick={() => void handleSkip()}>
              Ahora no
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            label="Código de 6 dígitos"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="text-center text-lg tracking-[0.35em]"
            autoFocus
          />
          <Button
            className="w-full"
            loading={loading}
            disabled={loading || code.length !== 6}
            onClick={() => void handleVerify()}
          >
            Verificar y continuar
          </Button>
          <Button variant="secondary" className="w-full" disabled={loading} onClick={() => void handleResend()}>
            Reenviar código
          </Button>
        </div>
      )}
    </>
  );

  if (welcome) {
    return (
      <div className="walqo-welcome">
        <div className="walqo-welcome__glow" aria-hidden />
        <div className="walqo-welcome__inner walqo-welcome__inner--form">{body}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-app-bg)] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-6 shadow-lg">
        {body}
      </div>
    </div>
  );
}
