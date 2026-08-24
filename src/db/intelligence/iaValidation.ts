import type { ActionExplanation, BusinessInterpretation } from "./interpretationTypes";
import type { IaPayload } from "./iaPayload";

const MAX_TEXT_LEN = 2000;
const MAX_ITEMS = 8;

export interface AllowedNumber {
  value: number;
  /** Formas aceptables en texto natural. */
  forms: string[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function pushUnique(set: Set<string>, value: number): void {
  if (!Number.isFinite(value)) return;
  const abs = Math.abs(value);
  const variants = [
    value,
    abs,
    Math.round(value),
    Math.round(abs),
    Math.round(value * 10) / 10,
    Math.round(abs * 10) / 10,
  ];
  for (const v of variants) {
    set.add(String(v));
    set.add(String(v).replace(".", ","));
    if (Number.isInteger(v)) {
      set.add(v.toLocaleString("es-AR"));
    }
  }
  if (Math.abs(value) >= 0.05) {
    set.add(`${Math.round(abs)}%`);
    set.add(`${Math.round(abs * 10) / 10}%`.replace(".", ","));
    if (value < 0) {
      set.add(`-${Math.round(abs)}%`);
      set.add(`−${Math.round(abs)}%`);
    }
  }
}

function walkNumbers(value: unknown, out: Set<string>): void {
  if (typeof value === "number") {
    pushUnique(out, value);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkNumbers(item, out);
    return;
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    walkNumbers(v, out);
  }
}

export function buildAllowedNumberSet(payload: IaPayload): Set<string> {
  const allowed = new Set<string>(["0", "1", "2", "3", "4", "5", "6", "7", "14", "30", "60", "7"]);
  walkNumbers(payload, allowed);
  return allowed;
}

const NUMBER_PATTERN =
  /(?<![\w])([+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?|[+-]?\d+(?:[.,]\d+)?)\s*(%|u\.|unidades|días|día|d\.|productos|clientes|críticas?|alertas?)?/gi;

function normalizeNumericToken(raw: string): string[] {
  const cleaned = raw.trim().replace(/\s+/g, "");
  const noThousands = cleaned.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const num = Number.parseFloat(noThousands.replace(/[^\d.+/-]/g, ""));
  if (!Number.isFinite(num)) return [];
  return [String(num), String(Math.abs(num)), String(Math.round(num)), String(Math.round(Math.abs(num)))];
}

export function extractMentionedNumbers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const token = match[1] ?? "";
    found.push(...normalizeNumericToken(token));
    if (match[2] === "%") {
      for (const n of normalizeNumericToken(token)) {
        found.push(`${n}%`);
      }
    }
  }
  return found;
}

export function validateNumericalTexts(texts: string[], allowed: Set<string>): ValidationResult {
  const errors: string[] = [];
  for (const text of texts) {
    const mentioned = extractMentionedNumbers(text);
    for (const m of mentioned) {
      const bare = m.replace(/%$/, "");
      if (allowed.has(m) || allowed.has(bare)) continue;
      const asNum = Number.parseFloat(bare.replace(",", "."));
      if (Number.isFinite(asNum) && asNum <= 2 && !text.includes("%")) continue;
      errors.push(`número no permitido: ${m} en "${text.slice(0, 80)}…"`);
    }
  }
  return { ok: errors.length === 0, errors };
}

const EXACT_PROFIT_FORBIDDEN =
  /\b(ganancia exacta|utilidad exacta|margen exacto|ganancia real|utilidad real|ganó exactamente|utilidad fue de)\b/i;

export function validateEstimationLanguage(
  texts: string[],
  payload: IaPayload,
): ValidationResult {
  const needsEstimated =
    payload.profit_estimated?.period_30d?.is_estimated === true ||
    payload.scope_notes.coverageIsEstimated === true;

  if (!needsEstimated) return { ok: true, errors: [] };

  const errors: string[] = [];
  for (const text of texts) {
    if (EXACT_PROFIT_FORBIDDEN.test(text)) {
      errors.push(`lenguaje exacto prohibido: "${text.slice(0, 80)}…"`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateActionExplanations(
  explanations: ActionExplanation[],
  actionsCount: number,
): ValidationResult {
  const errors: string[] = [];
  const seen = new Set<number>();
  if (explanations.length > actionsCount) {
    errors.push("demasiadas explicaciones vs acciones");
  }
  for (const ex of explanations) {
    if (!Number.isInteger(ex.action_index) || ex.action_index < 0 || ex.action_index >= actionsCount) {
      errors.push(`action_index inválido: ${ex.action_index}`);
    }
    if (seen.has(ex.action_index)) errors.push(`action_index duplicado: ${ex.action_index}`);
    seen.add(ex.action_index);
    if (!ex.explanation?.trim()) errors.push(`explicación vacía en índice ${ex.action_index}`);
    if (ex.explanation.length > MAX_TEXT_LEN) errors.push(`explicación demasiado larga en ${ex.action_index}`);
  }
  return { ok: errors.length === 0, errors };
}

export function sanitizeInterpretation(raw: unknown, actionsCount: number): BusinessInterpretation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if ("priorities" in o) return null;
  const summary = String(o.summary ?? "").trim().slice(0, MAX_TEXT_LEN);
  if (!summary) return null;

  const insights = Array.isArray(o.insights)
    ? o.insights.map((x) => String(x).trim()).filter(Boolean).slice(0, MAX_ITEMS)
    : [];

  let action_explanations: ActionExplanation[] = [];
  if (Array.isArray(o.action_explanations)) {
    action_explanations = o.action_explanations
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return {
          action_index: Number(row.action_index),
          explanation: String(row.explanation ?? "").trim().slice(0, MAX_TEXT_LEN),
        };
      })
      .filter((x): x is ActionExplanation => x != null);
  }

  const caveats = Array.isArray(o.caveats)
    ? o.caveats.map((x) => String(x).trim()).filter(Boolean).slice(0, 4)
    : [];

  const idxCheck = validateActionExplanations(action_explanations, actionsCount);
  if (!idxCheck.ok) return null;

  return {
    summary,
    insights,
    action_explanations,
    caveats,
    engine: o.engine as BusinessInterpretation["engine"],
    model: o.model ? String(o.model) : undefined,
    generated_at: new Date().toISOString(),
  };
}

export function validateInterpretationAgainstPayload(
  interpretation: BusinessInterpretation,
  payload: IaPayload,
): ValidationResult {
  const texts = [
    interpretation.summary,
    ...interpretation.insights,
    ...interpretation.action_explanations.map((e) => e.explanation),
    ...interpretation.caveats,
  ];
  const allowed = buildAllowedNumberSet(payload);
  const num = validateNumericalTexts(texts, allowed);
  if (!num.ok) return num;
  const est = validateEstimationLanguage(texts, payload);
  if (!est.ok) return est;
  const idx = validateActionExplanations(
    interpretation.action_explanations,
    payload.actions_today.length,
  );
  return idx;
}

/** Nombres permitidos en texto (productos/clientes del payload). */
export function buildAllowedNames(payload: IaPayload): Set<string> {
  const names = new Set<string>();
  const add = (n?: string) => {
    const t = n?.trim();
    if (t) names.add(t.toLowerCase());
  };
  for (const p of payload.stock_highlights?.low_stock ?? []) add(p.name);
  for (const p of payload.stock_highlights?.low_coverage ?? []) add(p.name);
  for (const p of payload.stock_highlights?.slow_moving ?? []) add(p.name);
  for (const p of payload.stock_highlights?.top_movement ?? []) add(p.name);
  for (const c of payload.customers?.with_debt ?? []) add(c.name);
  for (const c of payload.customers?.near_credit_limit ?? []) add(c.name);
  for (const a of payload.alerts_summary.top) {
    add(a.title);
    add(a.message.split(":")[0]);
  }
  for (const a of payload.actions_today) add(a.title);
  return names;
}

export function validateEntityNames(texts: string[], payload: IaPayload): ValidationResult {
  const allowed = buildAllowedNames(payload);
  const errors: string[] = [];
  for (const text of texts) {
    for (const name of allowed) {
      if (name.length < 4) continue;
    }
    const lower = text.toLowerCase();
    for (const candidate of extractCandidateNames(lower)) {
      if (candidate.length < 4) continue;
      if (allowed.has(candidate)) continue;
      if (isGenericWord(candidate)) continue;
      if ([...allowed].some((a) => a.includes(candidate) || candidate.includes(a))) continue;
      errors.push(`nombre no permitido: "${candidate}"`);
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function extractCandidateNames(text: string): string[] {
  const matches = text.match(/[a-záéíóúñ0-9][a-záéíóúñ0-9\s-]{3,40}/gi) ?? [];
  return matches.map((m) => m.trim().toLowerCase());
}

function isGenericWord(word: string): boolean {
  return [
    "ventas",
    "stock",
    "cliente",
    "clientes",
    "producto",
    "productos",
    "negocio",
    "comercio",
    "período",
    "periodo",
    "reportes",
    "caja",
    "presupuesto",
    "inteligencia",
    "acción",
    "acciones",
  ].includes(word);
}
