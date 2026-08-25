import { invoke } from "@tauri-apps/api/core";
import type { BusinessInterpretation } from "../db/intelligence/interpretationTypes";
import type { IaPayload } from "../db/intelligence/iaPayload";
import { hashIaPayload } from "../db/intelligence/iaPayloadHash";
import {
  sanitizeInterpretation,
  validateInterpretationAgainstPayload,
} from "../db/intelligence/iaValidation";
import { validateIaPayloadSchema } from "../db/intelligence/iaPayloadSchema";

export const BI_IA_API = "https://gestion-bi-ia.walphur.workers.dev";

export interface BiAuthCredentials {
  token: string;
  machine_id: string;
  show_profits: boolean;
}

export class BiIaError extends Error {
  retry: boolean;
  userMessage: string;
  constructor(message: string, userMessage: string, retry = false) {
    super(message);
    this.name = "BiIaError";
    this.userMessage = userMessage;
    this.retry = retry;
  }
}

const VALIDATION_USER_MESSAGE =
  "La interpretación IA no pudo validarse. Los datos del negocio siguen disponibles normalmente.";

export async function getBiAuth(): Promise<BiAuthCredentials> {
  try {
    return await invoke<BiAuthCredentials>("license_get_bi_auth");
  } catch (e) {
    const raw =
      typeof e === "string"
        ? e
        : e instanceof Error
          ? e.message
          : String(e ?? "");
    const msg = raw.trim()
      ? raw
      : "No se pudo obtener autorización para Interpretación IA.";
    throw new BiIaError(raw || "auth", msg, false);
  }
}

async function interpretOnce(
  payload: IaPayload,
  auth: BiAuthCredentials,
): Promise<BusinessInterpretation> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28_000);
  try {
    const res = await fetch(`${BI_IA_API}/interpret`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        payload,
        machine_id: auth.machine_id,
        show_profits: auth.show_profits,
      }),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
      summary?: string;
      insights?: string[];
      action_explanations?: { action_index: number; explanation: string }[];
      caveats?: string[];
      engine?: BusinessInterpretation["engine"];
      model?: string;
    };

    if (!res.ok) {
      if (res.status === 422) {
        throw new BiIaError(data.detail ?? data.error ?? "validation", VALIDATION_USER_MESSAGE, true);
      }
      if (res.status === 401 || res.status === 403) {
        throw new BiIaError(data.error ?? "auth", data.error ?? "No autorizado para interpretación IA.");
      }
      throw new BiIaError(
        data.error ?? "error",
        data.error ?? "No se pudo generar la interpretación.",
        res.status >= 500 || res.status === 429,
      );
    }

    const parsed = sanitizeInterpretation(data, payload.actions_today.length);
    if (!parsed) {
      throw new BiIaError("sanitize", VALIDATION_USER_MESSAGE, true);
    }

    const check = validateInterpretationAgainstPayload(parsed, payload);
    if (!check.ok) {
      throw new BiIaError(check.errors.join("; "), VALIDATION_USER_MESSAGE, true);
    }

    return {
      ...parsed,
      engine: data.engine,
      model: data.model,
      generated_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Interpreta el payload pre-calculado (requiere internet y licencia válida). */
export async function interpretBusinessIntelligence(payload: IaPayload): Promise<BusinessInterpretation> {
  const schema = validateIaPayloadSchema(payload, payload.meta?.show_profits === true);
  if (!schema.ok || !schema.payload) {
    throw new BiIaError(schema.errors.join("; "), "Payload de inteligencia inválido.");
  }

  const auth = await getBiAuth();
  const safePayload = schema.payload as IaPayload;
  if (!auth.show_profits) {
    delete safePayload.profit_estimated;
    safePayload.meta = { payload_version: 1, show_profits: false };
  }

  let lastError: BiIaError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await interpretOnce(safePayload, auth);
    } catch (e) {
      lastError = e instanceof BiIaError ? e : new BiIaError(String(e), VALIDATION_USER_MESSAGE);
      if (!lastError.retry || attempt === 1) break;
      await new Promise((r) => setTimeout(r, 900));
    }
  }
  throw lastError ?? new BiIaError("unknown", VALIDATION_USER_MESSAGE);
}

const CACHE_KEY = "walqo-bi-interpretation-v2";

export interface CachedInterpretationV2 {
  payload_hash: string;
  computed_at: string;
  interpretation: BusinessInterpretation;
}

export async function loadCachedInterpretation(
  payload: IaPayload,
): Promise<BusinessInterpretation | null> {
  try {
    const hash = await hashIaPayload(payload);
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedInterpretationV2;
    if (parsed.payload_hash !== hash) return null;
    if (parsed.computed_at !== payload.computed_at) return null;
    return parsed.interpretation;
  } catch {
    return null;
  }
}

export async function saveCachedInterpretation(
  payload: IaPayload,
  interpretation: BusinessInterpretation,
): Promise<void> {
  try {
    const payload_hash = await hashIaPayload(payload);
    const entry: CachedInterpretationV2 = {
      payload_hash,
      computed_at: payload.computed_at,
      interpretation,
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* quota */
  }
}

export function clearCachedInterpretation(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
