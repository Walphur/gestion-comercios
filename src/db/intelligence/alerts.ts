import { ALERT_THRESHOLDS } from "./constants";
import type { IntelligenceSnapshot } from "./types";
import type {
  AlertEvaluationContext,
  AlertEvaluationResult,
  BusinessAlert,
  BusinessAlertSeverity,
} from "./alertTypes";

const SEVERITY_WEIGHT: Record<BusinessAlertSeverity, number> = {
  critical: 300,
  warning: 200,
  info: 100,
};

function pushAlert(alerts: BusinessAlert[], alert: BusinessAlert): void {
  alerts.push(alert);
}

function sortAlerts(alerts: BusinessAlert[]): BusinessAlert[] {
  return [...alerts].sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.severity];
    const sb = SEVERITY_WEIGHT[b.severity];
    if (sb !== sa) return sb - sa;
    return b.priority - a.priority;
  });
}

function countBySeverity(alerts: BusinessAlert[]): Pick<
  AlertEvaluationResult,
  "critical_count" | "warning_count" | "info_count"
> {
  let critical_count = 0;
  let warning_count = 0;
  let info_count = 0;
  for (const a of alerts) {
    if (a.severity === "critical") critical_count++;
    else if (a.severity === "warning") warning_count++;
    else info_count++;
  }
  return { critical_count, warning_count, info_count };
}

/**
 * Evalúa reglas de alerta sobre un snapshot ya calculado (read-only, sin SQL extra).
 */
export function evaluateAlerts(
  snap: IntelligenceSnapshot,
  ctx: AlertEvaluationContext = {},
): AlertEvaluationResult {
  const alerts: BusinessAlert[] = [];
  const showProfits = ctx.showProfits !== false;
  const featuresStock = ctx.featuresStock !== false;
  const featuresCustomers = ctx.featuresCustomers !== false;
  const maxItems = ALERT_THRESHOLDS.maxPerItemAlerts;

  // —— Sync LAN ——
  if (snap.freshness.enabled && snap.freshness.conflictCount > 0) {
    pushAlert(alerts, {
      id: "sync-conflict",
      type: "sync_conflict",
      severity: "critical",
      title: "Conflictos de sincronización",
      message: `${snap.freshness.conflictCount} conflicto(s) LAN pendientes de resolver en Admin.`,
      entity_type: "sync",
      link: "/admin",
      priority: 1000 + snap.freshness.conflictCount * 10,
    });
  } else if (snap.freshness.enabled && snap.freshness.pendingEvents > 0) {
    pushAlert(alerts, {
      id: "sync-pending",
      type: "sync_pending",
      severity: "info",
      title: "Sincronización en curso",
      message: `${snap.freshness.pendingEvents} evento(s) pendientes — los números pueden actualizarse al terminar.`,
      entity_type: "sync",
      link: "/admin",
      priority: 100 + snap.freshness.pendingEvents,
    });
  }

  // —— Ventas ——
  const cmp = snap.salesComparison;
  if (
    cmp.previous_total > 0 &&
    cmp.revenue_change_pct <= ALERT_THRESHOLDS.salesDropPct
  ) {
    pushAlert(alerts, {
      id: "sales-drop",
      type: "sales_drop",
      severity: "critical",
      title: "Caída de ventas",
      message: `Facturación 30d ${cmp.revenue_change_pct.toFixed(1)}% vs período anterior (${cmp.current_total.toFixed(0)} vs ${cmp.previous_total.toFixed(0)}).`,
      entity_type: "sales",
      link: "/reportes",
      priority: 800 + Math.abs(cmp.revenue_change_pct),
    });
  }
  if (
    cmp.previous_units > 0 &&
    cmp.units_change_pct <= ALERT_THRESHOLDS.unitsDropPct
  ) {
    pushAlert(alerts, {
      id: "units-drop",
      type: "units_drop",
      severity: cmp.revenue_change_pct > ALERT_THRESHOLDS.salesDropPct ? "warning" : "info",
      title: "Caída de unidades vendidas",
      message: `Unidades 30d ${cmp.units_change_pct.toFixed(1)}% — revisá si el cambio viene de precios, no de volumen.`,
      entity_type: "sales",
      link: "/reportes",
      priority: 600 + Math.abs(cmp.units_change_pct),
    });
  }

  // —— Stock ——
  if (featuresStock) {
    for (const p of snap.stock.low_stock.slice(0, maxItems)) {
      const out = p.stock <= 0;
      pushAlert(alerts, {
        id: `stock-critical-${p.product_id}`,
        type: "stock_critical",
        severity: out ? "critical" : "warning",
        title: out ? "Sin stock" : "Stock bajo mínimo",
        message: `${p.name}: ${p.stock} u. (mín. ${p.min_stock}).`,
        entity_type: "product",
        entity_id: p.product_id,
        link: `/productos/${p.product_id}`,
        priority: out ? 900 : 500 + (p.min_stock - p.stock),
      });
    }

    for (const p of snap.stock.estimated_low_coverage.slice(0, maxItems)) {
      const days = p.estimated_days_cover ?? 0;
      const critical = days <= ALERT_THRESHOLDS.coverageCriticalDays;
      pushAlert(alerts, {
        id: `coverage-${p.product_id}`,
        type: "stock_low_coverage",
        severity: critical ? "critical" : "warning",
        title: critical ? "Cobertura estimada muy baja" : "Próximo a agotarse (estimado)",
        message: `${p.name}: ~${days.toFixed(1)} días de cobertura (${Math.round(p.units_sold_7d)} u/7d). Estimación — no usar para cantidad de compra.`,
        entity_type: "product",
        entity_id: p.product_id,
        link: `/productos/${p.product_id}`,
        priority: critical ? 700 - days * 10 : 400 - days * 5,
      });
    }

    for (const p of snap.stock.slow_moving.slice(0, maxItems)) {
      const immobilized = (p.stock ?? 0) * (p.cost ?? 0);
      pushAlert(alerts, {
        id: `slow-${p.product_id}`,
        type: "stock_no_movement",
        severity: immobilized > 50000 ? "warning" : "info",
        title: "Sin movimiento (60 días)",
        message: `${p.name}: stock ${p.stock}, sin ventas en 60 días.`,
        entity_type: "product",
        entity_id: p.product_id,
        link: `/productos/${p.product_id}`,
        priority: 200 + immobilized / 1000,
      });
    }

    if (snap.inventory.expiring_count > 0) {
      pushAlert(alerts, {
        id: "products-expiring",
        type: "products_expiring",
        severity: "warning",
        title: "Productos por vencer",
        message: `${snap.inventory.expiring_count} producto(s) vencen en los próximos 14 días.`,
        entity_type: "inventory",
        link: "/stock",
        priority: 350 + snap.inventory.expiring_count,
      });
    }
  }

  // —— Margen (estimado) ——
  if (showProfits) {
    const catalogById = new Map(
      snap.margin.worst_catalog.map((c) => [c.product_id, c.margin_pct]),
    );
    for (const sold of snap.margin.worst_sold.slice(0, maxItems)) {
      const catalogMargin = catalogById.get(sold.product_id);
      if (sold.margin_pct < ALERT_THRESHOLDS.minSoldMarginPct) {
        pushAlert(alerts, {
          id: `margin-low-${sold.product_id}`,
          type: "margin_low",
          severity: sold.margin_pct < 5 ? "critical" : "warning",
          title: "Margen estimado bajo",
          message: `${sold.name}: ~${sold.margin_pct.toFixed(1)}% en ventas 30d (estimado).`,
          entity_type: "product",
          entity_id: sold.product_id,
          link: `/productos/${sold.product_id}`,
          priority: 450 - sold.margin_pct,
        });
      } else if (
        catalogMargin != null &&
        catalogMargin - sold.margin_pct >= ALERT_THRESHOLDS.marginDropVsCatalogPp
      ) {
        pushAlert(alerts, {
          id: `margin-deteriorated-${sold.product_id}`,
          type: "margin_deteriorated",
          severity: "warning",
          title: "Margen estimado deteriorado",
          message: `${sold.name}: vendido ~${sold.margin_pct.toFixed(1)}% vs catálogo ${catalogMargin.toFixed(1)}%.`,
          entity_type: "product",
          entity_id: sold.product_id,
          link: `/productos/${sold.product_id}`,
          priority: 380 + (catalogMargin - sold.margin_pct),
        });
      }
    }
  }

  // —— Clientes ——
  if (featuresCustomers) {
    if (snap.customers.activity.at_risk > 0) {
      pushAlert(alerts, {
        id: "customers-at-risk",
        type: "customer_at_risk",
        severity: "warning",
        title: "Clientes en riesgo",
        message: `${snap.customers.activity.at_risk} cliente(s) sin compra entre 31 y 90 días.`,
        entity_type: "customer",
        link: "/clientes",
        priority: 300 + snap.customers.activity.at_risk,
      });
    }

    for (const c of snap.customers.near_limit.slice(0, maxItems)) {
      pushAlert(alerts, {
        id: `credit-${c.customer_id}`,
        type: "customer_credit_limit",
        severity: (c.usage_pct ?? 0) >= 95 ? "critical" : "warning",
        title: "Cerca del límite de crédito",
        message: `${c.name}: ${(c.usage_pct ?? 0).toFixed(0)}% del límite (${c.balance.toFixed(0)} / ${c.credit_limit.toFixed(0)}).`,
        entity_type: "customer",
        entity_id: c.customer_id,
        link: "/clientes",
        priority: 420 + (c.usage_pct ?? 0),
      });
    }

    for (const c of snap.customers.with_debt.slice(0, maxItems)) {
      if (c.balance < ALERT_THRESHOLDS.customerDebtMin) continue;
      pushAlert(alerts, {
        id: `debt-${c.customer_id}`,
        type: "customer_debt",
        severity: c.balance > 50000 ? "critical" : "warning",
        title: "Cliente con deuda",
        message: `${c.name}: saldo ${c.balance.toFixed(2)}.`,
        entity_type: "customer",
        entity_id: c.customer_id,
        link: "/clientes",
        priority: 360 + c.balance / 1000,
      });
    }
  }

  // —— Presupuestos ——
  if (snap.quotes) {
    if (snap.quotes.summary.expiring_soon > 0) {
      pushAlert(alerts, {
        id: "quotes-expiring",
        type: "quote_expiring",
        severity: "warning",
        title: "Presupuestos por vencer",
        message: `${snap.quotes.summary.expiring_soon} presupuesto(s) vencen en 7 días.`,
        entity_type: "quote",
        link: "/presupuestos",
        priority: 340 + snap.quotes.summary.expiring_soon * 5,
      });
    }
    if (snap.quotes.summary.stale_sent > 0) {
      pushAlert(alerts, {
        id: "quotes-stale",
        type: "quote_stale",
        severity: "info",
        title: "Presupuestos sin seguimiento",
        message: `${snap.quotes.summary.stale_sent} enviado(s) hace más de 14 días sin respuesta.`,
        entity_type: "quote",
        link: "/presupuestos",
        priority: 250 + snap.quotes.summary.stale_sent,
      });
    }
    for (const q of snap.quotes.pending.slice(0, maxItems)) {
      const expired =
        q.valid_until != null && q.valid_until.slice(0, 10) < new Date().toISOString().slice(0, 10);
      if (!expired && q.status !== "sent") continue;
      pushAlert(alerts, {
        id: `quote-${q.quote_id}`,
        type: expired ? "quote_expiring" : "quote_stale",
        severity: expired ? "warning" : "info",
        title: expired ? "Presupuesto vencido" : "Presupuesto pendiente",
        message: `#${q.quote_number}${q.customer_name ? ` · ${q.customer_name}` : ""}.`,
        entity_type: "quote",
        entity_id: q.quote_id,
        link: `/presupuestos/${q.quote_id}`,
        priority: expired ? 320 : 200,
      });
    }
  }

  // —— Caja (local) ——
  if (snap.cash) {
    for (const row of snap.cash.recent_differences.slice(0, 3)) {
      const diff = row.cash_difference ?? 0;
      if (Math.abs(diff) < ALERT_THRESHOLDS.cashDifferenceMin) continue;
      pushAlert(alerts, {
        id: `cash-${row.cash_session_id}`,
        type: "cash_difference",
        severity: Math.abs(diff) > 500 ? "critical" : "warning",
        title: "Diferencia en arqueo",
        message: `Sesión #${row.cash_session_id}: diferencia ${diff >= 0 ? "+" : ""}${diff.toFixed(2)} (esta PC).`,
        entity_type: "cash",
        entity_id: row.cash_session_id,
        link: "/caja",
        priority: 500 + Math.abs(diff),
      });
    }
  }

  const sorted = sortAlerts(alerts);
  return { alerts: sorted, ...countBySeverity(sorted) };
}
