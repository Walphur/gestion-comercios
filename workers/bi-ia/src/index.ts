import { runOpenAiText } from "./openai";

export interface Env {
  AI: Ai;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const SYSTEM_PROMPT = `Sos un asistente de interpretación para dueños de comercios en Argentina.

REGLAS OBLIGATORIAS:
- NO calcules métricas, porcentajes ni totales. Usá EXCLUSIVAMENTE los números del JSON provisto.
- NO inventes datos, productos, clientes ni cifras que no estén en el payload.
- Los márgenes y utilidades son ESTIMADOS (costo actual del catálogo, no histórico por venta).
- La cobertura de stock es ESTIMADA — no recomiendes cantidades de compra.
- Si scope_notes.cashIsLocalOnly es true, la caja es solo de esta PC.
- Si hay sync LAN activo o conflictos, mencionalo como limitación.
- Respondé en español rioplatense, directo y orientado a decisiones.
- Las priorities deben alinearse con actions_today del payload (no contradigas el motor de reglas).
- Output: JSON válido SIN markdown, con esta forma exacta:
{"summary":"...","insights":["..."],"priorities":["..."],"caveats":["..."]}
- summary: 2-3 oraciones sobre el estado general.
- insights: 2-5 observaciones (strings).
- priorities: 2-5 prioridades accionables (strings).
- caveats: 1-3 advertencias sobre limitaciones de los datos (strings).`;

const FALLBACK_MODEL = "@cf/meta/llama-3.1-8b-instruct";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
  });
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("La IA no devolvió JSON válido.");
  }
}

function validateInterpretation(raw: unknown): {
  summary: string;
  insights: string[];
  priorities: string[];
  caveats: string[];
} {
  if (!raw || typeof raw !== "object") throw new Error("Respuesta IA inválida.");
  const o = raw as Record<string, unknown>;
  const summary = String(o.summary ?? "").trim();
  const insights = Array.isArray(o.insights)
    ? o.insights.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
    : [];
  const priorities = Array.isArray(o.priorities)
    ? o.priorities.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
    : [];
  const caveats = Array.isArray(o.caveats)
    ? o.caveats.map((x) => String(x).trim()).filter(Boolean).slice(0, 4)
    : [];
  if (!summary) throw new Error("La IA no generó un resumen.");
  return { summary, insights, priorities, caveats };
}

async function runWorkersAiText(env: Env, user: string): Promise<string> {
  const result = (await env.AI.run(FALLBACK_MODEL, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    max_tokens: 2048,
    temperature: 0.2,
  })) as { response?: string };

  const text = result.response?.trim() ?? "";
  if (!text) throw new Error("Workers AI devolvió respuesta vacía.");
  return text;
}

async function interpretPayload(env: Env, payload: unknown): Promise<{
  summary: string;
  insights: string[];
  priorities: string[];
  caveats: string[];
  engine: "openai" | "workers-ai";
  model: string;
}> {
  const user = JSON.stringify(payload);
  let rawText: string;
  let engine: "openai" | "workers-ai";
  let model: string;

  if (env.OPENAI_API_KEY) {
    model = env.OPENAI_MODEL || "gpt-4o-mini";
    rawText = await runOpenAiText(env.OPENAI_API_KEY, SYSTEM_PROMPT, user, model);
    engine = "openai";
  } else {
    model = FALLBACK_MODEL;
    rawText = await runWorkersAiText(env, user);
    engine = "workers-ai";
  }

  const parsed = validateInterpretation(extractJsonObject(rawText));
  return { ...parsed, engine, model };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse({
        ok: true,
        service: "gestion-bi-ia",
        openai: Boolean(env.OPENAI_API_KEY),
        model: env.OPENAI_MODEL || (env.OPENAI_API_KEY ? "gpt-4o-mini" : FALLBACK_MODEL),
      });
    }

    if (request.method === "POST" && (url.pathname === "/" || url.pathname === "/interpret")) {
      let body: { payload?: unknown };
      try {
        body = (await request.json()) as { payload?: unknown };
      } catch {
        return jsonResponse({ error: "JSON inválido." }, 400);
      }
      if (!body.payload || typeof body.payload !== "object") {
        return jsonResponse({ error: "Falta payload." }, 400);
      }

      try {
        const result = await interpretPayload(env, body.payload);
        return jsonResponse({ ok: true, ...result });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Error al interpretar.";
        return jsonResponse({ error: message }, 502);
      }
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
