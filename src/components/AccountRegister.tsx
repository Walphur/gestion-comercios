import { useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { Button, Card, Input } from "./ui";
import { registerAccount, resendAccountCode, verifyAccountCode } from "../lib/accountAuth";
import { activateLicense } from "../lib/license";
import { setSetting } from "../db/settings";
import { useLicense } from "../context/LicenseContext";

interface Props {
  onDone: () => void;
  onSkip?: () => void;
}

type Step = "form" | "code";

export default function AccountRegister({ onDone, onSkip }: Props) {
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
        /* si falla la activación online, la clave queda en el mail para pegarla a mano */
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
        await saveLocalVerified(
          email.trim().toLowerCase(),
          name.trim(),
          res.license_key,
        );
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-app-bg)] px-4 py-10">
      <Card className="w-full max-w-md p-6 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            {step === "form" ? <Mail size={22} /> : <ShieldCheck size={22} />}
          </div>
          <h1 className="text-xl font-semibold text-ink">
            {step === "form" ? "Creá tu cuenta gratis" : "Verificá tu email"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {step === "form"
              ? "Te mandamos un código de 6 dígitos para confirmar que el mail es tuyo."
              : `Ingresá el código que enviamos a ${email.trim()}.`}
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}
        {info && !error && (
          <p className="mb-4 rounded-lg border border-sky-300/60 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
            {info}
            {devCode ? ` (dev: ${devCode})` : ""}
          </p>
        )}

        {step === "form" ? (
          <div className="space-y-3">
            <Input
              label="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Juan"
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
              label="Teléfono (opcional)"
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
              Enviar código
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
              Verificar cuenta
            </Button>
            <Button variant="secondary" className="w-full" disabled={loading} onClick={() => void handleResend()}>
              Reenviar código
            </Button>
            <Button variant="ghost" className="w-full" disabled={loading} onClick={() => setStep("form")}>
              Cambiar email
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
