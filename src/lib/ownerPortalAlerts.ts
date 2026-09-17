/**
 * Proyección Owner Portal de alertas BI (Fase 4B).
 * NO evalúa reglas: solo filtra/sanitiza lo que ya produjo evaluateAlerts().
 */
import {
  ALERT_THRESHOLDS,
  DEFAULT_COVERAGE_THRESHOLD_DAYS,
} from "../db/intelligence/constants";
import type {
  AlertEvaluationResult,
  BusinessAlert,
  BusinessAlertSeverity,
  BusinessAlertType,
} from "../db/intelligence/alertTypes";
import type { IntelligenceSnapshot } from "../db/intelligence/types";

/** Máximo de alertas en el snapshot del portal (presupuesto de payload). */
export const PORTAL_MAX_ALERTS = 20;

/** Únicos tipos v1 permitidos en Owner Portal. */
export const PORTAL_ALERT_TYPES = new Set<BusinessAlertType>([
  "stock_critical",
  "stock_low_coverage",
  "sales_drop",
]);

export type PortalAlertMetric =
  | "stock"
  | "estimated_days_cover"
  | "revenue_change_pct";

export interface OwnerPortalAlert {
  id: string;
  type: "stock_critical" | "stock_low_coverage" | "sales_drop";
  severity: BusinessAlertSeverity;
  title: string;
  message: string;
  metric: PortalAlertMetric;
  value: number;
  threshold: number;
}

export interface OwnerPortalAlertsSummary {
  critical_count: number;
  warning_count: number;
  info_count: number;
}

export interface OwnerPortalAlertsProjection {
  alerts: OwnerPortalAlert[];
  alerts_summary: OwnerPortalAlertsSummary;
}

function emptySummary(): OwnerPortalAlertsSummary {
  return { critical_count: 0, warning_count: 0, info_count: 0 };
}

function countSummary(alerts: OwnerPortalAlert[]): OwnerPortalAlertsSummary {
  const s = emptySummary();
  for (const a of alerts) {
    if (a.severity === "critical") s.critical_count += 1;
    else if (a.severity === "warning") s.warning_count += 1;
    else s.info_count += 1;
  }
  return s;
}

function sanitizeText(s: string, max = 200): string {
  return String(s || "")
    .replace(/\/(?:productos|reportes|clientes|presupuestos|stock|caja|admin)(?:\/\d+)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isAllowedType(
  type: BusinessAlertType,
): type is OwnerPortalAlert["type"] {
  return PORTAL_ALERT_TYPES.has(type);
}

/**
 * Enriquece metric/value/threshold desde el snapshot ya usado por evaluateAlerts.
 * No recalcula condiciones ni umbrales de disparo.
 */
function enrichFromSnapshot(
  alert: BusinessAlert,
  snap: IntelligenceSnapshot | null | undefined,
): { metric: PortalAlertMetric; value: number; threshold: number } | null {
  if (alert.type === "sales_drop") {
    const value = Number(snap?.salesComparison?.revenue_change_pct);
    return {
      metric: "revenue_change_pct",
      value: Number.isFinite(value) ? value : 0,
      threshold: ALERT_THRESHOLDS.salesDropPct,
    };
  }

  if (alert.type === "stock_critical") {
    const row = snap?.stock?.low_stock?.find((p) => p.product_id === alert.entity_id);
    const stock = Number(row?.stock);
    const min = Number(row?.min_stock);
    return {
      metric: "stock",
      value: Number.isFinite(stock) ? stock : 0,
      threshold: Number.isFinite(min) ? min : 0,
    };
  }

  if (alert.type === "stock_low_coverage") {
    const row = snap?.stock?.estimated_low_coverage?.find(
      (p) => p.product_id === alert.entity_id,
    );
    const days = Number(row?.estimated_days_cover);
    const threshold =
      alert.severity === "critical"
        ? ALERT_THRESHOLDS.coverageCriticalDays
        : DEFAULT_COVERAGE_THRESHOLD_DAYS;
    return {
      metric: "estimated_days_cover",
      value: Number.isFinite(days) ? days : 0,
      threshold,
    };
  }

  return null;
}

/**
 * Proyecta alertas internas → formato público del Owner Portal.
 * Preserva severity e id; excluye link / entity_id / tipos no permitidos.
 * Orden: el de evaluateAlerts (ya ordenado); truncado a maxAlerts.
 */
export function projectOwnerPortalAlerts(
  evaluation: AlertEvaluationResult | null | undefined,
  snap?: IntelligenceSnapshot | null,
  maxAlerts: number = PORTAL_MAX_ALERTS,
): OwnerPortalAlertsProjection {
  const raw = evaluation?.alerts;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { alerts: [], alerts_summary: emptySummary() };
  }

  const limit = Math.max(0, Math.floor(maxAlerts));
  const out: OwnerPortalAlert[] = [];

  for (const alert of raw) {
    if (!alert || typeof alert !== "object") continue;
    if (!isAllowedType(alert.type)) continue;

    const enriched = enrichFromSnapshot(alert, snap);
    if (!enriched) continue;

    out.push({
      id: String(alert.id).slice(0, 80),
      type: alert.type,
      severity: alert.severity,
      title: sanitizeText(alert.title, 120),
      message: sanitizeText(alert.message, 240),
      metric: enriched.metric,
      value: enriched.value,
      threshold: enriched.threshold,
    });

    if (out.length >= limit) break;
  }

  return { alerts: out, alerts_summary: countSummary(out) };
}
