import { useState } from "react";
import { LogIn, Sparkles, UserPlus } from "lucide-react";
import AccountRegister from "../components/AccountRegister";
import AccountLogin from "../components/AccountLogin";
import AppVersionLabel from "../components/AppVersionLabel";
import { useLicense } from "../context/LicenseContext";
import { useWelcome } from "../context/WelcomeContext";
import { APP_TAGLINE } from "../config/product";
import walqoWordmark from "../assets/branding/walqo-wordmark-light.png";

type View = "home" | "register" | "login";
type AfterAccount = "trial" | "free";

/**
 * Pantalla de bienvenida WalQo — tema claro, distinto a Qaja.
 * Cuenta (email + contraseña) antes del PIN de empleados.
 * Por defecto activa la prueba Pro de 7 días; opcional plan gratis.
 */
export default function TrialOffer() {
  const { skipTrialOffer, startTrial } = useLicense();
  const { closeWelcome } = useWelcome();
  const [view, setView] = useState<View>("home");
  const [afterAccount, setAfterAccount] = useState<AfterAccount>("trial");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function finishAccountFlow() {
    setError("");
    setLoading(true);
    try {
      const next =
        afterAccount === "trial" ? await startTrial() : await skipTrialOffer();
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

  function goRegister(mode: AfterAccount) {
    setAfterAccount(mode);
    setError("");
    setView("register");
  }

  function goLogin(mode: AfterAccount) {
    setAfterAccount(mode);
    setError("");
    setView("login");
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
            <li>7 días de prueba Pro gratis</li>
          </ul>
        </aside>

        <section className="walqo-auth__panel">
          <div className="walqo-auth__panel-inner">
            <h1 className="walqo-auth__panel-title">Tu comercio, organizado</h1>
            <p className="walqo-auth__panel-lead">
              Creá tu cuenta y probá <strong>Pro 7 días gratis</strong> (casi todo desbloqueado).
              Después elegís quién entra con PIN (cajero o administrador).
            </p>

            {error && <p className="walqo-auth__error">{error}</p>}

            <button
              type="button"
              className="walqo-auth__btn walqo-auth__btn--primary"
              disabled={loading}
              onClick={() => goRegister("trial")}
            >
              <Sparkles size={20} />
              {loading && afterAccount === "trial" ? "Activando…" : "Probar Pro 7 días gratis"}
            </button>

            <button
              type="button"
              className="walqo-auth__btn walqo-auth__btn--secondary"
              disabled={loading}
              onClick={() => goLogin("trial")}
            >
              <LogIn size={20} />
              Ya tengo cuenta — iniciar sesión
            </button>

            <button
              type="button"
              className="walqo-auth__btn walqo-auth__btn--secondary"
              disabled={loading}
              onClick={() => goRegister("free")}
              style={{ marginTop: "0.25rem" }}
            >
              <UserPlus size={20} />
              Preferir plan gratis (sin Pro)
            </button>

            <p className="walqo-auth__panel-lead" style={{ marginTop: "0.75rem", marginBottom: 0, fontSize: "0.8rem" }}>
              El plan gratis queda con hasta 25 productos y 50 ventas al mes. La prueba Pro vence sola a
              los 7 días.
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
