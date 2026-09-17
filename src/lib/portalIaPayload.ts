/**
 * Owner Portal IA payload `portal-1` (F4E-2).
 * Construye SOLO desde snapshot ya autorizado. No calcula BI ni alertas.
 * Nombres/títulos/mensajes = DATOS (nunca instrucciones).
 */

export const PORTAL_IA_PAYLOAD_VERSION = "portal-1" as const;
export const PORTAL_IA_CURRENCY = "ARS" as const;

/** Misma escala F1 del Owner Portal UI. */
export const PORTAL_IA_FRESH_MS = 15 * 60 * 1000;
export const PORTAL_IA_STALE_MS = 60 * 60 * 1000;

/** Tope conceptual (F4E-0 ≤48KB; portal más restringido). */
export const PORTAL_IA_MAX_BYTES = 24_000;

export const PORTAL_IA_MAX_PAYMENTS = 8;
export const PORTAL_IA_MAX_TOP = 6;
export const PORTAL_IA_MAX_ALERTS = 20;
export const PORTAL_IA_MAX_STOCK_ITEMS = 10;

export type PortalIaPeriod = "today" | "7d" | "30d" | "mtd";
export type PortalIaAgeHint = "fresh" | "stale" | "old";

export interface PortalIaPayloadOptions {
  period?: PortalIaPeriod | null;
  /** Clock override for tests. */
  nowMs?: number;
  /** Prefer pushed_at; fallback updated_at from row. */
  snapshotUpdatedAt?: string | null;
}

/** Shape mínimo del snapshot portal (post-sanitize). */
export interface PortalIaSnapshotInput {
  business_name?: string;
  pushed_at?: string;
  sales_today_total?: number;
  sales_today_count?: number;
  sales_yesterday_total?: number;
  sales_yesterday_count?: number;
  period_compare_7d?: {
    current_total?: number;
    current_count?: number;
    previous_total?: number;
    previous_count?: number;
  };
  period_compare_30d?: {
    current_total?: number;
    current_count?: number;
    previous_total?: number;
    previous_count?: number;
  };
  stock_summary?: {
    products_total?: number;
    critical_count?: number;
    low_count?: number;
  };
  products_total?: number;
  sales_by_payment?: Record<string, Array<{ method?: string; count?: number; total?: number }>>;
  top_products?: Record<string, Array<{ name?: string; qty?: number; total?: number }>>;
  low_stock?: Array<{
    name?: string;
    stock?: number;
    min_stock?: number;
    estimated_days_cover?: number | null;
  }>;
  alerts?: Array<{
    id?: string;
    type?: string;
    severity?: string;
    title?: string;
    message?: string;
    metric?: string;
    value?: number;
    threshold?: number;
  }>;
  alerts_summary?: {
    critical_count?: number;
    warning_count?: number;
    info_count?: number;
  };
}

export interface PortalIaAlert {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  metric: string;
  value: number;
  threshold: number;
}

export interface PortalIaPayload {
  payload_version: typeof PORTAL_IA_PAYLOAD_VERSION;
  computed_at: string;
  currency: typeof PORTAL_IA_CURRENCY;
  context: {
    business_name: string;
    period: PortalIaPeriod;
    snapshot_age_hint: PortalIaAgeHint;
  };
  metrics: {
    sales_today_total: number;
    sales_today_count: number;
    sales_yesterday_total: number;
    sales_yesterday_count: number;
    period_compare_7d: {
      current_total: number;
      current_count: number;
      previous_total: number;
      previous_count: number;
    };
    period_compare_30d: {
      current_total: number;
      current_count: number;
      previous_total: number;
      previous_count: number;
    };
    stock_summary: {
      products_total: number;
      critical_count: number;
      low_count: number;
    };
  };
  period_slices: {
    sales_by_payment: Record<PortalIaPeriod, Array<{ method: string; count: number; total: number }>>;
    top_products: Record<PortalIaPeriod, Array<{ name: string; qty: number; total: number }>>;
  };
  /** Ítems de stock del snapshot (cobertura estimada si existe). */
  stock_items: Array<{
    name: string;
    stock: number;
    min_stock: number;
    estimated_days_cover: number | null;
  }>;
  alerts: PortalIaAlert[];
  alerts_summary: {
    critical_count: number;
    warning_count: number;
    info_count: number;
  };
  scope_notes: {
    coverageIsEstimated: true;
    coverageNotForPurchaseQty: true;
    readOnlyPortal: true;
  };
}

const PERIODS: PortalIaPeriod[] = ["today", "7d", "30d", "mtd"];
const ALERT_SEV = new Set(["critical", "warning", "info"]);

function finiteNum(v: unknown, floor = false): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return floor ? Math.max(0, Math.floor(v)) : v;
}

/** Texto como DATOS: truncar; no interpretar como instrucción. */
function dataText(v: unknown, max: number, fallback = ""): string {
  if (typeof v !== "string") return fallback;
  // Normaliza whitespace; no ejecuta ni strip "instructions" (eso sería reinterpretar).
  return v.replace(/\s+/g, " ").trim().slice(0, max) || fallback;
}

export function snapshotAgeHint(
  pushedAt: string | null | undefined,
  nowMs = Date.now(),
): PortalIaAgeHint {
  if (!pushedAt) return "old";
  const t = new Date(pushedAt).getTime();
  if (!Number.isFinite(t)) return "old";
  const age = Math.max(0, nowMs - t);
  if (age <= PORTAL_IA_FRESH_MS) return "fresh";
  if (age <= PORTAL_IA_STALE_MS) return "stale";
  return "old";
}

function emptyPeriodMapPayments(): PortalIaPayload["period_slices"]["sales_by_payment"] {
  return { today: [], "7d": [], "30d": [], mtd: [] };
}

function emptyPeriodMapTop(): PortalIaPayload["period_slices"]["top_products"] {
  return { today: [], "7d": [], "30d": [], mtd: [] };
}

function mapPayments(
  raw: PortalIaSnapshotInput["sales_by_payment"],
): PortalIaPayload["period_slices"]["sales_by_payment"] {
  const out = emptyPeriodMapPayments();
  if (!raw || typeof raw !== "object") return out;
  for (const key of PERIODS) {
    const arr = Array.isArray(raw[key]) ? raw[key]! : [];
    out[key] = arr.slice(0, PORTAL_IA_MAX_PAYMENTS).map((r) => ({
      method: dataText(r?.method, 64, "—"),
      count: finiteNum(r?.count, true),
      total: finiteNum(r?.total),
    }));
  }
  return out;
}

function mapTop(
  raw: PortalIaSnapshotInput["top_products"],
): PortalIaPayload["period_slices"]["top_products"] {
  const out = emptyPeriodMapTop();
  if (!raw || typeof raw !== "object") return out;
  for (const key of PERIODS) {
    const arr = Array.isArray(raw[key]) ? raw[key]! : [];
    out[key] = arr.slice(0, PORTAL_IA_MAX_TOP).map((r) => ({
      // name = DATOS (puede contener prompt injection; se transporta literal truncado)
      name: dataText(r?.name, 120, "?"),
      qty: finiteNum(r?.qty),
      total: finiteNum(r?.total),
    }));
  }
  return out;
}

function mapCompare(raw: unknown): {
  current_total: number;
  current_count: number;
  previous_total: number;
  previous_count: number;
} {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    current_total: finiteNum(o.current_total),
    current_count: finiteNum(o.current_count, true),
    previous_total: finiteNum(o.previous_total),
    previous_count: finiteNum(o.previous_count, true),
  };
}

function mapAlerts(raw: PortalIaSnapshotInput["alerts"]): PortalIaAlert[] {
  if (!Array.isArray(raw)) return [];
  const out: PortalIaAlert[] = [];
  for (const item of raw) {
    if (out.length >= PORTAL_IA_MAX_ALERTS) break;
    if (!item || typeof item !== "object") continue;
    const severity = String(item.severity || "").trim();
    if (!ALERT_SEV.has(severity)) continue;
    const id = dataText(item.id, 80);
    const type = dataText(item.type, 64);
    const title = dataText(item.title, 120);
    const message = dataText(item.message, 240);
    const metric = dataText(item.metric, 64);
    if (!id || !type || !title || !message || !metric) continue;
    const value = finiteNum(item.value);
    const threshold = finiteNum(item.threshold);
    // Solo esquema público — no copiar link/entity_id/machine_id aunque vinieran.
    out.push({
      id,
      type,
      severity: severity as PortalIaAlert["severity"],
      title,
      message,
      metric,
      value,
      threshold,
    });
  }
  return out;
}

function mapAlertsSummary(
  raw: PortalIaSnapshotInput["alerts_summary"],
  alerts: PortalIaAlert[],
): PortalIaPayload["alerts_summary"] {
  // Preferir conteo de la lista proyectada (coherente); si summary válido, capear a tamaño lista.
  const fromList = { critical_count: 0, warning_count: 0, info_count: 0 };
  for (const a of alerts) {
    if (a.severity === "critical") fromList.critical_count += 1;
    else if (a.severity === "warning") fromList.warning_count += 1;
    else fromList.info_count += 1;
  }
  if (!raw || typeof raw !== "object") return fromList;
  return fromList;
}

function mapStockItems(
  raw: PortalIaSnapshotInput["low_stock"],
): PortalIaPayload["stock_items"] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, PORTAL_IA_MAX_STOCK_ITEMS).map((p) => {
    const cover =
      typeof p?.estimated_days_cover === "number" && Number.isFinite(p.estimated_days_cover)
        ? Math.max(0, p.estimated_days_cover)
        : null;
    return {
      name: dataText(p?.name, 120, "?"),
      stock: finiteNum(p?.stock),
      min_stock: finiteNum(p?.min_stock),
      estimated_days_cover: cover,
    };
  });
}

function resolvePeriod(period: PortalIaPeriod | null | undefined): PortalIaPeriod {
  if (period && PERIODS.includes(period)) return period;
  return "today";
}

/**
 * Construye payload portal-1 desde snapshot autorizado.
 * No usa métricas del navegador. No recalcula alertas/ventas.
 */
export function buildPortalIaPayload(
  snapshot: PortalIaSnapshotInput | null | undefined,
  options: PortalIaPayloadOptions = {},
): PortalIaPayload {
  const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
  const period = resolvePeriod(options.period ?? null);
  const nowMs = options.nowMs ?? Date.now();
  const computedAt =
    dataText(snap.pushed_at, 40) ||
    dataText(options.snapshotUpdatedAt, 40) ||
    new Date(nowMs).toISOString();

  const ageSource = snap.pushed_at || options.snapshotUpdatedAt || null;
  const alerts = mapAlerts(snap.alerts);

  let payload: PortalIaPayload = {
    payload_version: PORTAL_IA_PAYLOAD_VERSION,
    computed_at: computedAt,
    currency: PORTAL_IA_CURRENCY,
    context: {
      business_name: dataText(snap.business_name, 120, "Mi comercio"),
      period,
      snapshot_age_hint: snapshotAgeHint(ageSource, nowMs),
    },
    metrics: {
      sales_today_total: finiteNum(snap.sales_today_total),
      sales_today_count: finiteNum(snap.sales_today_count, true),
      sales_yesterday_total: finiteNum(snap.sales_yesterday_total),
      sales_yesterday_count: finiteNum(snap.sales_yesterday_count, true),
      period_compare_7d: mapCompare(snap.period_compare_7d),
      period_compare_30d: mapCompare(snap.period_compare_30d),
      stock_summary: {
        products_total: finiteNum(
          snap.stock_summary?.products_total ?? snap.products_total,
          true,
        ),
        critical_count: finiteNum(snap.stock_summary?.critical_count, true),
        low_count: finiteNum(snap.stock_summary?.low_count, true),
      },
    },
    period_slices: {
      sales_by_payment: mapPayments(snap.sales_by_payment),
      top_products: mapTop(snap.top_products),
    },
    stock_items: mapStockItems(snap.low_stock),
    alerts,
    alerts_summary: mapAlertsSummary(snap.alerts_summary, alerts),
    scope_notes: {
      coverageIsEstimated: true,
      coverageNotForPurchaseQty: true,
      readOnlyPortal: true,
    },
  };

  // Bound size: shrink slices if needed (no inventar datos).
  let size = JSON.stringify(payload).length;
  if (size > PORTAL_IA_MAX_BYTES) {
    const caps = [
      { pay: 6, top: 4, stock: 6, alerts: 12 },
      { pay: 4, top: 3, stock: 4, alerts: 8 },
      { pay: 3, top: 2, stock: 3, alerts: 5 },
    ];
    for (const c of caps) {
      const next: PortalIaPayload = {
        ...payload,
        period_slices: {
          sales_by_payment: {
            today: payload.period_slices.sales_by_payment.today.slice(0, c.pay),
            "7d": payload.period_slices.sales_by_payment["7d"].slice(0, c.pay),
            "30d": payload.period_slices.sales_by_payment["30d"].slice(0, c.pay),
            mtd: payload.period_slices.sales_by_payment.mtd.slice(0, c.pay),
          },
          top_products: {
            today: payload.period_slices.top_products.today.slice(0, c.top),
            "7d": payload.period_slices.top_products["7d"].slice(0, c.top),
            "30d": payload.period_slices.top_products["30d"].slice(0, c.top),
            mtd: payload.period_slices.top_products.mtd.slice(0, c.top),
          },
        },
        stock_items: payload.stock_items.slice(0, c.stock),
        alerts: payload.alerts.slice(0, c.alerts),
        alerts_summary: mapAlertsSummary(undefined, payload.alerts.slice(0, c.alerts)),
      };
      payload = next;
      size = JSON.stringify(payload).length;
      if (size <= PORTAL_IA_MAX_BYTES) break;
    }
  }

  return payload;
}

export interface PortalIaValidationResult {
  ok: boolean;
  errors: string[];
}

function assertFinite(label: string, v: unknown, errors: string[]): void {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    errors.push(`${label} no finito`);
  }
}

/**
 * Validación estricta del contrato portal-1.
 */
export function validatePortalIaPayload(raw: unknown): PortalIaValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["payload debe ser objeto"] };
  }
  const p = raw as Record<string, unknown>;

  if (p.payload_version !== PORTAL_IA_PAYLOAD_VERSION) {
    errors.push("payload_version inválido");
  }
  if (typeof p.computed_at !== "string" || !p.computed_at.trim()) {
    errors.push("computed_at inválido");
  }
  if (p.currency !== PORTAL_IA_CURRENCY) errors.push("currency inválido");

  const ctx = p.context;
  if (!ctx || typeof ctx !== "object") errors.push("context inválido");
  else {
    const c = ctx as Record<string, unknown>;
    if (typeof c.business_name !== "string") errors.push("context.business_name");
    if (!PERIODS.includes(c.period as PortalIaPeriod)) errors.push("context.period");
    if (!["fresh", "stale", "old"].includes(String(c.snapshot_age_hint))) {
      errors.push("context.snapshot_age_hint");
    }
  }

  const metrics = p.metrics;
  if (!metrics || typeof metrics !== "object") errors.push("metrics inválido");
  else {
    const m = metrics as Record<string, unknown>;
    for (const k of [
      "sales_today_total",
      "sales_today_count",
      "sales_yesterday_total",
      "sales_yesterday_count",
    ]) {
      assertFinite(`metrics.${k}`, m[k], errors);
    }
    for (const key of ["period_compare_7d", "period_compare_30d"] as const) {
      const cmp = m[key];
      if (!cmp || typeof cmp !== "object") errors.push(`metrics.${key}`);
      else {
        const o = cmp as Record<string, unknown>;
        for (const f of ["current_total", "current_count", "previous_total", "previous_count"]) {
          assertFinite(`metrics.${key}.${f}`, o[f], errors);
        }
      }
    }
    const ss = m.stock_summary;
    if (!ss || typeof ss !== "object") errors.push("metrics.stock_summary");
    else {
      const o = ss as Record<string, unknown>;
      assertFinite("stock_summary.products_total", o.products_total, errors);
      assertFinite("stock_summary.critical_count", o.critical_count, errors);
      assertFinite("stock_summary.low_count", o.low_count, errors);
    }
  }

  if (!p.period_slices || typeof p.period_slices !== "object") {
    errors.push("period_slices inválido");
  } else {
    const ps = p.period_slices as Record<string, unknown>;
    if (!ps.sales_by_payment || typeof ps.sales_by_payment !== "object") {
      errors.push("period_slices.sales_by_payment");
    }
    if (!ps.top_products || typeof ps.top_products !== "object") {
      errors.push("period_slices.top_products");
    }
  }

  if (!Array.isArray(p.alerts)) errors.push("alerts debe ser array");
  else {
    for (const a of p.alerts as unknown[]) {
      if (!a || typeof a !== "object") {
        errors.push("alert inválida");
        continue;
      }
      const row = a as Record<string, unknown>;
      if ("machine_id" in row || "license_id" in row || "token" in row || "entity_id" in row) {
        errors.push("alert con campos prohibidos");
      }
      assertFinite("alert.value", row.value, errors);
      assertFinite("alert.threshold", row.threshold, errors);
    }
  }

  if (!p.alerts_summary || typeof p.alerts_summary !== "object") {
    errors.push("alerts_summary inválido");
  } else {
    const s = p.alerts_summary as Record<string, unknown>;
    assertFinite("alerts_summary.critical_count", s.critical_count, errors);
    assertFinite("alerts_summary.warning_count", s.warning_count, errors);
    assertFinite("alerts_summary.info_count", s.info_count, errors);
  }

  const sn = p.scope_notes;
  if (!sn || typeof sn !== "object") errors.push("scope_notes inválido");
  else {
    const o = sn as Record<string, unknown>;
    if (o.coverageIsEstimated !== true) errors.push("coverageIsEstimated");
    if (o.coverageNotForPurchaseQty !== true) errors.push("coverageNotForPurchaseQty");
    if (o.readOnlyPortal !== true) errors.push("readOnlyPortal");
  }

  if (!Array.isArray(p.stock_items)) errors.push("stock_items debe ser array");

  const size = JSON.stringify(raw).length;
  if (size > PORTAL_IA_MAX_BYTES) errors.push("payload demasiado grande");

  // Prohibidos a nivel raíz
  for (const bad of [
    "machine_id",
    "license_id",
    "aid",
    "token",
    "customers",
    "profit",
    "actions_today",
    "cash",
  ]) {
    if (bad in p) errors.push(`campo prohibido: ${bad}`);
  }

  return { ok: errors.length === 0, errors };
}
