import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Play, Target, X } from "lucide-react";
import { Button, Card } from "./ui";
import { getFirstStepsSnapshot, type FirstStepsSnapshot } from "../db/firstSteps";
import { setSetting } from "../db/settings";
import { buildFirstSteps, type FirstStep } from "../lib/firstSteps";
import { openExternalUrl } from "../lib/openExternal";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { useLicense } from "../context/LicenseContext";

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  return (
    <div className="first-steps__ring" aria-hidden>
      <svg viewBox="0 0 52 52" width="52" height="52">
        <circle cx="26" cy="26" r={r} className="first-steps__ring-track" />
        <circle
          cx="26"
          cy="26"
          r={r}
          className="first-steps__ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className="first-steps__ring-label">
        {done}/{total}
      </span>
    </div>
  );
}

/** Lo que falta para dejar el negocio andando, según el rubro y lo elegido al registrarse. */
export default function FirstStepsCard() {
  const { businessName, features, isProModuleActive, rubroDef } = useAppConfig();
  const { can } = useAuth();
  const { status } = useLicense();
  const navigate = useNavigate();
  const [snap, setSnap] = useState<FirstStepsSnapshot | null>(null);
  const [hidden, setHidden] = useState(false);

  const canSetup = can("manage_admin");

  useEffect(() => {
    if (!canSetup) return;
    let cancelled = false;
    getFirstStepsSnapshot()
      .then((s) => {
        if (!cancelled) setSnap(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canSetup]);

  const steps = useMemo(
    () =>
      snap
        ? buildFirstSteps(snap, {
            rubro: rubroDef,
            features,
            appointments: isProModuleActive("appointments"),
            pro: isProModuleActive,
          })
        : [],
    [snap, rubroDef, features, isProModuleActive],
  );

  if (!canSetup || !snap || snap.dismissed || hidden || steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const pending = steps.length - doneCount;
  if (pending === 0) return null;

  const planLine = status?.is_trial
    ? `Te ${status.trial_days_left === 1 ? "queda 1 día" : `quedan ${status.trial_days_left ?? 7} días`} de Pro: aprovechalos para probar todo.`
    : status?.billing === "free"
      ? "Plan gratis: hasta 25 productos y 50 ventas por mes."
      : null;

  function go(step: FirstStep) {
    if (step.seenKey) {
      void setSetting(`first_steps_seen_${step.seenKey}`, "1");
      setSnap((prev) =>
        prev ? { ...prev, seen: { ...prev.seen, [step.seenKey as string]: true } } : prev,
      );
    }
    navigate(step.to);
  }

  function dismiss() {
    setHidden(true);
    void setSetting("first_steps_dismissed", "1");
  }

  return (
    <Card variant="elevated" className="first-steps">
      <div className="first-steps__head">
        <ProgressRing done={doneCount} total={steps.length} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-ink">Arrancá con WalQo</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {pending === 1
              ? `Te falta 1 paso para tener ${businessName} andando.`
              : `Te faltan ${pending} pasos para tener ${businessName} andando.`}
          </p>
          {planLine && <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-300">{planLine}</p>}
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-brand-50 hover:text-ink dark:hover:bg-brand-950/40"
          aria-label="Ocultar los primeros pasos"
          title="Ocultar"
          onClick={dismiss}
        >
          <X size={16} />
        </button>
      </div>

      <ol className="first-steps__list">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`first-steps__item${step.done ? " first-steps__item--done" : ""}${
              step.goal && !step.done ? " first-steps__item--goal" : ""
            }`}
          >
            <span className="first-steps__check" aria-hidden>
              {step.done && <Check size={14} strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              {step.goal && !step.done && (
                <span className="first-steps__goal">
                  <Target size={11} />
                  Lo elegiste primero
                </span>
              )}
              <p className="first-steps__title">{step.title}</p>
              {!step.done && <p className="first-steps__detail">{step.detail}</p>}
            </div>
            {!step.done && (
              <div className="first-steps__actions">
                {step.video && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="!px-2"
                    onClick={() => void openExternalUrl(step.video!)}
                    title="Ver el video en walqo.pro"
                    aria-label={`Ver el video: ${step.title}`}
                  >
                    <Play size={13} />
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => go(step)}>
                  Hacerlo
                  <ArrowRight size={13} />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
