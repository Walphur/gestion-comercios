import type { IaPayload } from "./iaPayload";

const MAX_BODY_BYTES = 48_000;
const MAX_STRING = 500;
const MAX_ARRAY = 12;
const MAX_ACTIONS = 10;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function readString(v: unknown, max = MAX_STRING): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

export interface PayloadValidationResult {
  ok: boolean;
  errors: string[];
  payload?: IaPayload;
}

export function validateIaPayloadSchema(raw: unknown, showProfits: boolean): PayloadValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ["payload debe ser objeto"] };

  const bodySize = JSON.stringify(raw).length;
  if (bodySize > MAX_BODY_BYTES) errors.push("payload demasiado grande");

  const computed_at = readString(raw.computed_at, 40);
  const currency = readString(raw.currency, 8);
  if (!computed_at) errors.push("computed_at inválido");
  if (!currency) errors.push("currency inválido");

  if (!isPlainObject(raw.scope_notes)) errors.push("scope_notes inválido");
  if (!isPlainObject(raw.freshness)) errors.push("freshness inválido");
  if (!isPlainObject(raw.sales)) errors.push("sales inválido");
  if (!isPlainObject(raw.inventory)) errors.push("inventory inválido");
  if (!isPlainObject(raw.alerts_summary)) errors.push("alerts_summary inválido");
  if (!Array.isArray(raw.actions_today)) errors.push("actions_today debe ser array");

  if (errors.length) return { ok: false, errors };

  if ((raw.actions_today as unknown[]).length > MAX_ACTIONS) {
    errors.push("demasiadas acciones");
  }

  if (showProfits === false && raw.profit_estimated != null) {
    errors.push("profit_estimated no permitido sin view_profits");
  }

  const allowedKeys = new Set([
    "computed_at",
    "currency",
    "scope_notes",
    "freshness",
    "sales",
    "profit_estimated",
    "inventory",
    "stock_highlights",
    "customers",
    "quotes",
    "cash_local",
    "alerts_summary",
    "actions_today",
    "meta",
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) errors.push(`campo no permitido: ${key}`);
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    payload: raw as unknown as IaPayload,
  };
}

export const IA_PAYLOAD_LIMITS = {
  MAX_BODY_BYTES,
  MAX_STRING,
  MAX_ARRAY,
  MAX_ACTIONS,
};
