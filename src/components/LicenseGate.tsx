import { useState, type ReactNode } from "react";
import LicenseActivation from "../pages/LicenseActivation";
import TrialOffer from "../pages/TrialOffer";
import { useLicense } from "../context/LicenseContext";

export default function LicenseGate({ children }: { children: ReactNode }) {
  const { loading, status } = useLicense();
  const [showActivation, setShowActivation] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-muted">
        Verificando licencia…
      </div>
    );
  }

  if (status?.active) {
    return <>{children}</>;
  }

  if (status?.trial_offer_pending && !showActivation) {
    return <TrialOffer onActivateLicense={() => setShowActivation(true)} />;
  }

  return <LicenseActivation />;
}
