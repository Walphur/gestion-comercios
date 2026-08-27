import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../db/settings";
import { getTodaySummary } from "../db/sales";
import {
  getRecentSales,
  getTodaySalesByRegister,
  getYesterdaySummary,
  getTodaySalesByEmployee,
  getPortalSalesLast7Days,
  getTopSellers,
  listPortalStockAlerts,
  countPortalStockAlerts,
} from "../db/dashboard";
import { getConnectionStatus } from "./tauri";
import { formatSaleRegisterLabel } from "./saleDevice";

/** Subida automática cada minuto (la web no necesita “Subir ahora”). */
const PUSH_INTERVAL_MS = 60 * 1000;
/** Tras una venta, espera un poco y sube (evita spam si cobran seguido). */
const PUSH_AFTER_SALE_MS = 8 * 1000;

export const OWNER_PORTAL_ENABLED_KEY = "owner_portal_enabled";
export const OWNER_PORTAL_LAST_PUSH_AT_KEY = "owner_portal_last_push_at";
export const OWNER_PORTAL_LAST_ERROR_KEY = "owner_portal_last_error";

export interface OwnerPortalStatus {
  enabled: boolean;
  lastPushAt: string | null;
  lastError: string | null;
}

export async function getOwnerPortalStatus(): Promise<OwnerPortalStatus> {
  const [enabled, lastPushAt, lastError] = await Promise.all([
    getSetting(OWNER_PORTAL_ENABLED_KEY),
    getSetting(OWNER_PORTAL_LAST_PUSH_AT_KEY),
    getSetting(OWNER_PORTAL_LAST_ERROR_KEY),
  ]);
  return {
    enabled: enabled === "1",
    lastPushAt: lastPushAt?.trim() || null,
    lastError: lastError?.trim() || null,
  };
}

export async function setOwnerPortalEnabled(enabled: boolean): Promise<void> {
  await setSetting(OWNER_PORTAL_ENABLED_KEY, enabled ? "1" : "0");
  if (!enabled) {
    await setSetting(OWNER_PORTAL_LAST_ERROR_KEY, "");
  }
}

export async function buildOwnerPortalSnapshot(): Promise<{
  business_name: string;
  sales_today_total: number;
  sales_today_count: number;
  sales_yesterday_total: number;
  sales_yesterday_count: number;
  low_stock_count: number;
  recent_sales: Array<{
    at: string;
    total: number;
    device: string;
    payment_method?: string;
    seller?: string;
  }>;
  sales_by_register: Array<{
    device_code: string;
    device_name: string | null;
    count: number;
    total: number;
  }>;
  sales_by_employee: Array<{ name: string; count: number; total: number }>;
  sales_last_7_days: Array<{ day: string; count: number; total: number }>;
  top_products_today: Array<{ name: string; qty: number }>;
  low_stock: Array<{ name: string; stock: number; min_stock: number }>;
  pushed_at: string;
  device_name: string;
}> {
  const [
    today,
    yesterday,
    recent,
    byRegister,
    byEmployee,
    week,
    topToday,
    lowStock,
    alertCount,
    businessName,
    deviceName,
    deviceCode,
  ] = await Promise.all([
    getTodaySummary(),
    getYesterdaySummary(),
    getRecentSales(20),
    getTodaySalesByRegister(),
    getTodaySalesByEmployee(),
    getPortalSalesLast7Days(),
    getTopSellers(1, 8),
    listPortalStockAlerts(30),
    countPortalStockAlerts(),
    getSetting("business_name"),
    getSetting("lan_sync_device_name"),
    getSetting("lan_sync_device_code"),
  ]);

  const hubLabel =
    deviceName?.trim() ||
    deviceCode?.trim() ||
    (await getSetting("lan_sync_device_id"))?.trim()?.slice(0, 8) ||
    "PC";

  return {
    business_name: businessName?.trim() || "Mi comercio",
    sales_today_total: today.todayTotal,
    sales_today_count: today.todayCount,
    sales_yesterday_total: yesterday.total,
    sales_yesterday_count: yesterday.count,
    low_stock_count: alertCount,
    recent_sales: recent.map((s) => ({
      at: s.created_at,
      total: s.total,
      device: formatSaleRegisterLabel(s),
      payment_method: s.payment_method,
      seller: s.seller_name?.trim() || undefined,
    })),
    sales_by_register: byRegister.map((r) => ({
      device_code: r.device_code,
      device_name: r.device_name?.trim() || null,
      count: r.count,
      total: r.total,
    })),
    sales_by_employee: byEmployee.map((e) => ({
      name: e.name,
      count: e.count,
      total: e.total,
    })),
    sales_last_7_days: week.map((d) => ({
      day: d.day,
      count: d.count,
      total: d.total,
    })),
    top_products_today: topToday.map((p) => ({
      name: p.name,
      qty: p.qty,
    })),
    low_stock: lowStock.map((p) => ({
      name: p.name,
      stock: p.stock,
      min_stock: p.min_stock,
    })),
    pushed_at: new Date().toISOString(),
    device_name: hubLabel,
  };
}

function friendlyPushError(raw: string): string {
  const msg = raw.trim();
  if (!msg) return "No se pudo subir el resumen.";
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) {
    return "Sin internet o el servidor no responde. Revisá la conexión e intentá de nuevo.";
  }
  return msg;
}

/** Sube el resumen al Worker (HTTP nativo Rust). Devuelve mensaje de error o null si OK. */
export async function pushOwnerPortalSnapshot(): Promise<string | null> {
  try {
    const snapshot = await buildOwnerPortalSnapshot();
    await invoke("owner_portal_push", { snapshot });
    const now = new Date().toISOString();
    await setSetting(OWNER_PORTAL_LAST_PUSH_AT_KEY, now);
    await setSetting(OWNER_PORTAL_LAST_ERROR_KEY, "");
    return null;
  } catch (e) {
    const raw =
      typeof e === "string"
        ? e
        : e instanceof Error
          ? e.message
          : "No se pudo subir el resumen.";
    const msg = friendlyPushError(raw);
    await setSetting(OWNER_PORTAL_LAST_ERROR_KEY, msg);
    return msg;
  }
}

/** Si está habilitado y hay red, empuja. No lanza. */
export async function maybePushOwnerPortal(): Promise<void> {
  try {
    const enabled = (await getSetting(OWNER_PORTAL_ENABLED_KEY)) === "1";
    if (!enabled) return;
    const conn = await getConnectionStatus().catch(() => ({ online: false }));
    if (!conn.online) return;
    await pushOwnerPortalSnapshot();
  } catch {
    /* silencioso: timer de fondo */
  }
}

let timerId: number | null = null;
let salePushTimer: number | null = null;

/** Arranca el intervalo de subida (una sola vez por sesión de app). */
export function startOwnerPortalPushLoop(): void {
  if (typeof window === "undefined") return;
  if (timerId != null) return;
  void maybePushOwnerPortal();
  timerId = window.setInterval(() => {
    void maybePushOwnerPortal();
  }, PUSH_INTERVAL_MS);
}

/** Pedí una subida pronto (después de vender). Debounced. */
export function scheduleOwnerPortalPush(): void {
  if (typeof window === "undefined") return;
  if (salePushTimer != null) window.clearTimeout(salePushTimer);
  salePushTimer = window.setTimeout(() => {
    salePushTimer = null;
    void maybePushOwnerPortal();
  }, PUSH_AFTER_SALE_MS);
}
