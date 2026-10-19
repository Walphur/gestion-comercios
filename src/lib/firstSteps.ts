import type { FirstStepsSnapshot, FirstStepsSeenKey } from "../db/firstSteps";
import { GUIDE_VIDEOS, rubroExample, type HelpContext } from "../config/helpTopics";

export interface FirstStep {
  id: string;
  title: string;
  detail: string;
  to: string;
  done: boolean;
  video?: string;
  /** Al tocar «Hacerlo» se marca hecho (pasos que no dejan rastro en la base). */
  seenKey?: FirstStepsSeenKey;
  /** Coincide con lo que eligió resolver primero al registrarse. */
  goal?: boolean;
}

const GOAL_STEP: Record<string, string> = {
  cobrar: "venta",
  stock: "catalogo",
  ganancia: "catalogo",
  caja: "caja",
  turnos: "turno",
  facturar: "arca",
};

export function buildFirstSteps(snap: FirstStepsSnapshot, ctx: HelpContext): FirstStep[] {
  const clinic = ctx.rubro.id === "clinica";
  const services = ctx.rubro.group === "servicios";
  const sells = ctx.features.pos && !clinic;
  const example = rubroExample(ctx.rubro.id);
  const steps: FirstStep[] = [];

  if (snap.accountVerified) {
    steps.push({
      id: "cuenta",
      title: "Cuenta creada",
      detail: "Entrás con tu email y contraseña desde cualquier computadora.",
      to: "/",
      done: true,
    });
  }

  if (ctx.features.products) {
    steps.push({
      id: "catalogo",
      title: services ? "Cargá tu primer servicio" : "Cargá tu primer producto",
      detail:
        snap.goal === "ganancia"
          ? `Ej: ${example}. Poné también el costo: así ves cuánto ganás.`
          : services
            ? `Ej: ${example}. Con precio y duración.`
            : `Ej: ${example}. Escaneá el código o escribilo a mano.`,
      to: services ? "/productos?vista=servicios" : "/productos?nuevo=1",
      done: snap.ownProducts > 0,
      video: services ? undefined : GUIDE_VIDEOS.producto,
    });
  }

  if (ctx.appointments && services) {
    steps.push({
      id: "profesional",
      title: "Sumá a quien atiende",
      detail: "Cada profesional con su agenda y sus servicios.",
      to: "/admin?section=team",
      done: snap.professionals > 0,
    });
  }

  if (ctx.appointments) {
    steps.push({
      id: "turno",
      title: "Agendá el primer turno",
      detail: "Después compartí tu enlace de walqo.pro para que reserven solos.",
      to: "/turnos/nuevo",
      done: snap.appointments > 0,
    });
  }

  if (sells) {
    steps.push({
      id: "caja",
      title: "Abrí la caja",
      detail: "Contá el efectivo con el que arrancás el día.",
      to: "/caja",
      done: snap.cashSessions > 0,
    });
    steps.push({
      id: "venta",
      title: "Hacé tu primera venta",
      detail: services
        ? "Cobrá un servicio desde el punto de venta o desde el turno."
        : "Sumá productos al ticket y cobrá con F2.",
      to: "/pos",
      done: snap.sales > 0,
      video: services ? undefined : GUIDE_VIDEOS.venta,
    });
  }

  if (snap.teamSize && snap.teamSize !== "solo") {
    steps.push({
      id: "equipo",
      title: "Dale un PIN a cada persona",
      detail: "Así sabés quién vendió y quién abrió la caja.",
      to: "/empleados",
      done: snap.activeUsers > 1,
    });
  }

  if (snap.goal === "facturar" && ctx.features.invoicing && !clinic) {
    steps.push({
      id: "arca",
      title: "Prepará la facturación",
      detail: "Cargá tus datos de ARCA para emitir comprobantes.",
      to: "/admin?section=arca",
      done: snap.seen.arca === true,
      seenKey: "arca",
    });
  }

  if (!clinic) {
    steps.push({
      id: "celular",
      title: "Tu negocio en el celular",
      detail: "Ventas del día y stock, sin estar en el local.",
      to: "/admin?section=owner-portal",
      done: snap.seen.celular === true,
      seenKey: "celular",
    });
  }

  const goalId = GOAL_STEP[snap.goal];
  for (const s of steps) {
    if (s.id === goalId) s.goal = true;
  }

  const rank = (s: FirstStep) => (s.done ? 2 : s.goal ? 0 : 1);
  return steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map(({ s }) => s);
}
