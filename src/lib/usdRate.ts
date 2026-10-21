import { getAllSettings, setSetting } from "../db/settings";
import { getDb } from "../db/index";

export type UsdRateCasa = "blue" | "oficial" | "tarjeta";
export type UsdRateMode = "auto" | "fijo";

export const USD_RATE_EVENT = "walqo:usd-rate";

export const USD_CASA_LABELS: Record<UsdRateCasa, string> = {
  blue: "Blue",
  oficial: "Oficial",
  tarjeta: "Tarjeta",
};

export interface UsdRate {
  /** Dólar de internet o el fijo que cargó el comercio, sin el margen. */
  rate: number;
  /** Pesos que se suman al dólar. */
  margin: number;
  /** rate + margin: el que pasa los precios a pesos. 0 = sin cotización. */
  effective: number;
  mode: UsdRateMode;
  updatedAt: string | null;
  source: "manual" | UsdRateCasa | null;
  casa: UsdRateCasa;
}

function parseCasa(v: string | undefined): UsdRateCasa {
  return v === "oficial" || v === "tarjeta" ? v : "blue";
}

function positive(v: string | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function getUsdRate(): Promise<UsdRate> {
  const s = await getAllSettings();
  const rate = positive(s.usd_rate);
  const margin = positive(s.usd_rate_margin);
  return {
    rate,
    margin,
    effective: rate > 0 ? rate + margin : 0,
    mode: s.usd_rate_mode === "fijo" ? "fijo" : "auto",
    updatedAt: s.usd_rate_updated_at || null,
    source: (s.usd_rate_source as UsdRate["source"]) || null,
    casa: parseCasa(s.usd_rate_casa),
  };
}

export function usdToArs(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

async function repriceUsdProducts(effective: number): Promise<number> {
  if (!(effective > 0)) return 0;
  const db = await getDb();
  const res = await db.execute(
    `UPDATE products SET price = ROUND(price_usd * $1, 0), updated_at = datetime('now','localtime')
     WHERE active = 1 AND price_usd > 0 AND ABS(price - ROUND(price_usd * $1, 0)) >= 0.5`,
    [effective],
  );
  return res.rowsAffected ?? 0;
}

/** Guarda la cotización y actualiza el precio en pesos de los productos en dólares (con el margen). */
export async function saveUsdRate(rate: number, source: UsdRate["source"]): Promise<number> {
  if (!(rate > 0)) throw new Error("Cargá una cotización mayor a cero.");
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  await setSetting("usd_rate", String(rate));
  await setSetting("usd_rate_updated_at", stamp);
  await setSetting("usd_rate_source", source ?? "manual");
  const { margin } = await getUsdRate();
  return repriceUsdProducts(rate + margin);
}

/** Automático o fijo, la casa y el margen. Devuelve cuántos precios en pesos cambiaron. */
export async function saveUsdConfig(cfg: { mode: UsdRateMode; casa: UsdRateCasa; margin: number }): Promise<number> {
  const margin = Number.isFinite(cfg.margin) && cfg.margin > 0 ? Math.round(cfg.margin * 100) / 100 : 0;
  await setSetting("usd_rate_mode", cfg.mode);
  await setSetting("usd_rate_casa", cfg.casa);
  await setSetting("usd_rate_margin", String(margin));
  const { effective } = await getUsdRate();
  return repriceUsdProducts(effective);
}

/** Cotización de venta desde dolarapi.com. Sin internet, tira error y queda la última guardada. */
export async function fetchUsdRate(casa: UsdRateCasa): Promise<number> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://dolarapi.com/v1/dolares/${casa}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { venta?: number };
    const venta = Number(data.venta);
    if (!(venta > 0)) throw new Error("Respuesta sin cotización");
    return venta;
  } catch {
    throw new Error("No se pudo traer la cotización: sin conexión o el servicio no respondió. Sigue la última guardada; podés cargarla a mano.");
  } finally {
    window.clearTimeout(t);
  }
}
