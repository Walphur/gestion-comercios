import { useState } from "react";
import { Mail } from "lucide-react";
import AccountRegister from "../components/AccountRegister";
import AppVersionLabel from "../components/AppVersionLabel";
import { useLicense } from "../context/LicenseContext";
import { APP_NAME, APP_TAGLINE } from "../config/product";
import walqoLogo from "../assets/branding/walqo-logo.png";

interface Props {
  onActivateLicense?: () => void;
}

/**
 * Pantalla de bienvenida (primera apertura).
 * Solo marca + registrarse / continuar. Licencia y planes van después.
 */
export default function TrialOffer(_props: Props) {
  const { skipTrialOffer } = useLicense();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRegister, setShowRegister] = useState(false);

  async function continueFree() {
    setError("");
    setLoading(true);
    try {
      const next = await skipTrialOffer();
      if (!next.active) {
        setError(next.message ?? "No se pudo continuar");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  if (showRegister) {
    return (
      <AccountRegister
        variant="welcome"
        onDone={() => void continueFree()}
        onBack={() => setShowRegister(false)}
      />
    );
  }

  return (
    <div className="walqo-welcome">
      <div className="walqo-welcome__glow" aria-hidden />
      <div className="walqo-welcome__inner">
        <img className="walqo-welcome__mark" src={walqoLogo} alt="" width={88} height={88} />
        <p className="walqo-welcome__eyebrow">{APP_NAME}</p>
        <h1 className="walqo-welcome__title">{APP_NAME}</h1>
        <p className="walqo-welcome__tagline">{APP_TAGLINE}</p>
        <p className="walqo-welcome__lead">
          El sistema para tu comercio: ventas, stock, caja, clientes y reportes en una sola app.
        </p>

        {error && <p className="walqo-welcome__error">{error}</p>}

        <button
          type="button"
          className="walqo-welcome__cta"
          disabled={loading}
          onClick={() => setShowRegister(true)}
        >
          <Mail size={18} strokeWidth={2} />
          Registrarse con Email
        </button>

        <p className="walqo-welcome__login">
          ¿Ya tenés cuenta?{" "}
          <button type="button" disabled={loading} onClick={() => void continueFree()}>
            {loading ? "Entrando…" : "Continuar"}
          </button>
        </p>

        <div className="walqo-welcome__foot">
          <AppVersionLabel />
        </div>
      </div>
    </div>
  );
}
