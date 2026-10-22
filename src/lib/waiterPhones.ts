import { invoke } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../db/settings";
import { getProduct } from "../db/products";
import { listStaffUsers } from "../db/users";
import {
  applyWaiterTableCommand,
  findActiveTableByNumber,
  getWaiterCommandLog,
  listDiningTables,
  listOpenTableCalls,
  listOpenTableOrders,
  listTableOrderItems,
  logWaiterCommand,
  openOrderIdForTable,
  resolveTableCalls,
  tableItemTotal,
  tableLabel,
  type WaiterCommandStatus,
} from "../db/tables";
import { entitlementBlockedMessage } from "../config/planEntitlements";
import { FREE_MAX_WAITER_PHONES } from "../config/pricing";
import { MENU_PORTAL_ENABLED_KEY } from "./menuPortalPush";
import { printKitchenTicket } from "./prints/kitchenTicket";
import { printTablePreBill, refreshTableAlerts, tableKitchenLines, usableTableIds } from "./tables";
import { getConnectionStatus } from "./tauri";
import { productSoldByWeight } from "./weightSale";
import { showFlash } from "./notice";

export const WAITER_PAGE_BASE = "https://walqo.pro/mozo/";
const LINKED_KEY = "waiter_phones_linked";
const ACKS_KEY = "wt_waiter_acks";
/** Con un mozo usando el celular (visto en los últimos 15 min). */
const FAST_MS = 8_000;
/** Hay celulares vinculados pero nadie lo está usando. */
const SLOW_MS = 30_000;
/** Sin celulares vinculados: no se consulta el servidor, solo se revisa la PC. */
const IDLE_MS = 60_000;
const FLOOR_HEARTBEAT_MS = 55_000;
const PRINT_GAP_MS = 1_500;

export interface WaiterLink {
  id: string;
  name: string;
  user_id?: number | null;
  created_at: string;
  last_seen_at: string | null;
}

interface RemoteWaiterCommand {
  id: string;
  kind: "open" | "order" | "prebill" | "attend";
  table_number: number;
  waiter_id: string;
  waiter_name: string;
  waiter_user_id: number | null;
  created_at: string;
  guests?: number;
  items?: { id: number; name: string; qty: number; price: number; note: string | null; cook: string | null }[];
  note?: string;
}

interface WaiterAck {
  id: string;
  status: WaiterCommandStatus;
  note?: string | null;
}

interface SyncResponse {
  ok: boolean;
  commands?: RemoteWaiterCommand[];
  waiters?: WaiterLink[];
  active?: number;
}

export function waiterLinkUrl(token: string): string {
  return `${WAITER_PAGE_BASE}#k=${encodeURIComponent(token)}`;
}

/* ---------- Vincular celulares ---------- */

let links: WaiterLink[] | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function getCachedWaiterLinks(): WaiterLink[] | null {
  return links;
}

export function subscribeWaiterLinks(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function rememberLinks(next: WaiterLink[]): Promise<void> {
  links = next;
  emit();
  const count = String(next.length);
  if ((await getSetting(LINKED_KEY)) !== count) await setSetting(LINKED_KEY, count);
}

export async function listWaiterLinks(): Promise<WaiterLink[]> {
  const res = await invoke<{ ok: boolean; waiters?: WaiterLink[] }>("menu_portal_orders", {
    action: "waiters",
    payload: { op: "list" },
  });
  const next = Array.isArray(res.waiters) ? res.waiters : [];
  await rememberLinks(next);
  return next;
}

/** El enlace en claro vuelve una sola vez: el servidor guarda solo su huella. */
export async function createWaiterLink(name: string, userId: number | null): Promise<{ link: WaiterLink; url: string }> {
  const res = await invoke<{ ok: boolean; token: string; waiter: WaiterLink }>("menu_portal_orders", {
    action: "waiters",
    payload: { op: "create", name: name.trim(), user_id: userId },
  });
  await rememberLinks([...(links ?? []).filter((l) => l.id !== res.waiter.id), res.waiter]);
  if (config.enabled) schedule(1_500);
  return { link: res.waiter, url: waiterLinkUrl(res.token) };
}

export async function revokeWaiterLink(id: string): Promise<WaiterLink[]> {
  const res = await invoke<{ ok: boolean; waiters?: WaiterLink[] }>("menu_portal_orders", {
    action: "waiters",
    payload: { op: "revoke", id },
  });
  const next = Array.isArray(res.waiters) ? res.waiters : [];
  await rememberLinks(next);
  return next;
}

/** En Gratis y Permanente solo anda el primer celular vinculado. */
export function allowedWaiterIds(list: WaiterLink[], unlimited: boolean): Set<string> {
  const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return new Set((unlimited ? sorted : sorted.slice(0, FREE_MAX_WAITER_PHONES)).map((l) => l.id));
}

/* ---------- Sincronización con los celulares ---------- */

export interface WaiterSyncConfig {
  enabled: boolean;
  unlimitedWaiters: boolean;
  unlimitedTables: boolean;
  businessName: string;
  currency: string;
}

let config: WaiterSyncConfig = {
  enabled: false,
  unlimitedWaiters: false,
  unlimitedTables: false,
  businessName: "",
  currency: "$",
};
let timerId: number | null = null;
let running = false;
let fast = false;
let lastFloor = "";
let lastFloorAt = 0;

function readAcks(): WaiterAck[] {
  try {
    const raw = localStorage.getItem(ACKS_KEY);
    return raw ? (JSON.parse(raw) as WaiterAck[]) : [];
  } catch {
    return [];
  }
}

function writeAcks(list: WaiterAck[]) {
  try {
    localStorage.setItem(ACKS_KEY, JSON.stringify(list.slice(-200)));
  } catch {
    /* ok */
  }
}

function schedule(ms: number) {
  if (typeof window === "undefined") return;
  if (timerId != null) window.clearTimeout(timerId);
  timerId = window.setTimeout(() => void tick(), ms);
}

export function configureWaiterSync(next: WaiterSyncConfig): void {
  config = next;
  schedule(1_500);
}

export function stopWaiterSync(): void {
  config = { ...config, enabled: false };
  if (timerId != null) window.clearTimeout(timerId);
  timerId = null;
}

let nudgeId: number | null = null;

/** Algo pudo cambiar en el salón: si cambió, se publica enseguida (con celulares vinculados). */
export function nudgeWaiterSync(): void {
  if (!config.enabled || typeof window === "undefined") return;
  if (nudgeId != null) window.clearTimeout(nudgeId);
  nudgeId = window.setTimeout(() => {
    nudgeId = null;
    if (running || !lastFloorAt) return;
    void buildFloor()
      .then((f) => {
        if (JSON.stringify(f) !== lastFloor) schedule(0);
      })
      .catch(() => undefined);
  }, 1_200);
}

async function buildFloor() {
  const [tables, orders, calls] = await Promise.all([listDiningTables(), listOpenTableOrders(), listOpenTableCalls()]);
  const usable = usableTableIds(tables, config.unlimitedTables);
  const orderBy = new Map(orders.map((o) => [o.table_id, o]));
  const out = [];
  for (const t of tables) {
    if (!usable.has(t.id)) continue;
    const o = orderBy.get(t.id);
    const kinds = [...new Set(calls.filter((c) => c.table_id === t.id).map((c) => c.kind))];
    const items = o ? await listTableOrderItems(o.id) : [];
    out.push({
      number: t.number,
      name: t.name,
      zone: t.zone,
      state: !o ? "free" : o.bill_requested_at || kinds.includes("bill") ? "bill" : "busy",
      guests: o?.guests ?? null,
      total: o?.total ?? 0,
      opened_at: o?.opened_at ?? null,
      waiter: o?.waiter_name ?? null,
      calls: kinds,
      items: items.map((i) => ({
        label: i.label,
        qty: i.qty,
        total: tableItemTotal(i),
        status: i.status,
        note: i.note,
      })),
    });
  }
  return { tables: out };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface CommandContext {
  allowed: Set<string>;
  usable: Set<number>;
  activeUsers: Set<number>;
  printed: number;
}

async function finish(c: RemoteWaiterCommand, status: WaiterCommandStatus, note: string | null = null): Promise<WaiterAck> {
  await logWaiterCommand(c.id, {
    kind: c.kind,
    tableNumber: c.table_number,
    waiterName: c.waiter_name,
    status,
    note,
  });
  return { id: c.id, status, note };
}

async function applyCommand(c: RemoteWaiterCommand, ctx: CommandContext): Promise<WaiterAck> {
  const logged = await getWaiterCommandLog(c.id);
  if (logged) return { id: c.id, status: logged.status, note: logged.note };
  if (!ctx.allowed.has(c.waiter_id)) return finish(c, "rejected", entitlementBlockedMessage("waiterPhones"));
  const table = await findActiveTableByNumber(c.table_number);
  if (!table || !ctx.usable.has(table.id)) return finish(c, "rejected", "Esa mesa ya no está en el salón.");
  const waiterUserId = c.waiter_user_id && ctx.activeUsers.has(c.waiter_user_id) ? c.waiter_user_id : null;
  const label = tableLabel(table);
  const input = {
    remoteId: c.id,
    tableId: table.id,
    tableNumber: table.number,
    guests: c.guests && c.guests > 0 ? c.guests : null,
    waiterName: c.waiter_name,
    waiterUserId,
  };

  if (c.kind === "open") {
    const res = await applyWaiterTableCommand({ ...input, kind: "open" }, []);
    if (res.duplicate) return { id: c.id, status: "received", note: null };
    showFlash({ message: `${c.waiter_name} abrió ${label} desde el celular.` });
    return { id: c.id, status: "received", note: null };
  }

  if (c.kind === "order") {
    const skipped: string[] = [];
    const lines = [];
    for (const it of c.items ?? []) {
      const p = await getProduct(it.id);
      if (!p || !p.active || p.has_variants || p.serialized || productSoldByWeight(p.unit)) {
        skipped.push(p?.name ?? it.name);
        continue;
      }
      lines.push({
        productId: p.id,
        label: it.cook ? `${p.name} (${it.cook})` : p.name,
        price: p.price,
        qty: it.qty,
        cook: it.cook,
        note: it.note?.trim() || null,
      });
    }
    const skippedNote = skipped.length ? `Cargalo desde la caja: ${skipped.slice(0, 5).join(", ")}.` : null;
    if (lines.length === 0) return finish(c, "rejected", skippedNote ?? "La comanda llegó vacía.");
    const res = await applyWaiterTableCommand({ ...input, kind: "order" }, lines);
    if (res.duplicate) {
      const again = await getWaiterCommandLog(c.id);
      return { id: c.id, status: again?.status ?? "received", note: again?.note ?? null };
    }
    if (ctx.printed > 0) await sleep(PRINT_GAP_MS);
    printKitchenTicket({
      businessName: config.businessName,
      saleId: res.orderId,
      label: `${label} · Ronda ${res.round}`,
      items: await tableKitchenLines(res.items),
      notes: [`Mozo: ${c.waiter_name} (celular)`, c.note ?? ""].filter(Boolean).join(" · "),
    });
    ctx.printed++;
    showFlash({ message: `${c.waiter_name} mandó la ronda ${res.round} de ${label} a cocina.` });
    return finish(c, "printed", skippedNote);
  }

  const orderId = await openOrderIdForTable(table.id);
  if (c.kind === "prebill") {
    if (orderId == null) return finish(c, "rejected", "La mesa no tiene la cuenta abierta.");
    if (ctx.printed > 0) await sleep(PRINT_GAP_MS);
    const ok = await printTablePreBill(orderId, { businessName: config.businessName, currency: config.currency });
    if (!ok) return finish(c, "rejected", "La mesa todavía no tiene nada cargado.");
    ctx.printed++;
    showFlash({ message: `${c.waiter_name} pidió la pre-cuenta de ${label}.` });
    return finish(c, "printed");
  }

  await resolveTableCalls(table.id);
  return finish(c, "received");
}

async function processCommands(list: RemoteWaiterCommand[], waiters: WaiterLink[]): Promise<WaiterAck[]> {
  const [tables, staff] = await Promise.all([listDiningTables(), listStaffUsers().catch(() => [])]);
  const ctx: CommandContext = {
    allowed: allowedWaiterIds(waiters, config.unlimitedWaiters),
    usable: usableTableIds(tables, config.unlimitedTables),
    activeUsers: new Set(staff.filter((u) => u.active).map((u) => u.id)),
    printed: 0,
  };
  const acks: WaiterAck[] = [];
  for (const c of list) {
    try {
      acks.push(await applyCommand(c, ctx));
    } catch (e) {
      console.error("waiter command", e);
    }
  }
  return acks;
}

async function syncOnce(): Promise<boolean> {
  const floor = await buildFloor();
  const floorJson = JSON.stringify(floor);
  const sendFloor = floorJson !== lastFloor || Date.now() - lastFloorAt > FLOOR_HEARTBEAT_MS;
  const acks = readAcks().slice(0, 50);
  const res = await invoke<SyncResponse>("menu_portal_orders", {
    action: "waiters_sync",
    payload: { ...(sendFloor ? { floor } : {}), acks },
  });
  if (sendFloor) {
    lastFloor = floorJson;
    lastFloorAt = Date.now();
  }
  if (acks.length > 0) {
    const sent = new Set(acks.map((a) => `${a.id}|${a.status}`));
    writeAcks(readAcks().filter((a) => !sent.has(`${a.id}|${a.status}`)));
  }
  const waiters = Array.isArray(res.waiters) ? res.waiters : [];
  await rememberLinks(waiters);
  fast = (res.active ?? 0) > 0;
  const commands = Array.isArray(res.commands) ? res.commands : [];
  if (commands.length === 0) return false;
  const done = await processCommands(commands, waiters);
  if (done.length > 0) writeAcks([...readAcks(), ...done]);
  window.dispatchEvent(new CustomEvent("walqo:tables-changed"));
  void refreshTableAlerts();
  return true;
}

async function tick(): Promise<void> {
  if (running) {
    schedule(2_000);
    return;
  }
  running = true;
  let next = IDLE_MS;
  try {
    if (!config.enabled) return;
    const linked = Number(await getSetting(LINKED_KEY)) || 0;
    if (linked <= 0 || (await getSetting(MENU_PORTAL_ENABLED_KEY)) !== "1") return;
    next = SLOW_MS;
    const conn = await getConnectionStatus().catch(() => ({ online: false }));
    if (!conn.online) return;
    const again = await syncOnce();
    next = again ? 800 : fast ? FAST_MS : SLOW_MS;
  } catch (e) {
    console.error("waiter sync", e);
    next = SLOW_MS;
  } finally {
    running = false;
    if (config.enabled) schedule(next);
  }
}
