import type { BusinessInterpretation } from "../db/intelligence/interpretationTypes";

export const BI_IA_API = "https://gestion-bi-ia.walphur.workers.dev";

export class BiIaError extends Error {
  retry: boolean;
  constructor(message: string, retry = false) {
    super(message);
    this.name = "BiIaError";
    this.retry = retry;
  }
}

export async function checkBiIaHealth(): Promise<{ ok: boolean; openai: boolean; model: string }> {
  const res = await fetch(`${BI_IA_API}/health`, { method: "GET" });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    openai?: boolean;
    model?: string;
  };
  if (!res.ok || !data.ok) {
    throw new BiIaError("Servicio de interpretación no disponible.", true);
  }
  return {
    ok: true,
    openai: Boolean(data.openai),
    model: String(data.model ?? "unknown"),
  };
}

async function interpretOnce(payload: unknown): Promise<BusinessInterpretation> {
  const res = await fetch(`${BI_IA_API}/interpret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    summary?: string;
    insights?: string[];
    priorities?: string[];
    caveats?: string[];
    engine?: "openai" | "workers-ai";
    model?: string;
  };

  if (!res.ok) {
    throw new BiIaError(
      data.error || "No se pudo generar la interpretación.",
      res.status >= 500 || res.status === 502,
    );
  }

  const summary = String(data.summary ?? "").trim();
  if (!summary) {
    throw new BiIaError("La IA no devolvió un resumen.", true);
  }

  return {
    summary,
    insights: Array.isArray(data.insights) ? data.insights.map(String) : [],
    priorities: Array.isArray(data.priorities) ? data.priorities.map(String) : [],
    caveats: Array.isArray(data.caveats) ? data.caveats.map(String) : [],
    engine: data.engine,
    model: data.model,
    generated_at: new Date().toISOString(),
  };
}

/** Interpreta el payload pre-calculado (requiere internet). */
export async function interpretBusinessIntelligence(payload: unknown): Promise<BusinessInterpretation> {
  let lastError: BiIaError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await interpretOnce(payload);
    } catch (e) {
      lastError = e instanceof BiIaError ? e : new BiIaError(String(e));
      if (!lastError.retry || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError ?? new BiIaError("Error desconocido.");
}

const CACHE_KEY = "walqo-bi-interpretation";

export function loadCachedInterpretation(computedAt: string): BusinessInterpretation | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BusinessInterpretation & { computed_at?: string };
    if (parsed.computed_at !== computedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedInterpretation(computedAt: string, interpretation: BusinessInterpretation): void {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...interpretation, computed_at: computedAt }),
    );
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
