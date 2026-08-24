import type { IaPayloadLike } from "./types";

const MAX_TEXT = 2000;

export interface ActionExplanation {
  action_index: number;
  explanation: string;
}

export interface InterpretationResult {
  summary: string;
  insights: string[];
  action_explanations: ActionExplanation[];
  caveats: string[];
}

function pushNum(set: Set<string>, value: number): void {
  if (!Number.isFinite(value)) return;
  const abs = Math.abs(value);
  for (const v of [value, abs, Math.round(value), Math.round(abs)]) {
    set.add(String(v));
    set.add(String(v).replace(".", ","));
  }
  if (Math.abs(value) >= 0.05) {
    set.add(`${Math.round(abs)}%`);
    if (value < 0) set.add(`-${Math.round(abs)}%`);
  }
}

function walk(value: unknown, set: Set<string>): void {
  if (typeof value === "number") {
    pushNum(set, value);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, set);
    return;
  }
  for (const v of Object.values(value as Record<string, unknown>)) walk(v, set);
}

export function buildAllowedNumbers(payload: IaPayloadLike): Set<string> {
  const set = new Set<string>(["0", "1", "2", "3", "4", "5", "6", "7", "14", "30", "60"]);
  walk(payload, set);
  return set;
}

const NUM_RE =
  /(?<![\w])([+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?|[+-]?\d+(?:[.,]\d+)?)\s*(%|u\.|unidades|días|día|productos|clientes)?/gi;

function mentionedNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const raw = (m[1] ?? "").replace(/\./g, "").replace(",", ".");
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) {
      out.push(String(n), String(Math.abs(n)), String(Math.round(n)));
      if (m[2] === "%") out.push(`${Math.round(Math.abs(n))}%`);
    }
  }
  return out;
}

export function validateNumbers(texts: string[], allowed: Set<string>): string[] {
  const errors: string[] = [];
  for (const text of texts) {
    for (const n of mentionedNumbers(text)) {
      if (allowed.has(n) || allowed.has(n.replace(/%$/, ""))) continue;
      const bare = Number.parseFloat(n);
      if (Number.isFinite(bare) && bare <= 2 && !text.includes("%")) continue;
      errors.push(`número no permitido: ${n}`);
    }
  }
  return errors;
}

export function validateActionExplanations(
  rows: ActionExplanation[],
  actionCount: number,
): string[] {
  const errors: string[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (!Number.isInteger(row.action_index) || row.action_index < 0 || row.action_index >= actionCount) {
      errors.push(`action_index inválido: ${row.action_index}`);
    }
    if (seen.has(row.action_index)) errors.push(`action_index duplicado: ${row.action_index}`);
    seen.add(row.action_index);
    if (!row.explanation?.trim()) errors.push("explicación vacía");
    if (row.explanation.length > MAX_TEXT) errors.push("explicación larga");
  }
  if (rows.length > actionCount) errors.push("demasiadas explicaciones");
  return errors;
}

const EXACT_FORBIDDEN =
  /\b(ganancia exacta|utilidad exacta|margen exacto|ganancia real|utilidad real)\b/i;

export function validateEstimation(texts: string[], payload: IaPayloadLike): string[] {
  if (!payload.profit_estimated && !payload.scope_notes?.coverageIsEstimated) return [];
  const errors: string[] = [];
  for (const t of texts) {
    if (EXACT_FORBIDDEN.test(t)) errors.push("lenguaje exacto prohibido");
  }
  return errors;
}

export function parseInterpretation(raw: unknown, actionCount: number): InterpretationResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if ("priorities" in o) return null;
  const summary = String(o.summary ?? "").trim().slice(0, MAX_TEXT);
  if (!summary) return null;

  const insights = Array.isArray(o.insights)
    ? o.insights.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
    : [];

  let action_explanations: ActionExplanation[] = [];
  if (Array.isArray(o.action_explanations)) {
    action_explanations = o.action_explanations
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        return {
          action_index: Number(row.action_index),
          explanation: String(row.explanation ?? "").trim().slice(0, MAX_TEXT),
        };
      })
      .filter((x): x is ActionExplanation => x != null);
  } else if (Array.isArray(o.priorities)) {
    return null;
  }

  const caveats = Array.isArray(o.caveats)
    ? o.caveats.map((x) => String(x).trim()).filter(Boolean).slice(0, 4)
    : [];

  const idxErrors = validateActionExplanations(action_explanations, actionCount);
  if (idxErrors.length) return null;

  return { summary, insights, action_explanations, caveats };
}

export function validateInterpretationFull(
  interpretation: InterpretationResult,
  payload: IaPayloadLike,
): string[] {
  const texts = [
    interpretation.summary,
    ...interpretation.insights,
    ...interpretation.action_explanations.map((e) => e.explanation),
    ...interpretation.caveats,
  ];
  return [
    ...validateNumbers(texts, buildAllowedNumbers(payload)),
    ...validateEstimation(texts, payload),
    ...validateActionExplanations(interpretation.action_explanations, payload.actions_today.length),
  ];
}
