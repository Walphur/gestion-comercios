import { ACTION_LIMITS } from "./constants";
import type { AlertEvaluationResult, BusinessAlert, BusinessAlertSeverity } from "./alertTypes";
import type {
  ActionEvaluationContext,
  ActionEvaluationResult,
  BusinessAction,
  BusinessActionKind,
  BusinessActionUrgency,
} from "./actionTypes";
import type { IntelligenceSnapshot } from "./types";

const SEVERITY_BOOST: Record<BusinessAlertSeverity, number> = {
  critical: 1000,
  warning: 500,
  info: 100,
};

function urgencyFromSeverity(severity: BusinessAlertSeverity): BusinessActionUrgency {
  if (severity === "critical") return "now";
  if (severity === "warning") return "today";
  return "this_week";
}

function labelBeforeColon(message: string): string {
  const idx = message.indexOf(":");
  return idx > 0 ? message.slice(0, idx).trim() : message.trim();
}

function baseFromAlert(alert: BusinessAlert): Pick<
  BusinessAction,
  "link" | "entity_type" | "entity_id" | "source_alert_ids" | "priority" | "urgency"
> {
  return {
    link: alert.link,
    entity_type: alert.entity_type,
    entity_id: alert.entity_id,
    source_alert_ids: [alert.id],
    priority: alert.priority + SEVERITY_BOOST[alert.severity],
    urgency: urgencyFromSeverity(alert.severity),
  };
}

function alertToAction(alert: BusinessAlert): BusinessAction | null {
  const base = baseFromAlert(alert);
  const name = labelBeforeColon(alert.message);

  switch (alert.type) {
    case "sync_conflict":
      return {
        id: `action-${alert.id}`,
        kind: "resolve_sync",
        category: "sync",
        title: "Resolver conflictos de sincronización",
        reason: alert.message,
        link_label: "Ir a Admin",
        ...base,
      };
    case "sync_pending":
      return null;
    case "sales_drop":
      return {
        id: `action-${alert.id}`,
        kind: "analyze_sales",
        category: "sales",
        title: "Analizar caída de ventas",
        reason: alert.message,
        link_label: "Ver reportes",
        ...base,
      };
    case "units_drop":
      return {
        id: `action-${alert.id}`,
        kind: "analyze_units",
        category: "sales",
        title: "Investigar caída de unidades vendidas",
        reason: alert.message,
        link_label: "Ver reportes",
        ...base,
      };
    case "stock_critical": {
      const out = alert.title === "Sin stock";
      return {
        ...base,
        id: `action-${alert.id}`,
        kind: "replenish_stock",
        category: "stock",
        title: out ? `Reponer: ${name}` : `Revisar stock bajo: ${name}`,
        reason: alert.message,
        link_label: out ? "Ir a stock" : "Ver producto",
        link: out ? "/stock" : alert.link,
      };
    }
    case "stock_low_coverage":
      return {
        id: `action-${alert.id}`,
        kind: "review_coverage",
        category: "stock",
        title: `Revisar reposición estimada: ${name}`,
        reason: alert.message,
        link_label: "Ver producto",
        ...base,
      };
    case "stock_no_movement":
      return {
        id: `action-${alert.id}`,
        kind: "promote_slow_moving",
        category: "stock",
        title: `Promocionar o dar de baja: ${name}`,
        reason: alert.message,
        link_label: "Ver producto",
        ...base,
      };
    case "products_expiring":
      return {
        id: `action-${alert.id}`,
        kind: "review_expiring",
        category: "stock",
        title: "Revisar productos por vencer",
        reason: alert.message,
        link_label: "Ir a stock",
        ...base,
      };
    case "margin_low":
      return {
        id: `action-${alert.id}`,
        kind: "review_margin",
        category: "margin",
        title: `Revisar precio o costo: ${name}`,
        reason: alert.message,
        link_label: "Ver producto",
        ...base,
      };
    case "margin_deteriorated":
      return {
        id: `action-${alert.id}`,
        kind: "review_margin",
        category: "margin",
        title: `Ajustar margen vendido: ${name}`,
        reason: alert.message,
        link_label: "Ver producto",
        ...base,
      };
    case "customer_at_risk":
      return {
        id: `action-${alert.id}`,
        kind: "contact_customers",
        category: "customers",
        title: "Contactar clientes en riesgo",
        reason: alert.message,
        link_label: "Ver clientes",
        ...base,
      };
    case "customer_credit_limit":
      return {
        id: `action-${alert.id}`,
        kind: "review_credit",
        category: "customers",
        title: `Revisar límite de crédito: ${name}`,
        reason: alert.message,
        link_label: "Ver clientes",
        ...base,
      };
    case "customer_debt":
      return {
        id: `action-${alert.id}`,
        kind: "collect_debt",
        category: "customers",
        title: `Cobrar deuda: ${name}`,
        reason: alert.message,
        link_label: "Ver clientes",
        ...base,
      };
    case "quote_expiring":
    case "quote_stale":
      return {
        id: `action-${alert.id}`,
        kind: "follow_quote",
        category: "quotes",
        title: alert.type === "quote_expiring" ? "Seguir presupuesto por vencer" : "Retomar presupuesto sin respuesta",
        reason: alert.message,
        link_label: "Ver presupuesto",
        ...base,
      };
    case "cash_difference":
      return {
        id: `action-${alert.id}`,
        kind: "review_cash",
        category: "cash",
        title: "Revisar diferencia en arqueo",
        reason: alert.message,
        link_label: "Ir a caja",
        ...base,
      };
    default:
      return null;
  }
}

function shouldSkipAlertForAction(alert: BusinessAlert, kindsSeen: Set<BusinessActionKind>): boolean {
  if (alert.type === "sync_pending") return true;
  if (alert.type === "units_drop" && kindsSeen.has("analyze_sales")) return true;
  return false;
}

function groupReplenishActions(actions: BusinessAction[]): BusinessAction[] {
  const replenish = actions.filter((a) => a.kind === "replenish_stock");
  if (replenish.length <= ACTION_LIMITS.groupStockAfter) return actions;

  const others = actions.filter((a) => a.kind !== "replenish_stock");
  const sorted = [...replenish].sort((a, b) => b.priority - a.priority);
  const keep = sorted.slice(0, ACTION_LIMITS.keepIndividualStock);
  const groupedRest = sorted.slice(ACTION_LIMITS.keepIndividualStock);
  const outOfStock = groupedRest.filter((a) => a.title.startsWith("Reponer:")).length;

  const grouped: BusinessAction = {
    id: "action-group-replenish",
    kind: "replenish_stock",
    category: "stock",
    urgency: outOfStock > 0 ? "now" : "today",
    title: `Reponer stock de ${groupedRest.length + keep.length} productos`,
    reason:
      outOfStock > 0
        ? `${outOfStock + keep.filter((a) => a.title.startsWith("Reponer:")).length} sin stock y ${groupedRest.length + keep.length - outOfStock} bajo mínimo.`
        : `${groupedRest.length + keep.length} productos bajo el mínimo configurado.`,
    link: "/stock",
    link_label: "Ir a stock",
    source_alert_ids: [...keep, ...groupedRest].flatMap((a) => a.source_alert_ids),
    priority: Math.max(...sorted.map((a) => a.priority)) + 10,
  };

  return [...others, grouped, ...keep].sort((a, b) => b.priority - a.priority);
}

function buildRoutineActions(
  snap: IntelligenceSnapshot,
  ctx: ActionEvaluationContext,
): BusinessAction[] {
  const actions: BusinessAction[] = [
    {
      id: "routine-reports",
      kind: "routine_check",
      category: "general",
      urgency: "today",
      title: "Revisar ventas del período",
      reason:
        snap.salesComparison.revenue_change_pct >= 0
          ? "Sin urgencias críticas. Conviene revisar el cierre del mes y la comparación con el período anterior."
          : "Sin otras urgencias inmediatas. Revisá reportes para entender la tendencia comercial.",
      link: "/reportes",
      link_label: "Ir a reportes",
      source_alert_ids: [],
      priority: 80,
    },
  ];

  if (ctx.featuresStock !== false && snap.inventory.low_stock_count === 0) {
    actions.push({
      id: "routine-stock",
      kind: "routine_check",
      category: "stock",
      urgency: "this_week",
      title: "Verificar mínimos de stock",
      reason: "Ningún producto está bajo el mínimo ahora — buen momento para ajustar mínimos y reposición.",
      link: "/stock",
      link_label: "Ir a stock",
      source_alert_ids: [],
      priority: 60,
    });
  }

  if (ctx.featuresCustomers !== false && snap.customers.activity.at_risk === 0 && snap.customers.activity.active > 0) {
    actions.push({
      id: "routine-customers",
      kind: "routine_check",
      category: "customers",
      urgency: "this_week",
      title: "Mantener relación con clientes activos",
      reason: `${snap.customers.activity.active} cliente(s) activos en los últimos 30 días.`,
      link: "/clientes",
      link_label: "Ver clientes",
      source_alert_ids: [],
      priority: 40,
    });
  }

  return actions;
}

/**
 * Convierte alertas + snapshot en acciones priorizadas para hoy (read-only, sin SQL).
 */
export function buildActions(
  snap: IntelligenceSnapshot,
  alertResult: AlertEvaluationResult,
  ctx: ActionEvaluationContext = {},
): ActionEvaluationResult {
  const candidates: BusinessAction[] = [];
  const kindsSeen = new Set<BusinessActionKind>();
  let infoCount = 0;

  for (const alert of alertResult.alerts) {
    if (shouldSkipAlertForAction(alert, kindsSeen)) continue;
    const action = alertToAction(alert);
    if (!action) continue;
    if (alert.severity === "info") {
      infoCount++;
      if (infoCount > ACTION_LIMITS.maxInfoActions) continue;
    }
    kindsSeen.add(action.kind);
    candidates.push(action);
  }

  let merged = groupReplenishActions(candidates);

  if (merged.length === 0) {
    merged = buildRoutineActions(snap, ctx);
  } else if (merged.length < ACTION_LIMITS.minActionsBeforeRoutine) {
    merged = [...merged, ...buildRoutineActions(snap, ctx)];
  }

  const sorted = [...merged].sort((a, b) => b.priority - a.priority);
  const limited = sorted.slice(0, ACTION_LIMITS.maxTodayActions);

  let now_count = 0;
  let today_count = 0;
  for (const a of limited) {
    if (a.urgency === "now") now_count++;
    else if (a.urgency === "today") today_count++;
  }

  return {
    actions: limited,
    total_candidates: sorted.length,
    now_count,
    today_count,
  };
}
