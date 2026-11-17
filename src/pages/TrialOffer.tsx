import { useState } from "react";
import { Cloud, HardDrive, LogIn, Sparkles, UserPlus } from "lucide-react";
import AccountRegister from "../components/AccountRegister";
import AccountLogin from "../components/AccountLogin";
import AppVersionLabel from "../components/AppVersionLabel";
import { useLicense } from "../context/LicenseContext";
import { useWelcome } from "../context/WelcomeContext";
import { APP_TAGLINE } from "../config/product";
import {
  currentSurfaceModality,
  MODALITY_LABEL,
  SIGNUP_MODALITY_SETTING,
  WALQO_WEB_URL,
  WINDOWS_DOWNLOAD_URL,
  type WalqoModality,
} from "../config/modality";
import { trialLengthDays, trialPromoAt } from "../config/trialPromo";
import { setSetting } from "../db/settings";
import walqoWordmark from "../assets/branding/walqo-wordmark-light.png";

type View = "home" | "register" | "login";
type AfterAccount = "trial" | "free";

const SURFACE = currentSurfaceModality();

/**
 * Pantalla de bienvenida WalQo — tema claro, distinto a Qaja.
 * Cuenta (email + contraseña) antes del PIN de empleados.
 * Etapa 1: el comercio elige Escritorio o Web; la preferencia se guarda en settings
 * (signup_modality). Al verificar el email se fija en la licencia (modality_source=signup).
 */
export default function TrialOffer({ onFinished }: { onFinished?: () => void }) {
  const { skipTrialOffer, startTrial } = useLicense();
  const promo = trialPromoAt();
  const trialDays = trialLengthDays();
  const { closeWelcome } = useWelcome();
  const [view, setView] = useState<View>("home");
  const [afterAccount, setAfterAccount] = useState<AfterAccount>("trial");
  const [modality, setModality] = useState<WalqoModality>(SURFACE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const matchesSurface = modality === SURFACE;

  async function rememberSignupModality() {
    await setSetting(SIGNUP_MODALITY_SETTING, modality).catch(() => undefined);
  }

  async function finishAccountFlow() {
    setError("");
    setLoading(true);
    try {
      await rememberSignupModality();
      const next =
        afterAccount === "trial" ? await startTrial() : await skipTrialOffer();
      if (!next.active) {
        setError(next.message ?? "No se pudo continuar");
        setView("home");
        return;
      }
      closeWelcome();
      onFinished?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setView("home");
    } finally {
      setLoading(false);
    }
  }

  function goRegister(mode: AfterAccount) {
    if (!matchesSurface) return;
    setAfterAccount(mode);
    setError("");
    setView("register");
  }

  function goLogin(mode: AfterAccount) {
    if (!matchesSurface) return;
    setAfterAccount(mode);
    setError("");
    setView("login");
  }

  if (view === "register") {
    return (
      <AccountRegister
        signupModality={modality}
        onDone={() => void finishAccountFlow()}
        onBack={() => setView("home")}
      />
    );
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
            <li>{promo ? `${promo.name}: ${trialDays} días de prueba Pro gratis` : `${trialDays} días de prueba Pro gratis`}</li>
            {promo && promo.firstMonthOffPct > 0 && (
              <li>Si después contratás, el primer mes te sale la mitad (hasta el {promo.lastDayLabel})</li>
            )}
          </ul>
        </aside>

        <section className="walqo-auth__panel">
          <div className="walqo-auth__panel-inner">
            <h1 className="walqo-auth__panel-title">Tu comercio, organizado</h1>
            <p className="walqo-auth__panel-lead">
              Primero elegí <strong>dónde</strong> vas a usar WalQo todos los días. Escritorio y Web
              guardan los datos en lugares distintos: no se mezclan solos.
            </p>

            {error && <p className="walqo-auth__error">{error}</p>}

            <fieldset className="walqo-auth__modality">
              <legend className="walqo-auth__q">¿Dónde querés usar WalQo?</legend>
              <div className="walqo-auth__modality-grid" role="radiogroup" aria-label="Modalidad de uso">
                <button
                  type="button"
                  role="radio"
                  aria-checked={modality === "desktop"}
                  className={`walqo-auth__modality-option${modality === "desktop" ? " walqo-auth__modality-option--on" : ""}`}
                  onClick={() => setModality("desktop")}
                >
                  <HardDrive size={22} aria-hidden />
                  <span className="walqo-auth__modality-title">Escritorio</span>
                  <span className="walqo-auth__modality-desc">
                    App en Windows. Datos en esta PC. Vendés aunque se corte internet.
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={modality === "web"}
                  className={`walqo-auth__modality-option${modality === "web" ? " walqo-auth__modality-option--on" : ""}`}
                  onClick={() => setModality("web")}
                >
                  <Cloud size={22} aria-hidden />
                  <span className="walqo-auth__modality-title">Web</span>
                  <span className="walqo-auth__modality-desc">
                    Navegador en walqo.pro/web. Datos en internet. Necesitás conexión.
                  </span>
                </button>
              </div>
            </fieldset>

            {!matchesSurface ? (
              <div className="walqo-auth__modality-switch" role="status">
                {modality === "web" ? (
                  <>
                    <p>
                      Elegiste <strong>Web</strong>. Para crear la cuenta y trabajar en el navegador,
                      abrí WalQo Web.
                    </p>
                    <a
                      className="walqo-auth__btn walqo-auth__btn--primary"
                      href={WALQO_WEB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Cloud size={20} />
                      Abrir WalQo Web
                    </a>
                    <button
                      type="button"
                      className="walqo-auth__btn walqo-auth__btn--secondary"
                      onClick={() => setModality("desktop")}
                    >
                      Prefiero Escritorio acá
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      Elegiste <strong>Escritorio</strong>. Para crear la cuenta y trabajar en la PC,
                      descargá la app de Windows.
                    </p>
                    <a
                      className="walqo-auth__btn walqo-auth__btn--primary"
                      href={WINDOWS_DOWNLOAD_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <HardDrive size={20} />
                      Descargar para Windows
                    </a>
                    <button
                      type="button"
                      className="walqo-auth__btn walqo-auth__btn--secondary"
                      onClick={() => setModality("web")}
                    >
                      Prefiero Web acá
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                <p className="walqo-auth__panel-lead" style={{ marginTop: "0.25rem" }}>
                  Vas a continuar en <strong>{MODALITY_LABEL[modality]}</strong>
                  {modality === "desktop"
                    ? ": los datos quedan en esta computadora."
                    : ": los datos quedan guardados en internet."}{" "}
                  Creá tu cuenta y probá <strong>Pro {trialDays} días gratis</strong>. Después elegís
                  quién entra con PIN.
                </p>

                <button
                  type="button"
                  className="walqo-auth__btn walqo-auth__btn--primary"
                  disabled={loading}
                  onClick={() => goRegister("trial")}
                >
                  <Sparkles size={20} />
                  {loading && afterAccount === "trial" ? "Activando…" : `Probar Pro ${trialDays} días gratis`}
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
                  En los dos casos creás tu cuenta con email y contraseña. El plan gratis queda con hasta 25
                  productos y 50 ventas al mes (en peluquería, 5 servicios y 10 ventas; en celulares, 10 ventas). La
                  prueba Pro vence sola a los {trialDays} días.
                </p>
              </>
            )}

            <div className="walqo-auth__foot">
              <AppVersionLabel variant="light" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
