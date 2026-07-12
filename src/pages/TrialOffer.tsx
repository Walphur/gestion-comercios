import { useState } from "react";
import { KeyRound, Sparkles } from "lucide-react";
import { Button, Card } from "../components/ui";
import WalTechCredit from "../components/WalTechCredit";
import SupportLegalLinks from "../components/SupportLegalLinks";
import VirtualAssistButton from "../components/VirtualAssistButton";
import AppVersionLabel from "../components/AppVersionLabel";
import { useLicense } from "../context/LicenseContext";

interface Props {
  onActivateLicense: () => void;
}

export default function TrialOffer({ onActivateLicense }: Props) {
  const { startTrial, skipTrialOffer } = useLicense();
  const [loading, setLoading] = useState<"trial" | "skip" | null>(null);
  const [error, setError] = useState("");

  async function handleStartTrial() {
    setError("");
    setLoading("trial");
    try {
      const next = await startTrial();
      if (!next.active) {
        setError(next.message ?? "No se pudo iniciar la prueba");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar la prueba");
    } finally {
      setLoading(null);
    }
  }

  async function handleActivateInstead() {
    setError("");
    setLoading("skip");
    try {
      await skipTrialOffer();
      onActivateLicense();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-app-bg)] px-4 py-10">
      <Card className="w-full max-w-md p-6 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            <Sparkles size={22} />
          </div>
          <h1 className="text-xl font-semibold text-ink">Probá 7 días gratis</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Usá todas las funciones Pro del programa durante una semana, sin tarjeta ni compromiso.
            Después podés activar tu licencia o dejar de usar la app.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <Button
            type="button"
            className="w-full"
            disabled={loading !== null}
            loading={loading === "trial"}
            onClick={() => void handleStartTrial()}
          >
            Empezar prueba de 7 días
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={loading !== null}
            loading={loading === "skip"}
            onClick={() => void handleActivateInstead()}
          >
            <KeyRound size={16} /> Ya tengo licencia GC
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-ink-muted">
          Esta oferta solo aparece el primer día. Si ya tenés clave GC, usá el segundo botón.
        </p>
      </Card>

      <div className="mt-6 flex w-full max-w-md flex-col items-center gap-3">
        <VirtualAssistButton className="max-w-sm" />
        <WalTechCredit />
        <AppVersionLabel />
        <SupportLegalLinks className="mt-2" />
      </div>
    </div>
  );
}
