import { getSetting, setSetting } from "../db/settings";
import { adjustDisplayToInternalDiscount, clampAdjustPct } from "./discount";

export const PAYMENT_SURCHARGE_SETTING = "payment_surcharge_pct";

/** Medios configurables (efectivo/fiado siempre 0). */
export const SURCHARGE_METHODS = [
  "débito",
  "crédito",
  "transferencia",
  "mercadopago",
  "qr",
] as const;

export type SurchargeMethod = (typeof SURCHARGE_METHODS)[number];

export type PaymentSurchargeMap = Partial<Record<string, number>>;

export const SURCHARGE_METHOD_LABELS: Record<string, string> = {
  débito: "Débito",
  crédito: "Crédito",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
  qr: "QR / otro",
};

export function parsePaymentSurcharges(raw: string | null | undefined): PaymentSurchargeMap {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: PaymentSurchargeMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
      out[k] = clampAdjustPct(n);
    }
    return out;
  } catch {
    return {};
  }
}

export async function loadPaymentSurcharges(): Promise<PaymentSurchargeMap> {
  return parsePaymentSurcharges(await getSetting(PAYMENT_SURCHARGE_SETTING));
}

export async function savePaymentSurcharges(map: PaymentSurchargeMap): Promise<void> {
  const clean: PaymentSurchargeMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (v != null && v > 0) clean[k] = clampAdjustPct(v);
  }
  await setSetting(PAYMENT_SURCHARGE_SETTING, JSON.stringify(clean));
}

/** Recargo configurado (% UI, positivo = más caro). */
export function surchargePctForMethod(map: PaymentSurchargeMap, method: string): number {
  if (method === "efectivo" || method === "fiado") return 0;
  return map[method] ?? 0;
}

/** Valor interno de discount_pct (negativo = recargo) para un medio. */
export function internalDiscountForPaymentSurcharge(
  map: PaymentSurchargeMap,
  method: string,
): number {
  return adjustDisplayToInternalDiscount(surchargePctForMethod(map, method));
}
