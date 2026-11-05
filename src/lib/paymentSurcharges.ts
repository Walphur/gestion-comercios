import { getSetting, setSetting } from "../db/settings";
import {
  adjustDisplayToInternalDiscount,
  clampAdjustPct,
  exactDiscountPctFromFinalPrice,
  roundMoney,
} from "./discount";

export const PAYMENT_SURCHARGE_SETTING = "payment_surcharge_pct";

/** Medios configurables (efectivo/fiado siempre 0). */
export const SURCHARGE_METHODS = [
  "débito",
  "crédito",
  "transferencia",
  "mercadopago",
  "payway",
  "qr",
] as const;

export type SurchargeMethod = (typeof SURCHARGE_METHODS)[number];

export type PaymentSurchargeMap = Partial<Record<string, number>>;

export const SURCHARGE_METHOD_LABELS: Record<string, string> = {
  débito: "Débito",
  crédito: "Crédito",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
  payway: "Payway QR",
  qr: "QR / otro",
};

/** Cuotas que se ofrecen con crédito. El medio guardado sigue siendo «crédito». */
export const CREDIT_INSTALLMENTS = [1, 3, 6] as const;

export const CREDIT_METHOD = "crédito";

/** Claves del setting que edita Admin: «crédito» es 1 pago; 3 y 6 cuotas van aparte. */
export const SURCHARGE_FIELDS: { key: string; label: string }[] = [
  { key: "débito", label: "Débito" },
  { key: "crédito", label: "Crédito 1 pago" },
  { key: "crédito_3", label: "Crédito 3 cuotas" },
  { key: "crédito_6", label: "Crédito 6 cuotas" },
  { key: "transferencia", label: "Transferencia" },
  { key: "mercadopago", label: "Mercado Pago" },
  { key: "payway", label: "Payway QR" },
  { key: "qr", label: "QR / otro" },
];

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

/** Cuotas a guardar en la venta: 1, 3 o 6 con crédito; null con cualquier otro medio. */
export function normalizeInstallments(
  method: string,
  installments: number | null | undefined,
): number | null {
  if (method !== CREDIT_METHOD) return null;
  return installments === 3 || installments === 6 ? installments : 1;
}

function surchargeKey(method: string, installments?: number | null): string {
  const n = normalizeInstallments(method, installments);
  return n != null && n > 1 ? `${CREDIT_METHOD}_${n}` : method;
}

/** Recargo configurado (% UI, positivo = más caro). */
export function surchargePctForMethod(
  map: PaymentSurchargeMap,
  method: string,
  installments?: number | null,
): number {
  if (method === "efectivo" || method === "fiado") return 0;
  return map[surchargeKey(method, installments)] ?? 0;
}

/** Valor interno de discount_pct (negativo = recargo) para un medio. */
export function internalDiscountForPaymentSurcharge(
  map: PaymentSurchargeMap,
  method: string,
  installments?: number | null,
): number {
  return adjustDisplayToInternalDiscount(surchargePctForMethod(map, method, installments));
}

/**
 * Suma el recargo al total de un documento ya armado (orden, presupuesto) y devuelve el
 * discount_pct de la venta. Sin descuento previo queda igual que en el POS (−recargo).
 */
export function applyPaymentSurcharge(
  subtotal: number,
  discountPct: number,
  total: number,
  surchargePct: number,
): { discount_pct: number; total: number } {
  if (surchargePct <= 0) return { discount_pct: discountPct, total };
  if (Math.abs(discountPct) < 1e-9) {
    const internal = adjustDisplayToInternalDiscount(surchargePct);
    return { discount_pct: internal, total: roundMoney(subtotal * (1 - internal / 100)) };
  }
  const next = roundMoney(total * (1 + surchargePct / 100));
  return { discount_pct: exactDiscountPctFromFinalPrice(subtotal, next), total: next };
}
