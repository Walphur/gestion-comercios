import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../db/settings";
import { buildMenuPortalProducts, menuSlugify } from "../db/menuPortalData";
import { getBusinessLogoDataUrl } from "./brandingApi";
import { getConnectionStatus } from "./tauri";

const PUSH_INTERVAL_MS = 3 * 60 * 1000;
const PUSH_AFTER_CHANGE_MS = 12 * 1000;

export const MENU_PORTAL_ENABLED_KEY = "menu_portal_enabled";
export const MENU_PORTAL_SLUG_KEY = "menu_portal_slug";
export const MENU_PORTAL_LAST_PUSH_AT_KEY = "menu_portal_last_push_at";
export const MENU_PORTAL_LAST_ERROR_KEY = "menu_portal_last_error";

export const MENU_PORTAL_PUBLIC_BASE = "https://walqo.pro/carta/";

export interface MenuPortalStatus {
  enabled: boolean;
  slug: string;
  lastPushAt: string | null;
  lastError: string | null;
}

export function menuPortalUrl(slug: string): string {
  const s = menuSlugify(slug);
  return `${MENU_PORTAL_PUBLIC_BASE}?t=${encodeURIComponent(s)}`;
}

export async function getMenuPortalStatus(): Promise<MenuPortalStatus> {
  const [enabled, slugRaw, lastPushAt, lastError, businessName] = await Promise.all([
    getSetting(MENU_PORTAL_ENABLED_KEY),
    getSetting(MENU_PORTAL_SLUG_KEY),
    getSetting(MENU_PORTAL_LAST_PUSH_AT_KEY),
    getSetting(MENU_PORTAL_LAST_ERROR_KEY),
    getSetting("business_name"),
  ]);
  const fallbackSlug = menuSlugify(businessName?.trim() || "carta");
  return {
    enabled: enabled === "1",
    slug: menuSlugify(slugRaw?.trim() || fallbackSlug),
    lastPushAt: lastPushAt?.trim() || null,
    lastError: lastError?.trim() || null,
  };
}

export async function setMenuPortalEnabled(enabled: boolean): Promise<void> {
  await setSetting(MENU_PORTAL_ENABLED_KEY, enabled ? "1" : "0");
  if (!enabled) {
    await setSetting(MENU_PORTAL_LAST_ERROR_KEY, "");
  }
}

export async function setMenuPortalSlug(slug: string): Promise<string> {
  const normalized = menuSlugify(slug);
  await setSetting(MENU_PORTAL_SLUG_KEY, normalized);
  return normalized;
}

async function resolveWhatsApp(): Promise<string | null> {
  const [wa, phone, businessPhone] = await Promise.all([
    getSetting("print_whatsapp"),
    getSetting("print_phone"),
    getSetting("business_phone"),
  ]);
  const raw = wa?.trim() || phone?.trim() || businessPhone?.trim() || "";
  return raw || null;
}

export async function buildMenuPortalSnapshot(): Promise<{
  business_name: string;
  menu_slug: string;
  logo_data_url?: string | null;
  whatsapp?: string | null;
  currency: string;
  products: Awaited<ReturnType<typeof buildMenuPortalProducts>>;
  pushed_at: string;
}> {
  const [businessName, slugSetting, products, logoDataUrl, whatsapp, currency] =
    await Promise.all([
      getSetting("business_name"),
      getSetting(MENU_PORTAL_SLUG_KEY),
      buildMenuPortalProducts(),
      getBusinessLogoDataUrl(),
      resolveWhatsApp(),
      getSetting("currency"),
    ]);
  const menu_slug = menuSlugify(slugSetting?.trim() || businessName?.trim() || "carta");
  return {
    business_name: businessName?.trim() || "Mi local",
    menu_slug,
    logo_data_url: logoDataUrl,
    whatsapp,
    currency: currency?.trim() || "$",
    products,
    pushed_at: new Date().toISOString(),
  };
}

function friendlyPushError(raw: string): string {
  const msg = raw.trim();
  if (!msg) return "No se pudo subir la carta.";
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) {
    return "Sin internet o el servidor no responde. Revisá la conexión e intentá de nuevo.";
  }
  return msg;
}

export async function pushMenuPortalSnapshot(): Promise<string | null> {
  try {
    const snapshot = await buildMenuPortalSnapshot();
    await invoke("menu_portal_push", { snapshot });
    const now = new Date().toISOString();
    await setSetting(MENU_PORTAL_LAST_PUSH_AT_KEY, now);
    await setSetting(MENU_PORTAL_LAST_ERROR_KEY, "");
    return null;
  } catch (e) {
    const raw =
      typeof e === "string"
        ? e
        : e instanceof Error
          ? e.message
          : "No se pudo subir la carta.";
    const msg = friendlyPushError(raw);
    await setSetting(MENU_PORTAL_LAST_ERROR_KEY, msg);
    return msg;
  }
}

export async function maybePushMenuPortal(): Promise<void> {
  try {
    const enabled = (await getSetting(MENU_PORTAL_ENABLED_KEY)) === "1";
    if (!enabled) return;
    const conn = await getConnectionStatus().catch(() => ({ online: false }));
    if (!conn.online) return;
    await pushMenuPortalSnapshot();
  } catch {
    /* timer de fondo */
  }
}

let timerId: number | null = null;
let changePushTimer: number | null = null;

export function startMenuPortalPushLoop(): void {
  if (typeof window === "undefined") return;
  if (timerId != null) return;
  void maybePushMenuPortal();
  timerId = window.setInterval(() => {
    void maybePushMenuPortal();
  }, PUSH_INTERVAL_MS);
}

/** Tras crear/editar productos: subir carta si está publicada. */
export function scheduleMenuPortalPush(): void {
  if (typeof window === "undefined") return;
  if (changePushTimer != null) window.clearTimeout(changePushTimer);
  changePushTimer = window.setTimeout(() => {
    changePushTimer = null;
    void maybePushMenuPortal();
  }, PUSH_AFTER_CHANGE_MS);
}
