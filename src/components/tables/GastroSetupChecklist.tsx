import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChefHat, LayoutGrid, QrCode, X } from "lucide-react";
import { Button } from "../ui";
import { useAppConfig } from "../../context/AppConfig";
import { getMenuPortalStatus } from "../../lib/menuPortalPush";
import { getSetting, setSetting } from "../../db/settings";
import type { DiningTable } from "../../db/tables";

const DISMISS_KEY = "gastro_setup_dismissed";

type Step = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  icon: typeof LayoutGrid;
  action?: () => void;
  actionLabel?: string;
};

interface Props {
  tables: DiningTable[];
  canManage: boolean;
  onConfigureTables: () => void;
  onPrintQr: () => void;
  className?: string;
}

/**
 * Guía corta para dejar el salón andando (mesas → QR → cocina).
 * Se oculta cuando está todo listo o si la cierran.
 */
export default function GastroSetupChecklist({
  tables,
  canManage,
  onConfigureTables,
  onPrintQr,
  className = "",
}: Props) {
  const navigate = useNavigate();
  const { kitchenEnabled, setKitchenEnabled } = useAppConfig();
  const [portalOn, setPortalOn] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getSetting(DISMISS_KEY)
      .then((v) => {
        if (!cancelled) setDismissed(v === "1");
      })
      .catch(() => undefined);
    void getMenuPortalStatus()
      .then((s) => {
        if (!cancelled) setPortalOn(Boolean(s?.enabled));
      })
      .catch(() => {
        if (!cancelled) setPortalOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const placed = tables.some(
    (t) => t.pos_x != null && t.pos_y != null && Number.isFinite(t.pos_x) && Number.isFinite(t.pos_y),
  );

  const steps: Step[] = useMemo(
    () => [
      {
        id: "mesas",
        title: "Creá las mesas del salón",
        detail: "Con número (el del QR) y zona si querés.",
        done: tables.length > 0,
        icon: LayoutGrid,
        action: onConfigureTables,
        actionLabel: "Configurar",
      },
      {
        id: "plano",
        title: "Ubicá las mesas en el plano",
        detail: "Tocá «Ubicar mesas» y arrastralas como en el local.",
        done: tables.length > 0 && placed,
        icon: LayoutGrid,
      },
      {
        id: "qr",
        title: "Prendé la tienda web e imprimí los QR",
        detail: "Sin la tienda web el QR no abre. Después «Imprimir QR».",
        done: portalOn === true && tables.length > 0,
        icon: QrCode,
        action: portalOn ? onPrintQr : () => navigate("/admin?section=store"),
        actionLabel: portalOn ? "Imprimir QR" : "Tienda web",
      },
      {
        id: "cocina",
        title: "Prendé la pantalla Cocina",
        detail: "Para ver las comandas nuevas en la cocina o barra.",
        done: kitchenEnabled,
        icon: ChefHat,
        action: kitchenEnabled
          ? () => navigate("/cocina")
          : () => {
              void setKitchenEnabled(true);
            },
        actionLabel: kitchenEnabled ? "Ver cocina" : "Activar",
      },
    ],
    [tables.length, placed, portalOn, kitchenEnabled, onConfigureTables, onPrintQr, navigate, setKitchenEnabled],
  );

  const pending = steps.filter((s) => !s.done).length;
  if (!canManage || dismissed || portalOn === null || pending === 0) return null;

  return (
    <div
      className={`mb-4 min-w-0 rounded-2xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] p-4 shadow-[var(--shadow-sm)] ${className}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-ink">Dejá el salón listo</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {pending === 1 ? "Te falta 1 paso." : `Te faltan ${pending} pasos.`} Mesas, QR y cocina.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-brand-50 hover:text-ink dark:hover:bg-brand-950/40"
          aria-label="Ocultar la guía del salón"
          title="Ocultar"
          onClick={() => {
            setDismissed(true);
            void setSetting(DISMISS_KEY, "1");
          }}
        >
          <X size={16} />
        </button>
      </div>
      <ol className="mt-3 min-w-0 space-y-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li
              key={step.id}
              className={`flex min-w-0 items-start gap-3 rounded-xl px-2 py-2 ${
                step.done ? "opacity-70" : "bg-[var(--color-input-bg)]"
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  step.done
                    ? "bg-[var(--color-success)] text-white"
                    : "bg-brand-500/15 text-brand-700 dark:text-brand-300"
                }`}
                aria-hidden
              >
                {step.done ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{step.title}</p>
                {!step.done ? <p className="text-xs text-ink-muted">{step.detail}</p> : null}
              </div>
              {!step.done && step.action ? (
                <Button size="sm" variant="secondary" className="shrink-0" onClick={step.action}>
                  {step.actionLabel ?? "Ir"}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
