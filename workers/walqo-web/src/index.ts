import { decodeWire, encodeWire } from "../../../src/web/wire";
import { currentStorage } from "./context";
import { StoreDb, type CallResult } from "./store";

export { StoreDb };

// src/db/tx.ts abre la transacción con esto en lugar de BEGIN IMMEDIATE.
(globalThis as { __walqoHostTransaction?: unknown }).__walqoHostTransaction = <T>(
  fn: () => Promise<T>,
): Promise<T> => currentStorage().transaction(() => fn());

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(encodeWire(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}

/** Fase 1: un único comercio de prueba. La fase 2 lo cambia por la cuenta de WalQo. */
function storeIdFor(request: Request, env: Env): string | null {
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!env.WEB_DEV_TOKEN || token !== env.WEB_DEV_TOKEN) return null;
  return "demo";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(request.url);
    if (pathname === "/health") return json({ ok: true }, 200, cors);
    if (request.method !== "POST" || !pathname.startsWith("/v1/")) {
      return json({ ok: false, error: { name: "Error", message: "No encontrado." } }, 404, cors);
    }

    const storeId = storeIdFor(request, env);
    if (!storeId) {
      return json({ ok: false, error: { name: "AuthError", message: "Iniciá sesión de nuevo." } }, 401, cors);
    }
    let body: Record<string, unknown> = {};
    try {
      body = decodeWire<Record<string, unknown>>(await request.text());
    } catch {
      /* cuerpo vacío o inválido */
    }
    const store = env.STORE.get(env.STORE.idFromName(storeId));

    let result: CallResult;
    if (pathname === "/v1/rpc") {
      result = await store.rpc(String(body.m ?? ""), String(body.f ?? ""), (body.a as unknown[]) ?? []);
    } else if (pathname === "/v1/sql") {
      const kind = body.kind === "select" ? "select" : "execute";
      result = await store.query(kind, String(body.sql ?? ""), (body.params as unknown[]) ?? []);
    } else if (pathname === "/v1/native") {
      result = await store.native(String(body.cmd ?? ""), (body.args as Record<string, unknown>) ?? {});
    } else {
      return json({ ok: false, error: { name: "Error", message: "No encontrado." } }, 404, cors);
    }
    return json(result, 200, cors);
  },
} satisfies ExportedHandler<Env>;
