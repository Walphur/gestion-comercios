const MAX_BYTES = 48_000;
const MAX_ACTIONS = 10;

export function validatePayloadSchema(
  raw: unknown,
  showProfits: boolean,
): { ok: true; payload: Record<string, unknown> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["payload inválido"] };
  }
  const body = JSON.stringify(raw);
  if (body.length > MAX_BYTES) errors.push("payload demasiado grande");

  const obj = raw as Record<string, unknown>;
  const required = [
    "computed_at",
    "currency",
    "scope_notes",
    "freshness",
    "sales",
    "inventory",
    "alerts_summary",
    "actions_today",
    "meta",
  ];
  for (const key of required) {
    if (!(key in obj)) errors.push(`falta ${key}`);
  }

  const allowed = new Set([
    ...required,
    "profit_estimated",
    "stock_highlights",
    "customers",
    "quotes",
    "cash_local",
  ]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) errors.push(`campo no permitido: ${key}`);
  }

  if (!Array.isArray(obj.actions_today) || obj.actions_today.length > MAX_ACTIONS) {
    errors.push("actions_today inválido");
  }

  const meta = obj.meta;
  if (!meta || typeof meta !== "object") errors.push("meta inválido");
  else if ((meta as Record<string, unknown>).payload_version !== 1) errors.push("payload_version");

  if (!showProfits && obj.profit_estimated != null) {
    errors.push("profit_estimated no autorizado");
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, payload: obj };
}

export { MAX_BYTES };
