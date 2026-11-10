/**
 * Tienda web (walqo.pro/NombreDelLocal) desde WalQo Web, igual que push_menu_portal_snapshot y
 * menu_portal_orders_request en license.rs: el navegador arma la carta y acá se sube a license-api,
 * que en vez de la PC activada confía en el secreto compartido y en la licencia de la cuenta.
 */
import { currentEnv } from "./context";
import { storedLicenseKey } from "./license";
import { licenseFetch } from "./licenseApi";
import { accessToken } from "./mercadopago";
import { readMeta, writeMeta } from "./meta";
import { getDb } from "../../../src/db/index";

type Args = Record<string, unknown>;

const ORDER_PATHS: Record<string, string> = {
  pull: "orders/pull",
  update: "orders/update",
  photos: "photos",
  tables: "tables/sync",
  waiters: "waiters/manage",
  waiters_sync: "waiters/sync",
};

const MP_FP_KEY = "menu_portal_mp_token_fp";

function portal(path: string, body: Args): Promise<Record<string, unknown>> {
  const licenseKey = storedLicenseKey();
  if (!licenseKey) throw new Error("Entrá con tu cuenta de WalQo para publicar la tienda.");
  return licenseFetch(currentEnv(), `/v1/menu-portal/${path}`, { ...body, license_key: licenseKey }, true);
}

async function simulationOn(): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select<{ value: string | null }[]>("SELECT value FROM settings WHERE key = 'mp_simulation'");
  return row?.value === "1";
}

async function fingerprint(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`walqo-mp|${token}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * Token de Mercado Pago del comercio para cobrar la tienda online: se sube solo si cambió
 * (o con `force`). Sin conexión o en modo demostración, se borra del servidor.
 */
async function syncMpCredential(action: string, force: boolean) {
  let token: string | null = null;
  if (action === "mp_sync" && !(await simulationOn())) {
    token = await accessToken().catch(() => null);
  }
  const fp = token ? await fingerprint(token) : "";
  if (action === "mp_sync" && !force && fp && fp === readMeta(MP_FP_KEY)) {
    return { ok: true, skipped: true };
  }
  const res = await portal("mp/credentials", token ? { action: "set", access_token: token } : { action: "clear" });
  writeMeta(MP_FP_KEY, fp);
  return res;
}

export const MENU_PORTAL_COMMANDS: Record<string, (args: Args) => Promise<unknown>> = {
  async menu_portal_push(args) {
    await portal("push", { snapshot: args.snapshot });
    return null;
  },

  async menu_portal_orders(args) {
    const action = String(args.action ?? "");
    const payload = args.payload && typeof args.payload === "object" ? (args.payload as Args) : {};
    if (action === "mp_sync" || action === "mp_clear") return syncMpCredential(action, payload.force === true);
    const path = ORDER_PATHS[action];
    if (!path) throw new Error("Acción inválida.");
    return portal(path, payload);
  },
};
