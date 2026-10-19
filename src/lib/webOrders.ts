import { invoke } from "@tauri-apps/api/core";
import { getSetting } from "../db/settings";
import { showNotice } from "./notice";
import { openWhatsApp } from "./openExternal";
import { getConnectionStatus } from "./tauri";
import { MENU_PORTAL_ENABLED_KEY } from "./menuPortalPush";

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
}

type WebOrderUpdate =
  | { id: string; status: "charged" }
  | { id: string; status: "rejected"; reason?: string }
  | { id: string; status: "notified" };

const POLL_MS = 30_000;
const SEEN_KEY = "wt_web_orders_seen";
const OUTBOX_KEY = "wt_web_orders_outbox";

let orders: WebOrder[] = [];
let lastError: string | null = null;
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
  return new Set(outbox().filter((u) => u.status !== "notified").map((u) => u.id));
}

export function getWebOrders(): WebOrder[] {
  const hidden = hiddenIds();
  return orders.filter((o) => !hidden.has(o.id));
}

export function getWebOrdersError(): string | null {
  return lastError;
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
  const closed = new Set(batch.filter((u) => u.status !== "notified").map((u) => u.id));
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
    const res = await invoke<{ ok: boolean; orders?: WebOrder[] }>("menu_portal_orders", {
      action: "pull",
      payload: {},
    });
    orders = Array.isArray(res.orders) ? res.orders : [];
    lastError = null;
    notifyNew(getWebOrders());
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
  await openWhatsApp(
    order.customer_phone,
    `Hola ${first}. Perdón, no podemos tomar tu pedido #${order.code} de ${biz}.${why}`,
  );
}
