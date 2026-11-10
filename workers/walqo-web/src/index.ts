import "./argentinaTime";
import { decodeWire, encodeWire } from "../../../src/web/wire";
import { currentStorage } from "./context";
import { fetchWebAccount, LicenseApiError, licenseFetch } from "./licenseApi";
import { readSession, signSession } from "./session";
import { StoreDb, type CallResult } from "./store";

export { StoreDb };

// src/db/tx.ts abre la transacción con esto en lugar de BEGIN IMMEDIATE.
(globalThis as { __walqoHostTransaction?: unknown }).__walqoHostTransaction = <T>(
  fn: () => Promise<T>,
): Promise<T> => currentStorage().transaction(() => fn());

/** license-api pide un id de equipo en registro y verificación: la web usa uno fijo. */
const WEB_MACHINE_ID = "walqo-web-browser";

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-WalQo-Staff",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(encodeWire(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...cors,
    },
  });
}

function failure(name: string, message: string): CallResult {
  return { ok: false, error: { name, message } };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function storeFor(env: Env, accountId: string) {
  return env.STORE.get(env.STORE.idFromName(`acc:${accountId}`));
}

/** Abre (o crea) la base de la cuenta, le deja su licencia y devuelve la sesión. */
async function openSession(env: Env, email: string, password: string | null): Promise<CallResult> {
  const { account, license } = await fetchWebAccount(env, { email, password });
  const attached = (await storeFor(env, account.id).attach(account, license)) as CallResult;
  if (!attached.ok) return attached;
  const epoch = Number(attached.value) || 0;
  const token = await signSession(env, { account: account.id, email: account.email, epoch });
  return {
    ok: true,
    value: {
      ok: true,
      token,
      email: account.email,
      name: account.name,
      business_name: account.business_name ?? undefined,
      rubro: account.rubro ?? undefined,
      license_key: license.key,
    },
  };
}

/** Cuenta de WalQo (misma que en la PC): /v1/session/*, sin sesión previa. */
async function sessionRoute(env: Env, action: string, body: Record<string, unknown>): Promise<CallResult> {
  switch (action) {
    case "login":
      return openSession(env, str(body.email), str(body.password));
    case "register":
      return { ok: true, value: await licenseFetch(env, "/v1/auth/register", { ...body, machine_id: WEB_MACHINE_ID }) };
    case "verify": {
      const email = str(body.email);
      await licenseFetch(env, "/v1/auth/verify", { email, code: str(body.code), machine_id: WEB_MACHINE_ID });
      return openSession(env, email, null);
    }
    case "resend":
      return { ok: true, value: await licenseFetch(env, "/v1/auth/resend", { email: str(body.email) }) };
    case "forgot":
      return { ok: true, value: await licenseFetch(env, "/v1/auth/forgot", { email: str(body.email) }) };
    case "reset":
      return {
        ok: true,
        value: await licenseFetch(env, "/v1/auth/reset", {
          email: str(body.email),
          code: str(body.code),
          password: str(body.password),
        }),
      };
    default:
      return failure("Error", "No encontrado.");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(request.url);
    if (pathname === "/health") return json({ ok: true }, 200, cors);
    if (request.method !== "POST" || !pathname.startsWith("/v1/")) {
      return json(failure("Error", "No encontrado."), 404, cors);
    }

    let body: Record<string, unknown> = {};
    try {
      body = decodeWire<Record<string, unknown>>(await request.text());
    } catch {
      /* cuerpo vacío o inválido */
    }

    if (pathname.startsWith("/v1/session/")) {
      const ip = request.headers.get("CF-Connecting-IP") ?? "local";
      const email = str(body.email).trim().toLowerCase();
      const [byIp, byEmail] = await Promise.all([
        env.LOGIN_IP_LIMIT?.limit({ key: `ip:${ip}` }),
        email ? env.LOGIN_EMAIL_LIMIT?.limit({ key: `email:${email}` }) : undefined,
      ]);
      if (byIp?.success === false || byEmail?.success === false) {
        return json(failure("AccountError", "Demasiados intentos. Esperá un minuto y probá de nuevo."), 429, cors);
      }
      try {
        return json(await sessionRoute(env, pathname.slice("/v1/session/".length), body), 200, cors);
      } catch (error) {
        const name = error instanceof LicenseApiError ? "AccountError" : "Error";
        return json(failure(name, (error as Error).message), 200, cors);
      }
    }

    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const session = token ? await readSession(env, token) : null;
    if (!session) {
      return json(failure("AuthError", "Tu sesión terminó. Iniciá sesión de nuevo."), 401, cors);
    }
    const store = storeFor(env, session.account);
    const auth = { epoch: session.epoch, staff: (request.headers.get("X-WalQo-Staff") ?? "").trim() };

    let result: CallResult;
    if (pathname === "/v1/rpc") {
      result = await store.rpc(str(body.m), str(body.f), (body.a as unknown[]) ?? [], auth);
    } else if (pathname === "/v1/sql") {
      const kind = body.kind === "select" ? "select" : "execute";
      result = await store.query(kind, str(body.sql), (body.params as unknown[]) ?? [], auth);
    } else if (pathname === "/v1/native") {
      result = await store.native(str(body.cmd), (body.args as Record<string, unknown>) ?? {}, auth);
    } else {
      return json(failure("Error", "No encontrado."), 404, cors);
    }
    if (!result.ok && result.error.name === "AuthError") return json(result, 401, cors);
    return json(result, 200, cors);
  },
} satisfies ExportedHandler<Env>;
