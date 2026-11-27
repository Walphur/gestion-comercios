import { invoke } from "@tauri-apps/api/core";
import { getSetting } from "../db/settings";
import { getProduct } from "../db/products";
import { listKitComponents } from "../db/kits";
import {
  findActiveTableByNumber,
  getTableOrder,
  ingestRemoteTableRequest,
  listOpenTableCalls,
  listOpenTableOrders,
  listTableOrderItems,
  markTableBillRequested,
  sendTableOrderToKitchen,
  tableItemTotal,
  tableLabel,
  type DiningTable,
  type RemoteTableRequest,
  type TableOrderItem,
} from "../db/tables";
import { listReadyFoodAlerts, type ReadyFoodAlert } from "../db/kitchen";
import { FREE_MAX_TABLES } from "../config/pricing";
import { roundMoney } from "./discount";
import { showNotice } from "./notice";
import { MENU_PORTAL_PUBLIC_BASE } from "./menuPortalPush";
import { printKitchenTicketsByStation } from "./prints/kitchenTicket";
import { printPreBill } from "./prints/tablePrints";

/** Pedidos del QR de mesa: «1» = van solos a cocina; sin valor o «0» = pide confirmación. */
export const TABLES_QR_AUTO_SETTING = "tables_qr_auto";

export async function isTablesQrAuto(): Promise<boolean> {
  return (await getSetting(TABLES_QR_AUTO_SETTING).catch(() => null)) === "1";
}

/** Mesas que se pueden usar: todas con WalQo Completo; en la prueba, las primeras del salón. */
export function usableTableIds(tables: DiningTable[], unlimited: boolean): Set<number> {
  return new Set((unlimited ? tables : tables.slice(0, FREE_MAX_TABLES)).map((t) => t.id));
}

export async function tablesModuleOn(): Promise<boolean> {
  const [flag, rubro] = await Promise.all([getSetting("tables_enabled"), getSetting("rubro")]);
  if (rubro !== "gastronomia") return false;
  if (flag === "1") return true;
  if (flag === "0") return false;
  return true;
}

export interface TableQrLink {
  number: number;
  token: string;
}

/**
 * Sube las mesas al servidor de la tienda web y trae el código firmado de cada QR.
 * Una mesa que se quita deja de aceptar pedidos aunque su QR siga impreso.
 */
export async function syncTablesToPortal(
  tables: Pick<DiningTable, "number" | "name">[],
  rotate = false,
): Promise<{ links: TableQrLink[]; slug: string | null }> {
  const res = await invoke<{ ok: boolean; tables?: TableQrLink[]; menu_slug?: string | null }>(
    "menu_portal_orders",
    {
      action: "tables",
      payload: { tables: tables.map((t) => ({ number: t.number, name: t.name ?? null })), rotate },
    },
  );
  return { links: Array.isArray(res.tables) ? res.tables : [], slug: res.menu_slug ?? null };
}

export function tableQrUrl(slug: string, number: number, token: string): string {
  const q = new URLSearchParams({ t: slug, mesa: String(number), k: token });
  return `${MENU_PORTAL_PUBLIC_BASE}?${q.toString()}`;
}

/** Renglones de la comanda de cocina: con nota y, si es un combo, sus componentes. */
export async function tableKitchenLines(list: TableOrderItem[]): Promise<{ name: string; qty: number }[]> {
  const out: { name: string; qty: number }[] = [];
  for (const i of list) {
    const name = i.note ? `${i.label} — ${i.note}` : i.label;
    const comps = await listKitComponents(i.product_id).catch(() => []);
    if (comps.length) {
      out.push({ name: `▸ ${name}`, qty: i.qty });
      for (const c of comps) out.push({ name: `  ${c.name}`, qty: c.qty * i.qty });
      continue;
    }
    out.push({ name, qty: i.qty });
  }
  return out;
}

/** Imprime la pre-cuenta de la cuenta abierta y la marca como pedida. false = no hay nada cargado. */
export async function printTablePreBill(
  orderId: number,
  opts: { businessName: string; currency: string },
): Promise<boolean> {
  const [order, items, open] = await Promise.all([getTableOrder(orderId), listTableOrderItems(orderId), listOpenTableOrders()]);
  const billed = items.filter((i) => i.status !== "pending" && i.paid_sale_id == null);
  if (!order || billed.length === 0) return false;
  const lines = new Map<string, { name: string; qty: number; total: number }>();
  for (const i of [...billed].sort((a, b) => Number(b.status === "sent") - Number(a.status === "sent"))) {
    const key = `${i.label}|${i.unit_price}`;
    const cur = lines.get(key);
    if (cur) {
      cur.qty += i.qty;
      cur.total += tableItemTotal(i);
    } else {
      lines.set(key, { name: i.label, qty: i.qty, total: tableItemTotal(i) });
    }
  }
  const info = open.find((o) => o.id === orderId);
  printPreBill({
    businessName: opts.businessName,
    tableLabel: tableLabel(order.table),
    guests: order.guests,
    waiter: info?.waiter_name ?? null,
    currency: opts.currency,
    items: [...lines.values()],
    total: roundMoney(billed.reduce((acc, i) => acc + tableItemTotal(i), 0)),
  });
  await markTableBillRequested(orderId);
  return true;
}

/* ---------- Avisos del salón ---------- */

export interface TableAlerts {
  /** Llamados al mozo y pedidos de cuenta sin atender, por mesa. */
  calls: number;
  /** Mesas con pedidos del QR sin confirmar. */
  pendingOrders: number;
  /** Tickets de cocina marcados listos (para retirar). */
  readyFood: number;
  /** Detalle para banner / lista. */
  readyFoodItems: ReadyFoodAlert[];
}

let alerts: TableAlerts = { calls: 0, pendingOrders: 0, readyFood: 0, readyFoodItems: [] };
const listeners = new Set<() => void>();
let lastReadyIds = "";

export function getTableAlerts(): TableAlerts {
  return alerts;
}

export function subscribeTableAlerts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function refreshTableAlerts(): Promise<void> {
  window.dispatchEvent(new CustomEvent("walqo:tables-touched"));
  try {
    const [calls, orders, readyRaw] = await Promise.all([
      listOpenTableCalls(),
      listOpenTableOrders(),
      listReadyFoodAlerts().catch(() => [] as ReadyFoodAlert[]),
    ]);
    const ready = readyRaw.filter((r) => r.source !== "pos" && r.table_number != null);
    const next: TableAlerts = {
      calls: new Set(calls.map((c) => c.table_id)).size,
      pendingOrders: orders.filter((o) => o.pending_items > 0).length,
      readyFood: ready.length,
      readyFoodItems: ready,
    };
    const readyKey = ready.map((r) => r.ticket_id).join(",");
    const same =
      next.calls === alerts.calls &&
      next.pendingOrders === alerts.pendingOrders &&
      next.readyFood === alerts.readyFood &&
      readyKey === lastReadyIds;
    if (same) return;
    const prevReady = new Set(
      lastReadyIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const grewReady = ready.some((r) => !prevReady.has(String(r.ticket_id)));
    lastReadyIds = readyKey;
    alerts = next;
    if (grewReady) {
      try {
        const { kitchenAlertSoundAllowed } = await import("./kitchenTiming");
        // Aviso Listo en el salón: no usa el mute de la pantalla Cocina.
        if (kitchenAlertSoundAllowed({ ignoreMute: true })) playTableChime();
      } catch {
        /* sin audio */
      }
    }
  } catch {
    return;
  }
  for (const fn of listeners) fn();
}

let audio: AudioContext | null = null;

/** Dos tonos cortos, como el aviso de pedido nuevo de una barra. */
export function playTableChime(): void {
  playTonePair([880, 1318.5], 0.18);
}

/** Tres tonos: comanda nueva en la pantalla Cocina. */
export function playKitchenChime(): void {
  playTonePair([523.25, 659.25, 783.99], 0.14);
}

function playTonePair(frequencies: number[], step: number): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const start = audio.currentTime;
    frequencies.forEach((frequency, index) => {
      const ctx = audio as AudioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + index * step;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.5);
    });
  } catch {
    /* sin audio */
  }
}

const CALL_TEXT: Record<RemoteTableRequest["kind"], string> = {
  order: "mandó un pedido desde el QR",
  waiter: "llama al mozo",
  bill: "pide la cuenta",
};

const CALL_TEXT_AUTO: Record<RemoteTableRequest["kind"], string> = {
  order: "pidió desde el QR y ya fue a cocina",
  waiter: "llama al mozo",
  bill: "pide la cuenta",
};

/** Anota en el salón lo que llegó de los QR y devuelve los ids para dar por recibidos. */
export async function ingestTableRequests(reqs: RemoteTableRequest[]): Promise<string[]> {
  if (reqs.length === 0 || !(await tablesModuleOn())) return [];
  const auto = await isTablesQrAuto();
  const businessName = (await getSetting("business_name").catch(() => null))?.trim() || "El local";
  const done: string[] = [];
  const applied: RemoteTableRequest[] = [];
  let printed = 0;
  for (const r of reqs) {
    try {
      const res = await ingestRemoteTableRequest(
        r,
        async (id) => {
          const p = await getProduct(id);
          return p && p.active ? { price: p.price, name: p.name } : null;
        },
        { itemStatus: auto && r.kind === "order" ? "new" : "pending" },
      );
      done.push(r.id);
      if (!res.applied) continue;
      applied.push(r);
      if (auto && r.kind === "order" && res.orderId && !res.duplicate) {
        const kitchen = await sendTableOrderToKitchen(res.orderId);
        if (kitchen.items.length > 0) {
          if (printed > 0) await new Promise((resolve) => setTimeout(resolve, 450));
          const table = await findActiveTableByNumber(r.table_number);
          const label = table ? tableLabel(table) : `Mesa ${r.table_number}`;
          const groups =
            kitchen.stationGroups.length > 0
              ? await Promise.all(
                  kitchen.stationGroups.map(async (g) => ({
                    stationName: g.stationName,
                    items: await tableKitchenLines(g.items),
                  })),
                )
              : [{ stationName: "Cocina", items: await tableKitchenLines(kitchen.items) }];
          await printKitchenTicketsByStation({
            businessName,
            saleId: res.orderId,
            labelBase: `${label} · Ronda ${kitchen.round}`,
            groups,
            notes: "Pedido desde el QR (automático)",
          });
          printed += Math.max(1, groups.length);
        }
      }
    } catch (e) {
      console.error("table request", e);
    }
  }
  if (applied.length > 0) {
    playTableChime();
    const labels = auto ? CALL_TEXT_AUTO : CALL_TEXT;
    const byTable = new Map<number, Set<RemoteTableRequest["kind"]>>();
    for (const r of applied) {
      if (!byTable.has(r.table_number)) byTable.set(r.table_number, new Set());
      byTable.get(r.table_number)?.add(r.kind);
    }
    const lines = [...byTable].map(
      ([n, kinds]) => `La mesa ${n} ${[...kinds].map((k) => labels[k]).join(" y ")}.`,
    );
    showNotice({
      title: byTable.size > 1 ? `${byTable.size} mesas te llaman` : `Mesa ${[...byTable.keys()][0]}`,
      message: `${lines.slice(0, 4).join(" ")} Lo ves en «Mesas».`,
      variant: "info",
    });
    window.dispatchEvent(new CustomEvent("walqo:tables-changed"));
  }
  await refreshTableAlerts();
  return done;
}
