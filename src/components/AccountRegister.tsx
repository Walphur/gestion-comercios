import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Mail, Search, ShieldCheck, UserPlus } from "lucide-react";
import { Button, Input } from "./ui";
import { checkSellerCode, registerAccount, resendAccountCode, verifyAccountCode } from "../lib/accountAuth";
import { applyAccountSession } from "../lib/accountSession";
import { setSetting } from "../db/settings";
import { useLicense } from "../context/LicenseContext";
import { APP_NAME } from "../config/product";
import { RUBROS } from "../config/rubros";
import { rubroIcon } from "../config/rubroIcons";
import type { Rubro } from "../types";
import walqoMark from "../assets/branding/walqo-logo.png";

interface Props {
  onDone: () => void;
  onBack: () => void;
}

type Step = "negocio" | "rubro" | "perfil" | "cuenta" | "code";

const WIZARD_STEPS: Step[] = ["negocio", "rubro", "perfil", "cuenta"];

interface Choice {
  id: string;
  label: string;
}

const TEAM_SIZES: Choice[] = [
  { id: "solo", label: "Solo yo" },
  { id: "2-3", label: "2 a 3 personas" },
  { id: "4+", label: "4 o más" },
];

const HEARD_FROM: Choice[] = [
  { id: "instagram", label: "Instagram / Facebook" },
  { id: "google", label: "Google" },
  { id: "recomendacion", label: "Me lo recomendaron" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "otro", label: "Otro" },
];

const PREVIOUS_TOOLS: Choice[] = [
  { id: "cuaderno", label: "Cuaderno" },
  { id: "excel", label: "Excel / planilla" },
  { id: "otro_sistema", label: "Otro sistema" },
  { id: "nada", label: "Recién empiezo" },
];

function goalChoices(group: "comercio" | "servicios"): Choice[] {
  const common: Choice[] = [
    { id: "cobrar", label: "Vender y cobrar rápido" },
    { id: "caja", label: "Ordenar la caja" },
    { id: "ganancia", label: "Saber cuánto gano" },
    { id: "facturar", label: "Facturar (ARCA)" },
  ];
  return group === "servicios"
    ? [{ id: "turnos", label: "Turnos y agenda" }, ...common]
    : [{ id: "stock", label: "Controlar el stock" }, ...common];
}

function ChoiceChips({
  options,
  value,
  onChange,
}: {
  options: Choice[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="walqo-auth__chips" role="radiogroup">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            className={`walqo-auth__chip${on ? " walqo-auth__chip--on" : ""}`}
            onClick={() => onChange(on ? "" : o.id)}
          >
            {on && <Check size={14} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AccountRegister({ onDone, onBack }: Props) {
  const { refresh } = useLicense();
  const [step, setStep] = useState<Step>("negocio");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [rubro, setRubro] = useState<Rubro | null>(null);
  const [rubroQuery, setRubroQuery] = useState("");
  const [heardFrom, setHeardFrom] = useState("");
  const [previousTool, setPreviousTool] = useState("");
  const [goal, setGoal] = useState("");
  const [sellerCode, setSellerCode] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const rubroList = useMemo(
    () => Object.values(RUBROS).sort((a, b) => a.label.localeCompare(b.label, "es")),
    [],
  );

  const filteredRubros = useMemo(() => {
    const q = rubroQuery.trim().toLowerCase();
    if (!q) return rubroList;
    return rubroList.filter(
      (r) => r.label.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
    );
  }, [rubroList, rubroQuery]);

  const rubroGroup = rubro ? RUBROS[rubro].group : "comercio";
  const goals = useMemo(() => goalChoices(rubroGroup), [rubroGroup]);

  const stepIndex = WIZARD_STEPS.indexOf(step);

  const negocioValid = businessName.trim().length >= 2;
  const cuentaValid = name.trim().length >= 2 && email.includes("@") && password.length >= 8;

  function goNext() {
    setError("");
    if (step === "negocio" && negocioValid) setStep("rubro");
    else if (step === "rubro" && rubro) setStep("perfil");
    else if (step === "perfil") void leavePerfil();
  }

  async function leavePerfil() {
    const sc = sellerCode.trim();
    if (!sc) {
      setSellerName("");
      setStep("cuenta");
      return;
    }
    setLoading(true);
    try {
      setSellerName(await checkSellerCode(sc));
      setStep("cuenta");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo revisar el código");
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    setError("");
    if (step === "code") setStep("cuenta");
    else if (stepIndex > 0) setStep(WIZARD_STEPS[stepIndex - 1]);
    else onBack();
  }

  async function handleRegister() {
    if (!rubro) return;
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await registerAccount({
        name: name.trim(),
        email: email.trim(),
        password,
        business_name: businessName.trim(),
        rubro,
        phone: phone.trim() || undefined,
        heard_from: heardFrom || undefined,
        previous_tool: previousTool || undefined,
        goal: goal || undefined,
        team_size: teamSize || undefined,
        seller_code: sellerCode.trim() || undefined,
      });
      if (res.dev_code) {
        setDevCode(res.dev_code);
        setCode(res.dev_code);
      }
      setInfo(res.message || (res.email_sent ? "Revisá tu email." : "Usá el código de abajo."));
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setLoading(false);
    }
  }

  async function saveSignupAnswers() {
    const answers: [string, string][] = [
      ["business_phone", phone.trim()],
      ["signup_team_size", teamSize],
      ["signup_heard_from", heardFrom],
      ["signup_previous_tool", previousTool],
      ["signup_goal", goal],
      ["signup_seller_code", sellerCode.trim()],
    ];
    for (const [key, value] of answers) {
      if (value) await setSetting(key, value);
    }
  }

  async function handleVerify() {
    setError("");
    setLoading(true);
    try {
      const res = await verifyAccountCode(email.trim(), code.trim());
      if (!res.ok || !res.verified) {
        setError(res.message || "Código incorrecto");
        return;
      }
      await applyAccountSession(
        {
          email: res.email || email.trim().toLowerCase(),
          name: res.name || name.trim(),
          business_name: res.business_name || businessName.trim(),
          rubro: res.rubro || rubro || "general",
          license_key: res.license_key,
        },
        refresh,
      );
      await saveSignupAnswers().catch(() => undefined);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo verificar");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError("");
    setLoading(true);
    try {
      const res = await resendAccountCode(email.trim());
      if (res.dev_code) {
        setDevCode(res.dev_code);
        setCode(res.dev_code);
      }
      setInfo(res.message || (res.email_sent ? "Código reenviado." : "Usá el código de abajo."));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reenviar");
    } finally {
      setLoading(false);
    }
  }

  const progress =
    step === "code" ? null : (
      <div className="walqo-auth__progress" aria-label={`Paso ${stepIndex + 1} de ${WIZARD_STEPS.length}`}>
        <div className="walqo-auth__progress-bar">
          {WIZARD_STEPS.map((s, i) => (
            <span
              key={s}
              className={`walqo-auth__progress-seg${i <= stepIndex ? " walqo-auth__progress-seg--on" : ""}`}
            />
          ))}
        </div>
        <span className="walqo-auth__progress-label">
          Paso {stepIndex + 1} de {WIZARD_STEPS.length}
        </span>
      </div>
    );

  const messages = (
    <>
      {error && <p className="walqo-auth__error">{error}</p>}
      {info && !error && <p className={devCode ? "walqo-auth__warn" : "walqo-auth__info"}>{info}</p>}
    </>
  );

  function head(title: string, lead: string) {
    return (
      <div className="walqo-auth__head">
        <img src={walqoMark} alt="" width={40} height={40} className="walqo-auth__mark" />
        <h1>{title}</h1>
        <p>{lead}</p>
      </div>
    );
  }

  return (
    <div className="walqo-auth">
      <div className="walqo-auth__card walqo-auth__card--wide walqo-auth__card--dock">
        <form
          className="walqo-auth__dock-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === "cuenta") void handleRegister();
            else if (step === "code") void handleVerify();
            else goNext();
          }}
        >
          <div className="walqo-auth__card-body">
            <button type="button" className="walqo-auth__back" onClick={handleBack}>
              <ArrowLeft size={18} />
              Volver
            </button>

            {progress}

            {step === "negocio" && (
              <>
                {head("Contanos de tu negocio", `Así dejamos ${APP_NAME} listo para vos.`)}
                {messages}
                <div className="walqo-auth__form">
                  <Input
                    label="¿Cómo se llama tu negocio?"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Ej: Kiosco Don Pedro"
                    autoFocus
                  />
                  <Input
                    label="WhatsApp del negocio (opcional)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="11 1234-5678"
                  />
                  <div>
                    <p className="walqo-auth__q">¿Cuántas personas atienden?</p>
                    <ChoiceChips options={TEAM_SIZES} value={teamSize} onChange={setTeamSize} />
                  </div>
                </div>
              </>
            )}

            {step === "rubro" && (
              <>
                {head("¿Qué vendés?", "Elegí el rubro y adaptamos las pantallas, los productos y los reportes.")}
                {messages}
                <div className="walqo-auth__form">
                  <div className="walqo-auth__search">
                    <Search size={16} aria-hidden />
                    <input
                      value={rubroQuery}
                      onChange={(e) => setRubroQuery(e.target.value)}
                      placeholder="Buscar rubro…"
                      aria-label="Buscar rubro"
                    />
                  </div>
                  <div className="walqo-auth__rubros" role="radiogroup" aria-label="Rubro">
                    {filteredRubros.map((r) => {
                      const Icon = rubroIcon(r.icon);
                      const on = rubro === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          title={r.description}
                          className={`walqo-auth__rubro${on ? " walqo-auth__rubro--on" : ""}`}
                          onClick={() => setRubro(r.id)}
                        >
                          <Icon size={20} aria-hidden />
                          <span>{r.label}</span>
                        </button>
                      );
                    })}
                    {filteredRubros.length === 0 && (
                      <p className="walqo-auth__empty">
                        No encontramos ese rubro. Elegí «General»: sirve para cualquier comercio.
                      </p>
                    )}
                  </div>
                  {rubro && <p className="text-xs text-ink-muted">{RUBROS[rubro].description}</p>}
                </div>
              </>
            )}

            {step === "perfil" && (
              <>
                {head("Unas preguntas rápidas", "Son opcionales y nos ayudan a mostrarte lo que te sirve primero.")}
                {messages}
                <div className="walqo-auth__form">
                  <div>
                    <p className="walqo-auth__q">¿Qué querés resolver primero?</p>
                    <ChoiceChips options={goals} value={goal} onChange={setGoal} />
                  </div>
                  <div>
                    <p className="walqo-auth__q">¿Con qué llevás el negocio hoy?</p>
                    <ChoiceChips options={PREVIOUS_TOOLS} value={previousTool} onChange={setPreviousTool} />
                  </div>
                  <div>
                    <p className="walqo-auth__q">¿Cómo conociste {APP_NAME}?</p>
                    <ChoiceChips options={HEARD_FROM} value={heardFrom} onChange={setHeardFrom} />
                  </div>
                  <Input
                    label="¿Te lo ofreció un vendedor? Código (opcional)"
                    value={sellerCode}
                    onChange={(e) => setSellerCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16))}
                    placeholder="Ej: BRUNO"
                    autoComplete="off"
                  />
                </div>
              </>
            )}

            {step === "cuenta" && (
              <>
                {head("Creá tu cuenta", "Con este email y contraseña entrás desde cualquier computadora.")}
                {messages}
                {sellerName && !error && <p className="walqo-auth__info">Te lo ofreció: {sellerName}</p>}
                <div className="walqo-auth__form">
                  <Input
                    label="Tu nombre"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Juan Pérez"
                    autoFocus
                  />
                  <Input
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    autoComplete="email"
                  />
                  <div className="relative">
                    <Input
                      label="Contraseña"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="walqo-auth__eye"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? "Ocultar" : "Mostrar"}
                    >
                      {showPass ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === "code" && (
              <>
                {head("Verificá tu email", `Ingresá el código que enviamos a ${email.trim()}.`)}
                {messages}
                {devCode && (
                  <div className="walqo-auth__dev-code" role="status">
                    <p className="walqo-auth__dev-code-label">Tu código de verificación</p>
                    <p className="walqo-auth__dev-code-value">{devCode.split("").join(" ")}</p>
                    <p className="walqo-auth__dev-code-hint">
                      El mail no salió todavía (Resend sin configurar). Copiá este código y tocá Verificar.
                    </p>
                  </div>
                )}
                <div className="walqo-auth__form">
                  <Input
                    label="Código de 6 dígitos"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="text-center text-lg tracking-[0.35em]"
                    autoFocus
                  />
                </div>
              </>
            )}
          </div>

          <div className="walqo-auth__card-actions walqo-auth__card-actions--stack">
            {step === "negocio" && (
              <Button type="submit" className="w-full" disabled={!negocioValid}>
                Continuar
                <ArrowRight size={18} />
              </Button>
            )}
            {step === "rubro" && (
              <Button type="submit" className="w-full" disabled={!rubro}>
                Continuar
                <ArrowRight size={18} />
              </Button>
            )}
            {step === "perfil" && (
              <Button type="submit" className="w-full" loading={loading} disabled={loading}>
                {goal || previousTool || heardFrom || sellerCode ? "Continuar" : "Saltear"}
                <ArrowRight size={18} />
              </Button>
            )}
            {step === "cuenta" && (
              <Button type="submit" className="w-full" loading={loading} disabled={loading || !cuentaValid}>
                <UserPlus size={18} />
                Crear cuenta
              </Button>
            )}
            {step === "code" && (
              <>
                <Button type="submit" className="w-full" loading={loading} disabled={loading || code.length !== 6}>
                  <ShieldCheck size={18} />
                  Verificar y continuar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={loading}
                  onClick={() => handleResend()}
                >
                  <Mail size={18} />
                  Reenviar código
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
