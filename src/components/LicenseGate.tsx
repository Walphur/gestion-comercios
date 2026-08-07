import { type ReactNode } from "react";
import LicenseActivation from "../pages/LicenseActivation";
import TrialOffer from "../pages/TrialOffer";
import { useLicense } from "../context/LicenseContext";

export default function LicenseGate({ children }: { children: ReactNode }) {
  const { loading, status } = useLicense();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-muted">
        Verificando…
      </div>
    );
  }

  if (status?.active) {
    return <>{children}</>;
  }

  if (status?.trial_offer_pending) {
    return <TrialOffer />;
  }

  return <LicenseActivation />;
}
