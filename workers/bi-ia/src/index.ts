import { runOpenAiText } from "./openai";
import {
  assertMachineMatch,
  hasBusinessIntelligence,
  verifyLicenseToken,
} from "./licenseAuth";
import { validatePayloadSchema } from "./payloadSchema";
import { checkRateLimit } from "./rateLimit";
import { parseInterpretation, validateInterpretationFull } from "./validateResponse";
import type { IaPayloadLike } from "./types";

export interface Env {
  AI: Ai;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  LICENSE_PUBLIC_KEY_HEX: string;
  ALLOWED_ORIGINS?: string;
}

const FALLBACK_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 12_000;

const SYSTEM_PROMPT = `Sos un asistente de interpretación para dueños de comercios en Argentina.

REGLAS OBLIGATORIAS:
- NO calcules métricas, porcentajes ni totales. Usá EXCLUSIVAMENTE los números del JSON provisto.
- NO inventes datos, productos, clientes ni cifras.
- Utilidad y margen son ESTIMADOS si profit_estimated.is_estimated es true — decí "utilidad estimada" / "margen estimado".
- Cobertura de stock es ESTIMADA — no recomiendes cantidades de compra.
- NO generes priorities[] ni reordenes acciones. Solo explicá actions_today usando action_explanations.
- Cada action_explanation debe usar action_index 0..N-1 según el orden de actions_today.
- Output JSON SIN markdown:
{"summary":"...","insights":["..."],"action_explanations":[{"action_index":0,"explanation":"..."}],"caveats":["..."]}
- summary: 2-3 oraciones.
- insights: 2-5 observaciones.
- action_explanations: una explicación por acción relevante (máx. actions_today.length).
- caveats: 1-3 limitaciones (LAN, estimaciones, caja local).`;

const DEFAULT_ORIGINS = [
  "https://walqo.pro",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "https://tauri.localhost",
  "http://tauri.localhost",
];

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const extra = env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const allowed = new Set([...DEFAULT_ORIGINS, ...extra]);
  const ok = !origin || allowed.has(origin);
  return {
    "access-control-allow-origin": ok ? origin ?? "*" : "null",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
  };
}

function jsonResponse(body: unknown, status: number, origin: string | null, env: Env): Response {
  const text = JSON.stringify(body);
  if (text.length > MAX_RESPONSE_BYTES) {
    return new Response(JSON.stringify({ error: "Respuesta demasiado grande." }), {
      status: 502,
      headers: { ...corsHeaders(origin, env), "content-type": "application/json; charset=utf-8" },
    });
  }
  return new Response(text, {
    status,
    headers: { ...corsHeaders(origin, env), "content-type": "application/json; charset=utf-8" },
  });
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("JSON inválido");
  }
}

async function runWorkersAiText(env: Env, user: string, correction?: string): Promise<string> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
  if (correction) messages.push({ role: "user", content: correction });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result = (await env.AI.run(FALLBACK_MODEL, {
      messages,
      max_tokens: 1800,
      temperature: 0.2,
    })) as { response?: string };
    const text = result.response?.trim() ?? "";
    if (!text) throw new Error("Workers AI vacío");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function runModel(env: Env, user: string, correction?: string): Promise<string> {
  if (env.OPENAI_API_KEY) {
    const prompt = correction ? `${user}\n\nCORRECCIÓN OBLIGATORIA: ${correction}` : user;
    return runOpenAiText(env.OPENAI_API_KEY, SYSTEM_PROMPT, prompt, env.OPENAI_MODEL || "gpt-4o-mini");
  }
  return runWorkersAiText(env, user, correction);
}

async function interpretOnce(
  env: Env,
  payload: IaPayloadLike,
  correction?: string,
): Promise<{ summary: string; insights: string[]; action_explanations: { action_index: number; explanation: string }[]; caveats: string[]; engine: "openai" | "workers-ai"; model: string }> {
  const user = JSON.stringify(payload);
  const rawText = await runModel(env, user, correction);
  const parsed = parseInterpretation(extractJsonObject(rawText), payload.actions_today.length);
  if (!parsed) throw new Error("Respuesta IA inválida");

  const errors = validateInterpretationFull(parsed, payload);
  if (errors.length) throw new Error(errors.join("; "));

  return {
    ...parsed,
    engine: env.OPENAI_API_KEY ? "openai" : "workers-ai",
    model: env.OPENAI_MODEL || (env.OPENAI_API_KEY ? "gpt-4o-mini" : FALLBACK_MODEL),
  };
}

function parseAuth(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse(
        {
          ok: true,
          service: "gestion-bi-ia",
          openai: Boolean(env.OPENAI_API_KEY),
          model: env.OPENAI_MODEL || (env.OPENAI_API_KEY ? "gpt-4o-mini" : FALLBACK_MODEL),
        },
        200,
        origin,
        env,
      );
    }

    if (request.method !== "POST" || (url.pathname !== "/" && url.pathname !== "/interpret")) {
      return jsonResponse({ error: "Not found" }, 404, origin, env);
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 52_000) {
      return jsonResponse({ error: "Request demasiado grande." }, 413, origin, env);
    }

    const token = parseAuth(request);
    if (!token) {
      return jsonResponse({ error: "No autorizado." }, 401, origin, env);
    }

    const license = await verifyLicenseToken(token, env.LICENSE_PUBLIC_KEY_HEX);
    if (!license) {
      return jsonResponse({ error: "Licencia inválida." }, 403, origin, env);
    }
    if (!hasBusinessIntelligence(license)) {
      return jsonResponse({ error: "Plan sin Inteligencia de Negocio." }, 403, origin, env);
    }

    let body: { payload?: unknown; machine_id?: string; show_profits?: boolean };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return jsonResponse({ error: "JSON inválido." }, 400, origin, env);
    }

    const machineId = String(body.machine_id ?? "").trim();
    if (!machineId || machineId.length < 8) {
      return jsonResponse({ error: "machine_id inválido." }, 400, origin, env);
    }
    if (!assertMachineMatch(license, machineId)) {
      return jsonResponse({ error: "machine_id no coincide con licencia." }, 403, origin, env);
    }

    const showProfits = body.show_profits === true;
    const schema = validatePayloadSchema(body.payload, showProfits);
    if (!schema.ok) {
      return jsonResponse({ error: "Payload inválido.", details: schema.errors }, 400, origin, env);
    }

    const rate = checkRateLimit(`${license.lid}:${machineId}`, license.plan);
    if (!rate.ok) {
      return jsonResponse(
        { error: "Límite diario de interpretaciones alcanzado.", retry_after_sec: rate.retryAfterSec },
        429,
        origin,
        env,
      );
    }

    const payload = schema.payload as IaPayloadLike;

    try {
      let result;
      try {
        result = await interpretOnce(env, payload);
      } catch (first) {
        const msg = first instanceof Error ? first.message : "Error";
        result = await interpretOnce(
          env,
          payload,
          `Corregí la respuesta. Errores: ${msg}. Usá SOLO números del payload. action_explanations con índices válidos.`,
        );
      }
      return jsonResponse({ ok: true, ...result }, 200, origin, env);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al interpretar.";
      return jsonResponse(
        {
          error: "La interpretación IA no pudo validarse. Los datos del negocio siguen disponibles normalmente.",
          detail: message.slice(0, 200),
        },
        422,
        origin,
        env,
      );
    }
  },
};

export { validatePayloadSchema, parseInterpretation, validateInterpretationFull, checkRateLimit, verifyLicenseToken, hasBusinessIntelligence };
