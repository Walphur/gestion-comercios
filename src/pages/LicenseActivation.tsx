import { useState } from "react";
import { KeyRound, Monitor, Wifi, WifiOff } from "lucide-react";
import { Button, Card, Input } from "../components/ui";
import WalTechCredit from "../components/WalTechCredit";
import SupportLegalLinks from "../components/SupportLegalLinks";
import VirtualAssistButton from "../components/VirtualAssistButton";
import AppVersionLabel from "../components/AppVersionLabel";
import { useLicense } from "../context/LicenseContext";
import { planLabel } from "../lib/license";

export default function LicenseActivation() {
  const { status, activate } = useLicense();
  const [key, setKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const next = await activate(key.trim());
      if (!next.active) {
        setError(next.message ?? "No se pudo activar la licencia");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de activación");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-app-bg)] px-4 py-10">
      <Card className="w-full max-w-md p-6 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            <KeyRound size={22} />
          </div>
          <h1 className="text-xl font-semibold text-ink">Activar licencia</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Ingresá la clave que recibiste con tu compra. Cada licencia se vincula a esta PC.
          </p>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Clave de licencia</label>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="GC-XXXX-XXXX-XXXX"
              autoFocus
              spellCheck={false}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting || key.trim().length < 8}>
            {submitting ? "Activando…" : "Activar en esta PC"}
          </Button>
        </form>

        <div className="mt-5 space-y-2 rounded-xl border border-[var(--color-panel-border)] bg-slate-50/80 p-3 text-xs text-ink-muted dark:bg-slate-900/30">
          <p className="flex items-center gap-2">
            <Monitor size={14} />
            ID de esta PC: <span className="font-mono text-[10px] text-ink">{status?.machine_id?.slice(0, 16)}…</span>
          </p>
          <p className="flex items-start gap-2">
            <Wifi size={14} className="mt-0.5 shrink-0" />
            Se requiere internet la primera vez. Después podés usar hasta 14 días sin conexión.
          </p>
          <p className="flex items-start gap-2">
            <WifiOff size={14} className="mt-0.5 shrink-0" />
            Plan Básico: 1 PC. Plan Pro: 2 o más PCs según tu compra.
          </p>
        </div>

        {status?.active && (
          <p className="mt-4 text-center text-sm font-medium text-brand-700 dark:text-brand-300">
            Licencia {planLabel(status.plan)} activa
          </p>
        )}
      </Card>

      <div className="mt-6 flex w-full max-w-md flex-col items-center gap-3">
        <VirtualAssistButton className="max-w-sm" />
        <WalTechCredit />
        <AppVersionLabel />
        <p className="text-xs text-ink-muted">¿Problemas? Escribinos con tu clave y el ID de PC.</p>
        <SupportLegalLinks className="mt-2" />
      </div>
    </div>
  );
}
