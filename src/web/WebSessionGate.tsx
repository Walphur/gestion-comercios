import { useEffect, useState, type ReactNode } from "react";
import { LicenseProvider } from "../context/LicenseContext";
import { WelcomeProvider } from "../context/WelcomeContext";
import TrialOffer from "../pages/TrialOffer";
import { onSessionEnd, webToken } from "./api";

/**
 * WalQo Web: sin sesión de la cuenta no hay base del comercio. Antes de montar la app se
 * muestra la bienvenida de la PC (crear cuenta con prueba Pro o gratis, o entrar).
 */
export default function WebSessionGate({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => webToken() !== "");

  // Recargar descarta lo que la app guardó en memoria del comercio anterior.
  useEffect(() => onSessionEnd(() => window.location.reload()), []);

  if (signedIn) return <>{children}</>;
  return (
    <LicenseProvider>
      <WelcomeProvider>
        <TrialOffer onFinished={() => setSignedIn(true)} />
      </WelcomeProvider>
    </LicenseProvider>
  );
}
