import { invoke } from "@tauri-apps/api/core";
import { getSetting } from "../db/settings";
import { getProduct } from "../db/products";
import {
  ingestRemoteTableRequest,
  listOpenTableCalls,
  listOpenTableOrders,
  type DiningTable,
  type RemoteTableRequest,
} from "../db/tables";
import { FREE_MAX_TABLES } from "../config/pricing";
import { showNotice } from "./notice";
import { MENU_PORTAL_PUBLIC_BASE } from "./menuPortalPush";

/** Mesas que se pueden usar: todas con WalQo Completo; en la prueba, las primeras del salón. */
export function usableTableIds(tables: DiningTable[], unlimited: boolean): Set<number> {
  return new Set((unlimited ? tables : tables.slice(0, FREE_MAX_TABLES)).map((t) => t.id));
}

export async function tablesModuleOn(): Promise<boolean> {
  const [flag, rubro] = await Promise.all([getSetting("tables_enabled"), getSetting("rubro")]);
  if (flag === "1") return true;
  if (flag === "0") return false;
  return rubro === "gastronomia";
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

/* ---------- Avisos del salón ---------- */

export interface TableAlerts {
  /** Llamados al mozo y pedidos de cuenta sin atender, por mesa. */
  calls: number;
  /** Mesas con pedidos del QR sin confirmar. */
  pendingOrders: number;
}

let alerts: TableAlerts = { calls: 0, pendingOrders: 0 };
const listeners = new Set<() => void>();

export function getTableAlerts(): TableAlerts {
  return alerts;
}

export function subscribeTableAlerts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function refreshTableAlerts(): Promise<void> {
  try {
    const [calls, orders] = await Promise.all([listOpenTableCalls(), listOpenTableOrders()]);
    const next = {
      calls: new Set(calls.map((c) => c.table_id)).size,
      pendingOrders: orders.filter((o) => o.pending_items > 0).length,
    };
    if (next.calls === alerts.calls && next.pendingOrders === alerts.pendingOrders) return;
    alerts = next;
  } catch {
    return;
  }
  for (const fn of listeners) fn();
}

let audio: AudioContext | null = null;

/** Dos tonos cortos, como el aviso de pedido nuevo de una barra. */
export function playTableChime(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const start = audio.currentTime;
    [880, 1318.5].forEach((frequency, index) => {
      const ctx = audio as AudioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = start + index * 0.18;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.55);
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

/** Anota en el salón lo que llegó de los QR y devuelve los ids para dar por recibidos. */
export async function ingestTableRequests(reqs: RemoteTableRequest[]): Promise<string[]> {
  if (reqs.length === 0 || !(await tablesModuleOn())) return [];
  const done: string[] = [];
  const applied: RemoteTableRequest[] = [];
  for (const r of reqs) {
    try {
      const res = await ingestRemoteTableRequest(r, async (id) => {
        const p = await getProduct(id);
        return p && p.active ? { price: p.price, name: p.name } : null;
      });
      done.push(r.id);
      if (res.applied) applied.push(r);
    } catch (e) {
      console.error("table request", e);
    }
  }
  if (applied.length > 0) {
    playTableChime();
    const byTable = new Map<number, Set<RemoteTableRequest["kind"]>>();
    for (const r of applied) {
      if (!byTable.has(r.table_number)) byTable.set(r.table_number, new Set());
      byTable.get(r.table_number)?.add(r.kind);
    }
    const lines = [...byTable].map(
      ([n, kinds]) => `La mesa ${n} ${[...kinds].map((k) => CALL_TEXT[k]).join(" y ")}.`,
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
