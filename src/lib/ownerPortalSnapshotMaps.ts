/** Mapeos puros del snapshot Owner Portal (F3). Sin I/O. */

export const PORTAL_MAX_PAYMENTS = 12;
export const PORTAL_MAX_TOP_PRODUCTS = 8;
export const PORTAL_MAX_REGISTERS = 20;
export const PORTAL_MAX_EMPLOYEES = 12;

export type PortalPeriodKey = "today" | "7d" | "30d" | "mtd";

export interface PortalPaymentRow {
  method: string;
  count: number;
  total: number;
}

export interface PortalTopProductRow {
  name: string;
  qty: number;
  total: number;
}

export interface PortalNamedTotalRow {
  name: string;
  count: number;
  total: number;
}

export interface PortalRegisterPeriodRow {
  device_code: string;
  device_name: string | null;
  name: string;
  count: number;
  total: number;
}

export type PortalPeriodMap<T> = Record<PortalPeriodKey, T[]>;

function emptyPeriodMap<T>(): PortalPeriodMap<T> {
  return { today: [], "7d": [], "30d": [], mtd: [] };
}

/** Normaliza clave de label (solo lookup). No muta el método persistido. */
export function paymentMethodKey(method: string): string {
  return String(method || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .trim();
}

export function paymentLabelWithFallback(
  method: string,
  labels: Record<string, string>,
): string {
  if (!method) return "";
  const key = paymentMethodKey(method);
  return labels[key] || method;
}

export function mapPaymentRows(
  rows: Array<{ payment_method?: string; method?: string; count?: number; total?: number }>,
  limit = PORTAL_MAX_PAYMENTS,
): PortalPaymentRow[] {
  return (rows || []).slice(0, limit).map((r) => ({
    method: String(r.payment_method ?? r.method ?? "").slice(0, 64) || "—",
    count: Math.max(0, Math.floor(Number(r.count) || 0)),
    total: Number(r.total) || 0,
  }));
}

export function mapTopProductRows(
  rows: Array<{ name?: string; qty?: number; total?: number }>,
  limit = PORTAL_MAX_TOP_PRODUCTS,
): PortalTopProductRow[] {
  return (rows || []).slice(0, limit).map((r) => ({
    name: String(r.name ?? "?").slice(0, 120),
    qty: Number(r.qty) || 0,
    total: Number(r.total) || 0,
  }));
}

export function mapRegisterPeriodRows(
  rows: Array<{
    device_code?: string;
    device_name?: string | null;
    count?: number;
    total?: number;
  }>,
  limit = PORTAL_MAX_REGISTERS,
): PortalRegisterPeriodRow[] {
  return (rows || []).slice(0, limit).map((r) => {
    const device_code = String(r.device_code ?? "—").slice(0, 16) || "—";
    const device_name =
      typeof r.device_name === "string" && r.device_name.trim()
        ? r.device_name.trim().slice(0, 64)
        : null;
    const name = device_name || (device_code !== "—" ? device_code : "Caja");
    return {
      device_code,
      device_name,
      name,
      count: Math.max(0, Math.floor(Number(r.count) || 0)),
      total: Number(r.total) || 0,
    };
  });
}

export function mapEmployeePeriodRows(
  rows: Array<{ name?: string; display_name?: string; count?: number; total?: number }>,
  limit = PORTAL_MAX_EMPLOYEES,
): PortalNamedTotalRow[] {
  return (rows || []).slice(0, limit).map((r) => ({
    name: String(r.name ?? r.display_name ?? "Sin asignar").slice(0, 64),
    count: Math.max(0, Math.floor(Number(r.count) || 0)),
    total: Number(r.total) || 0,
  }));
}

export function buildPeriodMap<T>(
  parts: Partial<PortalPeriodMap<T>>,
): PortalPeriodMap<T> {
  const base = emptyPeriodMap<T>();
  return {
    today: parts.today ?? base.today,
    "7d": parts["7d"] ?? base["7d"],
    "30d": parts["30d"] ?? base["30d"],
    mtd: parts.mtd ?? base.mtd,
  };
}

/** Delta absoluto + % solo si previous_total > 0. */
export function periodCompareDelta(compare: {
  current_total?: number;
  previous_total?: number;
}): { delta_abs: number; change_pct: number | null } {
  const cur = Number(compare?.current_total) || 0;
  const prev = Number(compare?.previous_total) || 0;
  const delta_abs = cur - prev;
  if (prev <= 0) return { delta_abs, change_pct: null };
  return { delta_abs, change_pct: ((cur - prev) / prev) * 100 };
}

/** Si el JSON se acerca al tope, recorta listas F3 (no sube el límite). */
export function shrinkPeriodMapsForBudget<T extends Record<string, unknown>>(
  snapshot: T,
  maxBytes: number,
  encoder = new TextEncoder(),
): T {
  let out = snapshot;
  let size = encoder.encode(JSON.stringify(out)).length;
  if (size <= maxBytes) return out;

  const caps = [
    { pay: 8, top: 6, reg: 12, emp: 8, alerts: 16 },
    { pay: 6, top: 4, reg: 8, emp: 6, alerts: 12 },
    { pay: 4, top: 3, reg: 6, emp: 4, alerts: 8 },
    { pay: 3, top: 2, reg: 4, emp: 3, alerts: 5 },
  ];

  for (const c of caps) {
    const next = { ...out } as Record<string, unknown>;
    const trimMap = <U>(m: unknown, lim: number, mapFn: (arr: U[]) => U[]) => {
      if (!m || typeof m !== "object") return m;
      const o = m as Record<string, U[]>;
      const r: Record<string, U[]> = {};
      for (const k of Object.keys(o)) {
        r[k] = mapFn((o[k] || []).slice(0, lim));
      }
      return r;
    };
    next.sales_by_payment = trimMap(next.sales_by_payment, c.pay, (a) => a);
    next.top_products = trimMap(next.top_products, c.top, (a) => a);
    next.sales_by_register_by_period = trimMap(
      next.sales_by_register_by_period,
      c.reg,
      (a) => a,
    );
    next.sales_by_employee_by_period = trimMap(
      next.sales_by_employee_by_period,
      c.emp,
      (a) => a,
    );
    if (Array.isArray(next.alerts)) {
      next.alerts = (next.alerts as unknown[]).slice(0, c.alerts);
      const summary = { critical_count: 0, warning_count: 0, info_count: 0 };
      for (const a of next.alerts as Array<{ severity?: string }>) {
        if (a?.severity === "critical") summary.critical_count += 1;
        else if (a?.severity === "warning") summary.warning_count += 1;
        else summary.info_count += 1;
      }
      next.alerts_summary = summary;
    }
    out = next as T;
    size = encoder.encode(JSON.stringify(out)).length;
    if (size <= maxBytes) return out;
  }
  return out;
}
