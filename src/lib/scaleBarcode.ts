import { getSetting, setSetting } from "../db/settings";
import { findByScalePlu } from "../db/products";
import type { Product } from "../types";

export type ScaleBarcodeMode = "amount" | "weight";

export interface ScaleBarcodeConfig {
  /** Dos dígitos de inicio (pesables). Default Kretz/iTegra: 20 */
  prefix: string;
  /** amount = importe en etiqueta; weight = peso en kg */
  mode: ScaleBarcodeMode;
}

export interface ScaleBarcodeParse {
  plu: string;
  pluPadded: string;
  /** Importe en pesos o cantidad en kg, según mode */
  value: number;
  digits: string;
}

const SETTING_PREFIX = "scale_barcode_prefix";
const SETTING_MODE = "scale_barcode_mode";

export async function loadScaleBarcodeConfig(): Promise<ScaleBarcodeConfig> {
  const [prefix, mode] = await Promise.all([
    getSetting(SETTING_PREFIX),
    getSetting(SETTING_MODE),
  ]);
  return {
    prefix: (prefix?.trim() || "20").replace(/\D/g, "").slice(0, 2).padStart(2, "0"),
    mode: mode === "weight" ? "weight" : "amount",
  };
}

export async function saveScaleBarcodeConfig(cfg: ScaleBarcodeConfig): Promise<void> {
  await setSetting(SETTING_PREFIX, cfg.prefix.replace(/\D/g, "").slice(0, 2).padStart(2, "0"));
  await setSetting(SETTING_MODE, cfg.mode);
}

/** Decodifica EAN-13 tipo balanza formato 2-5-5 (inicio + PLU + valor). */
export function parseScaleBarcode(
  raw: string,
  config: ScaleBarcodeConfig,
): ScaleBarcodeParse | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 12) return null;

  const body = digits.length >= 13 ? digits.slice(0, 12) : digits.padStart(12, "0").slice(-12);
  const prefix = config.prefix.replace(/\D/g, "").slice(0, 2).padStart(2, "0");
  if (!body.startsWith(prefix)) return null;

  const pluPadded = body.slice(2, 7);
  const valueRaw = body.slice(7, 12);
  const valueNum = Number(valueRaw);
  if (!Number.isFinite(valueNum)) return null;

  const plu = pluPadded.replace(/^0+/, "") || "0";
  const value = config.mode === "weight" ? valueNum / 1000 : valueNum / 100;

  return { plu, pluPadded, value, digits: body };
}

export interface ScaleScanResult {
  product: Product;
  qty: number;
  lineTotal: number | null;
}

/** Intenta resolver un código de balanza a producto + cantidad/importe. */
export async function resolveScaleBarcodeScan(raw: string): Promise<ScaleScanResult | null> {
  const config = await loadScaleBarcodeConfig();
  const parsed = parseScaleBarcode(raw, config);
  if (!parsed) return null;

  const product = await findByScalePlu(parsed.plu, parsed.pluPadded);
  if (!product) return null;

  if (config.mode === "amount") {
    return { product, qty: 1, lineTotal: parsed.value };
  }
  return { product, qty: parsed.value, lineTotal: null };
}
