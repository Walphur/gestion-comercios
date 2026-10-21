import { getAllSettings, setSetting } from "../db/settings";
import { getDb } from "../db/index";

export type UsdRateCasa = "blue" | "oficial" | "tarjeta";

export const USD_CASA_LABELS: Record<UsdRateCasa, string> = {
  blue: "Blue",
  oficial: "Oficial",
  tarjeta: "Tarjeta",
};

export interface UsdRate {
  rate: number;
  updatedAt: string | null;
  source: "manual" | UsdRateCasa | null;
  casa: UsdRateCasa;
}

function parseCasa(v: string | undefined): UsdRateCasa {
  return v === "oficial" || v === "tarjeta" ? v : "blue";
}

export async function getUsdRate(): Promise<UsdRate> {
  const s = await getAllSettings();
  const rate = Number(s.usd_rate ?? 0);
  return {
    rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
    updatedAt: s.usd_rate_updated_at || null,
    source: (s.usd_rate_source as UsdRate["source"]) || null,
    casa: parseCasa(s.usd_rate_casa),
  };
}

export function usdToArs(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

/** Guarda la cotización y actualiza el precio en pesos de los productos en dólares. */
export async function saveUsdRate(rate: number, source: UsdRate["source"]): Promise<number> {
  if (!(rate > 0)) throw new Error("Cargá una cotización mayor a cero.");
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  await setSetting("usd_rate", String(rate));
  await setSetting("usd_rate_updated_at", stamp);
  await setSetting("usd_rate_source", source ?? "manual");
  const db = await getDb();
  const res = await db.execute(
    `UPDATE products SET price = ROUND(price_usd * $1, 0), updated_at = datetime('now','localtime')
     WHERE active = 1 AND price_usd > 0 AND ABS(price - ROUND(price_usd * $1, 0)) >= 0.5`,
    [rate],
  );
  return res.rowsAffected ?? 0;
}

export async function setUsdRateCasa(casa: UsdRateCasa): Promise<void> {
  await setSetting("usd_rate_casa", casa);
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
