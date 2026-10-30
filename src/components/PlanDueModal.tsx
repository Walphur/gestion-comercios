import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Modal } from "./ui";
import { useLicense, usePaymentCheck } from "../context/LicenseContext";
import { useAuth } from "../context/AuthContext";
import { useAppConfig } from "../context/AppConfig";
import { formatExpiryDate, subscriptionAlert } from "../lib/licenseDisplay";
import { openSalesWhatsApp } from "../lib/supportContact";
import { freePlanLimitsText, suggestedPlanFor } from "../config/pricing";

/** Desde cuántos días antes aparece el cartel cada vez que se entra. */
const DUE_POPUP_DAYS = 3;

/** Cartel al entrar cuando al plan o a la prueba le quedan 3, 2, 1 días o vence hoy. Solo para el dueño. */
export default function PlanDueModal() {
  const { status } = useLicense();
  const { checking, check } = usePaymentCheck();
  const { user, can } = useAuth();
  const { rubro } = useAppConfig();
  const [open, setOpen] = useState(false);
  const shownFor = useRef<number | null>(null);

  const alert = subscriptionAlert(status);
  const due = alert && alert.daysLeft != null && alert.daysLeft <= DUE_POPUP_DAYS ? alert : null;
  const owner = can("manage_admin");

  useEffect(() => {
    if (!user || !due || !owner) return;
    if (shownFor.current === user.id) return;
    shownFor.current = user.id;
    setOpen(true);
  }, [user, due, owner]);

  if (!due || !open) return null;

  const isTrial = due.kind === "trial";
  const days = due.daysLeft ?? 0;
  const plan = suggestedPlanFor(rubro);
  const date = status?.expires_at ? formatExpiryDate(status.expires_at) : null;
  const when =
    days <= 0 ? "hoy" : days === 1 ? "mañana" : `en ${days} días`;
  const title = isTrial
    ? days <= 0
      ? "Hoy termina tu prueba"
      : `Tu prueba termina ${when}`
    : days <= 0
      ? "Tu plan vence hoy"
      : `Tu plan vence ${when}`;

  function pay() {
    void openSalesWhatsApp(
      isTrial
        ? `Hola! Mi prueba de WalQo termina ${when} y quiero contratar ${plan.name}. ¿Me pasás cómo pagar 1 mes, 3 meses o el año?`
        : `Hola! Mi plan de WalQo vence ${when} y quiero renovarlo. ¿Me pasás cómo pagar 1 mes, 3 meses o el año?`,
    );
    setOpen(false);
  }

  async function alreadyPaid() {
    if (await check()) setOpen(false);
  }

  return (
    <Modal
      open
      title={title}
      icon={<AlertTriangle size={18} className={days <= 1 ? "text-red-600" : "text-amber-600"} />}
      onClose={() => setOpen(false)}
    >
      <div className="space-y-3 text-sm">
        <p className="font-medium text-ink">
          {isTrial ? "Contratá tu plan" : "Aboná tu plan"}{" "}
          {days <= 0 ? "hoy" : date ? `antes del ${date}` : "antes de que venza"} para que no se corte el sistema.
        </p>
        <p className="text-ink-muted">
          Si no, WalQo pasa al plan gratis ({freePlanLimitsText(rubro)}): si ya pasaste esos topes, no vas a
          poder vender ni cargar más. No se borra nada de lo cargado y al pagar vuelve todo como estaba.
        </p>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Después
        </Button>
        {!isTrial && (
          <Button variant="secondary" disabled={checking} onClick={() => alreadyPaid()}>
            {checking ? "Consultando…" : "Ya pagué"}
          </Button>
        )}
        <button
          type="button"
          onClick={pay}
          className="rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1ebe57]"
        >
          {isTrial ? "Contratar por WhatsApp" : "Pagar por WhatsApp"}
        </button>
      </div>
    </Modal>
  );
}
