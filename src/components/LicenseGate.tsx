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
    return <TrialOffer />;
  }

  if (status?.active) {
    return <>{children}</>;
  }

  return <LicenseActivation />;
}
