import { getMachineId } from "./license";
import { getSetting, setSetting } from "../db/settings";
import { getTodaySummary } from "../db/sales";
import { getProductStats } from "../db/products";
import { getRecentSales, listLowStockProducts } from "../db/dashboard";
import { getConnectionStatus } from "./tauri";

const LICENSE_API_URL =
  (import.meta as { env?: { VITE_LICENSE_API_URL?: string } }).env?.VITE_LICENSE_API_URL ||
  "https://gestion-comercios-license.walphur.workers.dev";

const PUSH_INTERVAL_MS = 3 * 60 * 1000;

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

async function resolveLicenseKey(): Promise<string | null> {
  const key =
    (await getSetting("license_key"))?.trim() ||
    (await getSetting("account_license_key"))?.trim() ||
    "";
  return key.length >= 8 ? key.toUpperCase() : null;
}

export async function buildOwnerPortalSnapshot(): Promise<{
  business_name: string;
  sales_today_total: number;
  sales_today_count: number;
  products_total: number;
  low_stock_count: number;
  recent_sales: Array<{ at: string; total: number; device: string }>;
  low_stock: Array<{ name: string; stock: number; min_stock: number }>;
  pushed_at: string;
  device_name: string;
}> {
  const [today, stats, recent, lowStock, businessName, deviceCode] = await Promise.all([
    getTodaySummary(),
    getProductStats(),
    getRecentSales(20),
    listLowStockProducts(20),
    getSetting("business_name"),
    getSetting("lan_sync_device_code"),
  ]);

  const device =
    deviceCode?.trim() ||
    (await getSetting("lan_sync_device_id"))?.trim()?.slice(0, 8) ||
    "PC";

  return {
    business_name: businessName?.trim() || "Mi comercio",
    sales_today_total: today.todayTotal,
    sales_today_count: today.todayCount,
    products_total: stats.total,
    low_stock_count: stats.lowStock,
    recent_sales: recent.map((s) => ({
      at: s.created_at,
      total: s.total,
      device: s.seller_name?.trim() || device,
    })),
    low_stock: lowStock.map((p) => ({
      name: p.name,
      stock: p.stock,
      min_stock: p.min_stock,
    })),
    pushed_at: new Date().toISOString(),
    device_name: device,
  };
}

/** Sube el resumen al Worker. Devuelve mensaje de error o null si OK. */
export async function pushOwnerPortalSnapshot(): Promise<string | null> {
  const licenseKey = await resolveLicenseKey();
  if (!licenseKey) {
    const msg =
      "No hay clave de licencia guardada. Activá la licencia o iniciá sesión con tu cuenta WalQo.";
    await setSetting(OWNER_PORTAL_LAST_ERROR_KEY, msg);
    return msg;
  }

  const machineId = await getMachineId();
  const snapshot = await buildOwnerPortalSnapshot();

  try {
    const res = await fetch(`${LICENSE_API_URL}/v1/portal/push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        license_key: licenseKey,
        machine_id: machineId,
        device_name: snapshot.device_name,
        snapshot,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      const msg = data.message || data.error || `Error ${res.status}`;
      await setSetting(OWNER_PORTAL_LAST_ERROR_KEY, msg);
      return msg;
    }
    const now = new Date().toISOString();
    await setSetting(OWNER_PORTAL_LAST_PUSH_AT_KEY, now);
    await setSetting(OWNER_PORTAL_LAST_ERROR_KEY, "");
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sin conexión";
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

/** Arranca el intervalo de subida (una sola vez por sesión de app). */
export function startOwnerPortalPushLoop(): void {
  if (typeof window === "undefined") return;
  if (timerId != null) return;
  void maybePushOwnerPortal();
  timerId = window.setInterval(() => {
    void maybePushOwnerPortal();
  }, PUSH_INTERVAL_MS);
}
