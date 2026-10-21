import type { PortalEnv } from "./portal";

export type UsdCasa = "blue" | "oficial" | "tarjeta";

/** Cómo arma el comercio el dólar de sus precios en US$ (lo manda la PC con el catálogo). */
export interface MenuPortalUsd {
  mode: "auto" | "fijo";
  casa: UsdCasa;
  /** Dólar fijo, o el último que tenía la PC al subir. */
  rate: number;
  /** Pesos que se suman al dólar. */
  margin: number;
  updated_at?: string;
}

export interface UsdQuote {
  /** Dólar con el margen: el que se usa para los precios. */
  rate: number;
  updated_at: string | null;
}

const TTL_MS = 20 * 60_000;
const RETRY_MS = 3 * 60_000;
const memo = new Map<UsdCasa, { venta: number; at: string; checkedAt: number }>();
const failedAt = new Map<UsdCasa, number>();

function num(raw: unknown, max: number): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw * 100) / 100, max) : 0;
}

export function sanitizeUsd(raw: unknown): MenuPortalUsd | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const casa: UsdCasa = o.casa === "oficial" || o.casa === "tarjeta" ? o.casa : "blue";
  return {
    mode: o.mode === "fijo" ? "fijo" : "auto",
    casa,
    rate: num(o.rate, 1_000_000),
    margin: num(o.margin, 100_000),
    ...(typeof o.updated_at === "string" && o.updated_at.trim()
      ? { updated_at: o.updated_at.trim().slice(0, 40) }
      : {}),
  };
}

async function fetchVenta(casa: UsdCasa): Promise<number | null> {
  try {
    const res = await fetch(`https://dolarapi.com/v1/dolares/${casa}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { venta?: unknown };
    const v = Number(data.venta);
    return Number.isFinite(v) && v > 0 && v < 1_000_000 ? v : null;
  } catch {
    return null;
  }
}

/** Una consulta a dolarapi por casa cada 20 minutos, compartida por todos los comercios. */
async function casaQuote(env: PortalEnv, casa: UsdCasa): Promise<{ venta: number; at: string } | null> {
  const now = Date.now();
  const m = memo.get(casa);
  if (m && now - m.checkedAt < TTL_MS) return { venta: m.venta, at: m.at };

  let row: { venta: number; fetched_at: string; checked_at: string } | null = null;
  try {
    row = await env.DB.prepare(
      "SELECT venta, fetched_at, checked_at FROM menu_portal_usd_rates WHERE casa = ?1",
    )
      .bind(casa)
      .first();
  } catch {
    row = null;
  }
  const rowChecked = row ? Date.parse(row.checked_at) || 0 : 0;
  if (row && now - rowChecked < TTL_MS) {
    memo.set(casa, { venta: row.venta, at: row.fetched_at, checkedAt: rowChecked });
    return { venta: row.venta, at: row.fetched_at };
  }

  const lastFail = failedAt.get(casa) ?? 0;
  const venta = now - lastFail < RETRY_MS ? null : await fetchVenta(casa);
  const nowIso = new Date(now).toISOString();
  if (venta) {
    failedAt.delete(casa);
    memo.set(casa, { venta, at: nowIso, checkedAt: now });
    try {
      await env.DB.prepare(
        `INSERT INTO menu_portal_usd_rates (casa, venta, fetched_at, checked_at) VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(casa) DO UPDATE SET venta = excluded.venta, fetched_at = excluded.fetched_at,
           checked_at = excluded.checked_at`,
      )
        .bind(casa, venta, nowIso)
        .run();
    } catch {
      /* sin tabla: queda en memoria */
    }
    return { venta, at: nowIso };
  }

  failedAt.set(casa, now);
  if (!row) return null;
  const retryAt = now - TTL_MS + RETRY_MS;
  memo.set(casa, { venta: row.venta, at: row.fetched_at, checkedAt: retryAt });
  try {
    await env.DB.prepare("UPDATE menu_portal_usd_rates SET checked_at = ?1 WHERE casa = ?2")
      .bind(new Date(retryAt).toISOString(), casa)
      .run();
  } catch {
    /* ignorar */
  }
  return { venta: row.venta, at: row.fetched_at };
}

/**
 * Dólar del comercio: fijo, o el de internet (con la última cotización conocida si dolarapi no responde).
 * null = no hay cotización y quedan los precios que subió la PC.
 */
export async function resolveUsdQuote(env: PortalEnv, usd: MenuPortalUsd | undefined): Promise<UsdQuote | null> {
  if (!usd) return null;
  if (usd.mode === "fijo") {
    return usd.rate > 0 ? { rate: usd.rate + usd.margin, updated_at: usd.updated_at ?? null } : null;
  }
  const q = await casaQuote(env, usd.casa);
  return q ? { rate: q.venta + usd.margin, updated_at: q.at } : null;
}

/** Precio que se muestra y se cobra, y el de lista (solo si es mayor). Sin precio en US$ no cambia nada. */
export function storePrices(
  p: { price: number; price_usd?: number; list_price?: number; list_price_usd?: number },
  rate: number | null,
): { price: number; compare_at?: number } {
  const usd = p.price_usd && p.price_usd > 0 ? p.price_usd : 0;
  const live = usd > 0 && rate != null && rate > 0;
  const price = live ? Math.round(usd * (rate as number)) : p.price;
  const listRate = live ? (rate as number) : usd > 0 && p.price > 0 ? p.price / usd : 0;
  const list =
    usd > 0 && p.list_price_usd && listRate > 0
      ? Math.round(p.list_price_usd * listRate)
      : usd > 0
        ? 0
        : p.list_price ?? 0;
  return list > price ? { price, compare_at: list } : { price };
}
