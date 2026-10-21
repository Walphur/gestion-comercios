import { invoke } from "@tauri-apps/api/core";
import { getSetting } from "../db/settings";
import { showNotice } from "./notice";
import { openWhatsApp } from "./openExternal";
import { getConnectionStatus } from "./tauri";
import { getMenuStoreSettings, MENU_PORTAL_ENABLED_KEY } from "./menuPortalPush";
import { formatMoney } from "./format";
import { ingestTableRequests } from "./tables";
import type { RemoteTableRequest } from "../db/tables";

export interface WebOrderItem {
  id: number;
  name: string;
  qty: number;
  price: number;
  cook: string | null;
}

export interface WebOrder {
  id: string;
  code: string;
  customer_name: string;
  customer_phone: string;
  fulfillment: "pickup" | "delivery";
  address: string | null;
  note: string | null;
  items: WebOrderItem[];
  total: number;
  delivery_cost: number | null;
  currency: string;
  notified_at: string | null;
  created_at: string;
  payment_method?: "cash" | "mercadopago";
  /** Solo si el cliente eligió pagar online. `approved` = la plata ya está en Mercado Pago. */
  payment_status?: WebOrderPaymentStatus | null;
  mp_payment_id?: string | null;
  paid_amount?: number | null;
  paid_at?: string | null;
}

export type WebOrderPaymentStatus = "awaiting" | "pending" | "approved" | "rejected" | "review" | "refunded";

/** Estado del token de Mercado Pago en el servidor: `none` = no se cobra online. */
export type WebMpStatus = "ok" | "invalid" | "none";

type WebOrderUpdate =
  | { id: string; status: "charged" }
  | { id: string; status: "rejected"; reason?: string }
  | { id: string; status: "notified" }
  /** Pedido o llamado de una mesa ya anotado en el salón. */
  | { id: string; status: "table_received" }
  /** La mesa (id = número) se cobró o liberó: su «Mi mesa» arranca de cero. */
  | { id: string; status: "table_closed" };

const closesOrder = (u: WebOrderUpdate) => u.status === "charged" || u.status === "rejected";

const POLL_MS = 30_000;
const SEEN_KEY = "wt_web_orders_seen";
const PAID_SEEN_KEY = "wt_web_orders_paid_seen";
const OUTBOX_KEY = "wt_web_orders_outbox";
const MP_WARNED_KEY = "wt_web_orders_mp_warned";
const MP_RETRY_MS = 10 * 60_000;

let orders: WebOrder[] = [];
let lastError: string | null = null;
let mpStatus: WebMpStatus | null = null;
let lastMpForceAt = 0;
const listeners = new Set<() => void>();
let timerId: number | null = null;
let pulling = false;

function emit() {
  for (const fn of listeners) fn();
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ok */
  }
}

/** Ids cobrados o rechazados en esta PC que el servidor todavía no confirmó. */
function outbox(): WebOrderUpdate[] {
  return readJson<WebOrderUpdate[]>(OUTBOX_KEY, []);
}

function hiddenIds(): Set<string> {
  return new Set(outbox().filter(closesOrder).map((u) => u.id));
}

export function getWebOrders(): WebOrder[] {
  const hidden = hiddenIds();
  return orders.filter((o) => !hidden.has(o.id));
}

export function getWebOrdersError(): string | null {
  return lastError;
}

export function getWebMpStatus(): WebMpStatus | null {
  return mpStatus;
}

export function isWebOrderPaid(o: WebOrder): boolean {
  return o.payment_method === "mercadopago" && o.payment_status === "approved" && Boolean(o.mp_payment_id);
}

export function subscribeWebOrders(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function flushOutbox(): Promise<void> {
  const batch = outbox().slice(0, 50);
  if (batch.length === 0) return;
  await invoke("menu_portal_orders", { action: "update", payload: { updates: batch } });
  const key = (u: WebOrderUpdate) => `${u.id}|${u.status}`;
  const sent = new Set(batch.map(key));
  writeJson(
    OUTBOX_KEY,
    outbox().filter((u) => !sent.has(key(u))),
  );
  const closed = new Set(batch.filter(closesOrder).map((u) => u.id));
  if (closed.size > 0) {
    orders = orders.filter((o) => !closed.has(o.id));
    emit();
  }
}

function notifyNew(fresh: WebOrder[]) {
  const seen = new Set(readJson<string[]>(SEEN_KEY, []));
  const firstRun = !localStorage.getItem(SEEN_KEY);
  const unseen = fresh.filter((o) => !seen.has(o.id));
  writeJson(
    SEEN_KEY,
    fresh.map((o) => o.id),
  );
  if (firstRun || unseen.length === 0) return;
  const o = unseen[unseen.length - 1];
  showNotice({
    title: unseen.length > 1 ? `Llegaron ${unseen.length} pedidos web` : "Llegó un pedido web",
    message: `${o.customer_name} pidió desde la tienda (#${o.code}). Lo ves en el Punto de venta, en «Pedidos web».`,
    variant: "info",
  });
}

function notifyPaid(fresh: WebOrder[]) {
  const paid = fresh.filter(isWebOrderPaid);
  const firstRun = !localStorage.getItem(PAID_SEEN_KEY);
  const seen = new Set(readJson<string[]>(PAID_SEEN_KEY, []));
  writeJson(
    PAID_SEEN_KEY,
    paid.map((o) => o.id),
  );
  if (firstRun) return;
  const o = paid.filter((x) => !seen.has(x.id)).pop();
  if (!o) return;
  showNotice({
    title: "Pedido web pagado",
    message: `${o.customer_name} pagó el pedido #${o.code} con Mercado Pago (${formatMoney(o.paid_amount ?? webOrderTotal(o), o.currency)}).`,
    variant: "success",
  });
}

function warnMpInvalid(status: WebMpStatus | null) {
  if (status !== "invalid") {
    if (status === "ok") localStorage.removeItem(MP_WARNED_KEY);
    return;
  }
  if (localStorage.getItem(MP_WARNED_KEY)) return;
  localStorage.setItem(MP_WARNED_KEY, "1");
  showNotice({
    title: "Volvé a conectar Mercado Pago",
    message:
      "Mercado Pago dejó de aceptar la conexión y la tienda web no está cobrando online. Reconectalo en Configuración → Mercado Pago.",
    variant: "error",
  });
}

/** Sube el token de Mercado Pago al servidor si cambió (la PC lo renueva sola). */
export async function syncWebMpCredential(force = false): Promise<WebMpStatus> {
  const r = await invoke<{ ok: boolean; status?: WebMpStatus; skipped?: boolean }>("menu_portal_orders", {
    action: "mp_sync",
    payload: { force },
  });
  if (r.status) {
    mpStatus = r.status;
    emit();
  }
  return r.status ?? mpStatus ?? "ok";
}

/** Borra el token de Mercado Pago del servidor: la tienda deja de cobrar online. */
export async function clearWebMpCredential(): Promise<void> {
  await invoke("menu_portal_orders", { action: "mp_clear", payload: {} });
  mpStatus = "none";
  emit();
}

async function maybeSyncMp(): Promise<void> {
  const store = await getMenuStoreSettings();
  if (!store.ordersEnabled || !store.mpOnline) return;
  const stale = mpStatus !== "ok" && Date.now() - lastMpForceAt > MP_RETRY_MS;
  if (stale) lastMpForceAt = Date.now();
  await syncWebMpCredential(stale);
}

export async function pullWebOrders(): Promise<void> {
  if (pulling) return;
  pulling = true;
  try {
    const enabled = (await getSetting(MENU_PORTAL_ENABLED_KEY)) === "1";
    if (!enabled) {
      orders = [];
      lastError = null;
      emit();
      return;
    }
    const conn = await getConnectionStatus().catch(() => ({ online: false }));
    if (!conn.online) return;
    await flushOutbox().catch(() => undefined);
    await maybeSyncMp().catch(() => undefined);
    const res = await invoke<{
      ok: boolean;
      orders?: WebOrder[];
      mp_status?: WebMpStatus;
      table_requests?: RemoteTableRequest[];
    }>("menu_portal_orders", { action: "pull", payload: {} });
    if (Array.isArray(res.table_requests) && res.table_requests.length > 0) {
      const received = await ingestTableRequests(res.table_requests).catch(() => [] as string[]);
      if (received.length > 0) {
        writeJson(OUTBOX_KEY, [
          ...outbox(),
          ...received.map((id): WebOrderUpdate => ({ id, status: "table_received" })),
        ]);
        void flushOutbox().catch(() => undefined);
      }
    }
    orders = Array.isArray(res.orders) ? res.orders : [];
    if (res.mp_status) mpStatus = res.mp_status;
    lastError = null;
    notifyNew(getWebOrders());
    notifyPaid(getWebOrders());
    warnMpInvalid(mpStatus);
    emit();
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
    emit();
  } finally {
    pulling = false;
  }
}

export function startWebOrdersLoop(): void {
  if (typeof window === "undefined" || timerId != null) return;
  void pullWebOrders();
  timerId = window.setInterval(() => void pullWebOrders(), POLL_MS);
}

async function queueUpdate(update: WebOrderUpdate): Promise<void> {
  writeJson(OUTBOX_KEY, [...outbox().filter((u) => !(u.id === update.id && u.status === update.status)), update]);
  emit();
  await flushOutbox().catch(() => undefined);
}

export async function markWebOrderCharged(id: string): Promise<void> {
  await queueUpdate({ id, status: "charged" });
}

/** Avisa al servidor que la mesa se liberó, para que el QR no muestre lo de los clientes anteriores. */
export async function markWebTableClosed(tableNumber: number): Promise<void> {
  if ((await getSetting(MENU_PORTAL_ENABLED_KEY)) !== "1") return;
  await queueUpdate({ id: String(tableNumber), status: "table_closed" });
}

export async function rejectWebOrder(order: WebOrder, reason: string): Promise<void> {
  await queueUpdate({ id: order.id, status: "rejected", reason: reason.trim().slice(0, 200) || undefined });
}

export function webOrderTotal(o: WebOrder): number {
  return o.total + (o.delivery_cost ?? 0);
}

/** Abre WhatsApp al cliente avisando que el pedido está confirmado o listo. */
export async function notifyWebOrderCustomer(
  order: WebOrder,
  businessName: string,
  kind: "confirmed" | "ready",
): Promise<{ copied: boolean }> {
  const biz = businessName.trim() || "el local";
  const first = order.customer_name.trim().split(/\s+/)[0] || "";
  const text =
    kind === "ready"
      ? order.fulfillment === "delivery"
        ? `Hola ${first}! Tu pedido #${order.code} de ${biz} ya salió para tu casa.`
        : `Hola ${first}! Tu pedido #${order.code} de ${biz} está listo para retirar.`
      : `Hola ${first}! Recibimos tu pedido #${order.code} en ${biz} y está confirmado. Te avisamos cuando esté listo.`;
  const r = await openWhatsApp(order.customer_phone, text);
  void queueUpdate({ id: order.id, status: "notified" });
  return { copied: r.copied };
}

/** Avisa al cliente que el pedido no se puede hacer. */
export async function notifyWebOrderRejected(
  order: WebOrder,
  businessName: string,
  reason: string,
): Promise<void> {
  const biz = businessName.trim() || "el local";
  const first = order.customer_name.trim().split(/\s+/)[0] || "";
  const why = reason.trim() ? ` Motivo: ${reason.trim()}.` : "";
  const refund = webOrderHasMoney(order) ? " Te devolvemos lo que pagaste por Mercado Pago." : "";
  await openWhatsApp(
    order.customer_phone,
    `Hola ${first}. Perdón, no podemos tomar tu pedido #${order.code} de ${biz}.${why}${refund}`,
  );
}

/** El cliente ya pagó algo online (aprobado o con monto a revisar). */
export function webOrderHasMoney(o: WebOrder): boolean {
  return o.payment_method === "mercadopago" && (o.payment_status === "approved" || o.payment_status === "review");
}
