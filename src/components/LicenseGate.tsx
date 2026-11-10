import { type ReactNode } from "react";
import LicenseActivation from "../pages/LicenseActivation";
import TrialOffer from "../pages/TrialOffer";
import { useLicense } from "../context/LicenseContext";
import { useWelcome } from "../context/WelcomeContext";

export default function LicenseGate({ children }: { children: ReactNode }) {
  const { loading, status } = useLicense();
  const { forceWelcome } = useWelcome();

  if (loading) {
    return (
      <div className="walqo-brand-lock flex h-screen items-center justify-center bg-[#e8eef5] text-slate-500">
        Verificando…
      </div>
    );
  }

  if (forceWelcome || status?.trial_offer_pending) {
    // En la web, entrar con otra cuenta cambia de comercio: se recarga para no mezclar datos.
    return <TrialOffer onFinished={import.meta.env.MODE === "web" ? () => window.location.reload() : undefined} />;
  }

  if (status?.active) {
    return <>{children}</>;
  }

  return <LicenseActivation />;
}
