import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import AccountRegister from "../components/AccountRegister";
import AccountLogin from "../components/AccountLogin";
import AppVersionLabel from "../components/AppVersionLabel";
import WalTechCredit from "../components/WalTechCredit";
import { useLicense } from "../context/LicenseContext";
import { useWelcome } from "../context/WelcomeContext";
import { APP_TAGLINE } from "../config/product";
import walqoWordmark from "../assets/branding/walqo-wordmark-light.png";

type View = "home" | "register" | "login";

/**
 * Pantalla de bienvenida WalQo — tema claro, distinto a Qaja.
 * Cuenta (email + contraseña) antes del PIN de empleados.
 */
export default function TrialOffer() {
  const { skipTrialOffer } = useLicense();
  const { closeWelcome } = useWelcome();
  const [view, setView] = useState<View>("home");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function finishAccountFlow() {
    setError("");
    setLoading(true);
    try {
      const next = await skipTrialOffer();
      if (!next.active) {
        setError(next.message ?? "No se pudo continuar");
        return;
      }
      closeWelcome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  if (view === "register") {
    return <AccountRegister onDone={() => void finishAccountFlow()} onBack={() => setView("home")} />;
  }

  if (view === "login") {
    return <AccountLogin onSuccess={() => void finishAccountFlow()} onBack={() => setView("home")} />;
  }

  return (
    <div className="walqo-auth walqo-auth--landing">
      <div className="walqo-auth__split">
        <aside className="walqo-auth__brand">
          <img
            src={walqoWordmark}
            alt="WalQo"
            className="walqo-auth__brand-wordmark"
          />
          <p className="walqo-auth__brand-tag">{APP_TAGLINE}</p>
          <ul className="walqo-auth__features">
            <li>Ventas y caja en un solo lugar</li>
            <li>Stock, clientes y reportes</li>
            <li>Plan gratis para empezar hoy</li>
          </ul>
          <WalTechCredit variant="light" className="walqo-auth__credit" />
        </aside>

        <section className="walqo-auth__panel">
          <div className="walqo-auth__panel-inner">
            <h1 className="walqo-auth__panel-title">Tu comercio, organizado</h1>
            <p className="walqo-auth__panel-lead">
              Para usar WalQo tenés que crear una cuenta o iniciar sesión (email y contraseña).
              Después elegís quién entra con PIN (cajero o administrador).
            </p>

            {error && <p className="walqo-auth__error">{error}</p>}

            <button
              type="button"
              className="walqo-auth__btn walqo-auth__btn--primary"
              disabled={loading}
              onClick={() => setView("register")}
            >
              <UserPlus size={20} />
              Crear cuenta gratis
            </button>

            <button
              type="button"
              className="walqo-auth__btn walqo-auth__btn--secondary"
              disabled={loading}
              onClick={() => setView("login")}
            >
              <LogIn size={20} />
              {loading ? "Entrando…" : "Iniciar sesión"}
            </button>

            <p className="walqo-auth__panel-lead" style={{ marginTop: 14, fontSize: "0.85rem" }}>
              Próximamente: entrar con Google. Por ahora usá email y contraseña.
            </p>

            <div className="walqo-auth__foot">
              <AppVersionLabel variant="light" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
