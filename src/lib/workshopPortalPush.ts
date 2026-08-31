import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../db/settings";
import { buildWorkshopPortalVehicles, workshopSlugify } from "../db/workshopPortalData";
import { getConnectionStatus } from "./tauri";

const PUSH_INTERVAL_MS = 3 * 60 * 1000;
const PUSH_AFTER_ORDER_MS = 12 * 1000;

export const WORKSHOP_PORTAL_ENABLED_KEY = "workshop_portal_enabled";
export const WORKSHOP_PORTAL_SLUG_KEY = "workshop_portal_slug";
export const WORKSHOP_PORTAL_LAST_PUSH_AT_KEY = "workshop_portal_last_push_at";
export const WORKSHOP_PORTAL_LAST_ERROR_KEY = "workshop_portal_last_error";

export const WORKSHOP_PORTAL_PUBLIC_BASE = "https://walqo.pro/taller/";

export interface WorkshopPortalStatus {
  enabled: boolean;
  slug: string;
  lastPushAt: string | null;
  lastError: string | null;
}

export function workshopPortalUrl(slug: string): string {
  const s = workshopSlugify(slug);
  return `${WORKSHOP_PORTAL_PUBLIC_BASE}?t=${encodeURIComponent(s)}`;
}

export async function getWorkshopPortalStatus(): Promise<WorkshopPortalStatus> {
  const [enabled, slugRaw, lastPushAt, lastError, businessName] = await Promise.all([
    getSetting(WORKSHOP_PORTAL_ENABLED_KEY),
    getSetting(WORKSHOP_PORTAL_SLUG_KEY),
    getSetting(WORKSHOP_PORTAL_LAST_PUSH_AT_KEY),
    getSetting(WORKSHOP_PORTAL_LAST_ERROR_KEY),
    getSetting("business_name"),
  ]);
  const fallbackSlug = workshopSlugify(businessName?.trim() || "taller");
  return {
    enabled: enabled === "1",
    slug: workshopSlugify(slugRaw?.trim() || fallbackSlug),
    lastPushAt: lastPushAt?.trim() || null,
    lastError: lastError?.trim() || null,
  };
}

export async function setWorkshopPortalEnabled(enabled: boolean): Promise<void> {
  await setSetting(WORKSHOP_PORTAL_ENABLED_KEY, enabled ? "1" : "0");
  if (!enabled) {
    await setSetting(WORKSHOP_PORTAL_LAST_ERROR_KEY, "");
  }
}

export async function setWorkshopPortalSlug(slug: string): Promise<string> {
  const normalized = workshopSlugify(slug);
  await setSetting(WORKSHOP_PORTAL_SLUG_KEY, normalized);
  return normalized;
}

export async function buildWorkshopPortalSnapshot(): Promise<{
  business_name: string;
  workshop_slug: string;
  vehicles: Awaited<ReturnType<typeof buildWorkshopPortalVehicles>>;
  pushed_at: string;
}> {
  const [businessName, slugSetting] = await Promise.all([
    getSetting("business_name"),
    getSetting(WORKSHOP_PORTAL_SLUG_KEY),
  ]);
  const workshop_slug = workshopSlugify(
    slugSetting?.trim() || businessName?.trim() || "taller",
  );
  const vehicles = await buildWorkshopPortalVehicles();
  return {
    business_name: businessName?.trim() || "Taller",
    workshop_slug,
    vehicles,
    pushed_at: new Date().toISOString(),
  };
}

function friendlyPushError(raw: string): string {
  const msg = raw.trim();
  if (!msg) return "No se pudo subir el historial.";
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) {
    return "Sin internet o el servidor no responde. Revisá la conexión e intentá de nuevo.";
  }
  return msg;
}

export async function pushWorkshopPortalSnapshot(): Promise<string | null> {
  try {
    const snapshot = await buildWorkshopPortalSnapshot();
    await invoke("workshop_portal_push", { snapshot });
    const now = new Date().toISOString();
    await setSetting(WORKSHOP_PORTAL_LAST_PUSH_AT_KEY, now);
    await setSetting(WORKSHOP_PORTAL_LAST_ERROR_KEY, "");
    return null;
  } catch (e) {
    const raw =
      typeof e === "string"
        ? e
        : e instanceof Error
          ? e.message
          : "No se pudo subir el historial.";
    const msg = friendlyPushError(raw);
    await setSetting(WORKSHOP_PORTAL_LAST_ERROR_KEY, msg);
    return msg;
  }
}

export async function maybePushWorkshopPortal(): Promise<void> {
  try {
    const enabled = (await getSetting(WORKSHOP_PORTAL_ENABLED_KEY)) === "1";
    if (!enabled) return;
    const conn = await getConnectionStatus().catch(() => ({ online: false }));
    if (!conn.online) return;
    await pushWorkshopPortalSnapshot();
  } catch {
    /* timer de fondo */
  }
}

let timerId: number | null = null;
let orderPushTimer: number | null = null;

export function startWorkshopPortalPushLoop(): void {
  if (typeof window === "undefined") return;
  if (timerId != null) return;
  void maybePushWorkshopPortal();
  timerId = window.setInterval(() => {
    void maybePushWorkshopPortal();
  }, PUSH_INTERVAL_MS);
}

export function scheduleWorkshopPortalPush(): void {
  if (typeof window === "undefined") return;
  if (orderPushTimer != null) window.clearTimeout(orderPushTimer);
  orderPushTimer = window.setTimeout(() => {
    orderPushTimer = null;
    void maybePushWorkshopPortal();
  }, PUSH_AFTER_ORDER_MS);
}
