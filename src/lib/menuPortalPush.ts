import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../db/settings";
import { buildMenuPortalProducts, menuSlugify } from "../db/menuPortalData";
import { getBusinessLogoDataUrl } from "./brandingApi";
import { attachMenuPortalPhotos } from "./menuPortalPhotos";
import { getConnectionStatus } from "./tauri";

const PUSH_INTERVAL_MS = 3 * 60 * 1000;
const PUSH_AFTER_CHANGE_MS = 12 * 1000;

export const MENU_PORTAL_ENABLED_KEY = "menu_portal_enabled";
export const MENU_PORTAL_SLUG_KEY = "menu_portal_slug";
export const MENU_PORTAL_LAST_PUSH_AT_KEY = "menu_portal_last_push_at";
export const MENU_PORTAL_LAST_ERROR_KEY = "menu_portal_last_error";

export const MENU_PORTAL_PUBLIC_BASE = "https://walqo.pro/carta/";

const STORE_KEYS = {
  ordersEnabled: "menu_portal_orders_enabled",
  hideOutOfStock: "menu_portal_hide_out_of_stock",
  color: "menu_portal_color",
  cover: "menu_portal_cover",
  hours: "menu_portal_hours",
  pickup: "menu_portal_pickup",
  delivery: "menu_portal_delivery",
  deliveryCost: "menu_portal_delivery_cost",
  mpOnline: "menu_portal_mp_online",
} as const;

/** Lo que el comercio elige de su tienda web. */
export interface MenuStoreSettings {
  ordersEnabled: boolean;
  hideOutOfStock: boolean;
  color: string;
  coverDataUrl: string;
  hours: string;
  pickup: boolean;
  delivery: boolean;
  deliveryCost: number | null;
  /** Ofrecer «Pagar ahora con Mercado Pago» en la tienda. */
  mpOnline: boolean;
}

export const DEFAULT_STORE_COLOR = "#1f6b4a";

export async function getMenuStoreSettings(): Promise<MenuStoreSettings> {
  const [orders, hide, color, cover, hours, pickup, delivery, cost, mpOnline] = await Promise.all([
    getSetting(STORE_KEYS.ordersEnabled),
    getSetting(STORE_KEYS.hideOutOfStock),
    getSetting(STORE_KEYS.color),
    getSetting(STORE_KEYS.cover),
    getSetting(STORE_KEYS.hours),
    getSetting(STORE_KEYS.pickup),
    getSetting(STORE_KEYS.delivery),
    getSetting(STORE_KEYS.deliveryCost),
    getSetting(STORE_KEYS.mpOnline),
  ]);
  const costNum = Number(cost);
  return {
    ordersEnabled: orders !== "0",
    hideOutOfStock: hide === "1",
    color: /^#[0-9a-f]{6}$/i.test(color?.trim() ?? "") ? color!.trim() : DEFAULT_STORE_COLOR,
    coverDataUrl: cover?.trim() ?? "",
    hours: hours ?? "",
    pickup: pickup !== "0",
    delivery: delivery === "1",
    deliveryCost: Number.isFinite(costNum) && costNum > 0 ? costNum : null,
    mpOnline: mpOnline === "1",
  };
}

export async function saveMenuStoreSettings(patch: Partial<MenuStoreSettings>): Promise<void> {
  const writes: Promise<void>[] = [];
  const flag = (v: boolean) => (v ? "1" : "0");
  if (patch.ordersEnabled !== undefined) writes.push(setSetting(STORE_KEYS.ordersEnabled, flag(patch.ordersEnabled)));
  if (patch.hideOutOfStock !== undefined) writes.push(setSetting(STORE_KEYS.hideOutOfStock, flag(patch.hideOutOfStock)));
  if (patch.color !== undefined) writes.push(setSetting(STORE_KEYS.color, patch.color));
  if (patch.coverDataUrl !== undefined) writes.push(setSetting(STORE_KEYS.cover, patch.coverDataUrl));
  if (patch.hours !== undefined) writes.push(setSetting(STORE_KEYS.hours, patch.hours.slice(0, 300)));
  if (patch.pickup !== undefined) writes.push(setSetting(STORE_KEYS.pickup, flag(patch.pickup)));
  if (patch.delivery !== undefined) writes.push(setSetting(STORE_KEYS.delivery, flag(patch.delivery)));
  if (patch.deliveryCost !== undefined) {
    writes.push(setSetting(STORE_KEYS.deliveryCost, patch.deliveryCost ? String(patch.deliveryCost) : ""));
  }
  if (patch.mpOnline !== undefined) writes.push(setSetting(STORE_KEYS.mpOnline, flag(patch.mpOnline)));
  await Promise.all(writes);
}

export interface MenuPortalStatus {
  enabled: boolean;
  slug: string;
  lastPushAt: string | null;
  lastError: string | null;
}

/** Debe coincidir con las carpetas reservadas de docs/404.html. */
const RESERVED_ROOT_PATHS = new Set([
  "turnos", "carta", "app", "taller", "legal", "tools", "marketing", "oauth", "assets",
  "branding", "guias", "precios", "celular", "funciones", "recursos", "walqo", "admin",
  "como-funciona", "gestion-de-stock", "sistema-punto-de-venta", "software-para-comercios",
  "software-gestion-comercial", "software-para-kioscos", "software-para-almacenes",
  "descargas", "plantillas",
]);

export function menuPortalUrl(slug: string): string {
  const s = menuSlugify(slug);
  if (s.length >= 3 && !RESERVED_ROOT_PATHS.has(s)) return `https://walqo.pro/${s}`;
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
  store: Record<string, unknown>;
  pushed_at: string;
}> {
  const store = await getMenuStoreSettings();
  const [businessName, slugSetting, products, logoDataUrl, whatsapp, currency] =
    await Promise.all([
      getSetting("business_name"),
      getSetting(MENU_PORTAL_SLUG_KEY),
      buildMenuPortalProducts({
        hideOutOfStock: store.hideOutOfStock,
        photoBudget: 980_000 - store.coverDataUrl.length,
      }),
      getBusinessLogoDataUrl(),
      resolveWhatsApp(),
      getSetting("currency"),
    ]);
  const menu_slug = menuSlugify(slugSetting?.trim() || businessName?.trim() || "carta");
  await attachMenuPortalPhotos(products);
  return {
    business_name: businessName?.trim() || "Mi local",
    menu_slug,
    logo_data_url: logoDataUrl,
    whatsapp,
    currency: currency?.trim() || "$",
    products,
    store: {
      color: store.color,
      ...(store.coverDataUrl ? { cover_data_url: store.coverDataUrl } : {}),
      hours: store.hours.trim(),
      pickup: store.pickup,
      delivery: store.delivery,
      delivery_cost: store.delivery ? store.deliveryCost : null,
      orders_enabled: store.ordersEnabled,
      hide_out_of_stock: store.hideOutOfStock,
      mp_online: store.ordersEnabled && store.mpOnline,
    },
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
