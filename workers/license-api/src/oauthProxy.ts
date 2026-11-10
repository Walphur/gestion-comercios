/**
 * Intercambio OAuth de Mercado Pago y Tienda Nube para la PC: la clave secreta de cada app
 * queda acá y el instalador solo lleva el client_id, que es público (va en la URL de autorización).
 * Se devuelve tal cual la respuesta del proveedor; nunca se guarda ni se registra.
 */
interface OAuthEnv {
  MP_CLIENT_ID?: string;
  MP_CLIENT_SECRET?: string;
  TN_CLIENT_ID?: string;
  TN_CLIENT_SECRET?: string;
}

const MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
/** La única dirección de vuelta registrada en Mercado Pago Developers. */
const MP_REDIRECT_URI = "https://walphur.github.io/gestion-comercios/oauth/callback.html";
const TN_TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token";

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function field(value: unknown, max = 512): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length <= max ? text : "";
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function forward(url: string, payload: Record<string, string>): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return reply(502, { message: "Sin conexión con el proveedor. Probá de nuevo en unos segundos." });
  }
  const body = (await res.json().catch(() => ({ message: `El proveedor respondió ${res.status}.` }))) as Record<
    string,
    unknown
  >;
  // Tienda Nube contesta 200 con { error } cuando el código no sirve.
  const failed = !res.ok || (typeof body.error === "string" && !body.access_token);
  return reply(failed ? (res.ok ? 400 : res.status) : res.status, body);
}

/** POST /v1/oauth/mp/token — { grant_type: "authorization_code", code, code_verifier } o { grant_type: "refresh_token", refresh_token }. */
export async function handleMpOAuthToken(req: Request, env: OAuthEnv): Promise<Response> {
  const clientId = env.MP_CLIENT_ID?.trim();
  const clientSecret = env.MP_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return reply(503, { message: "La conexión con Mercado Pago no está habilitada en el servidor." });
  }
  const body = await readBody(req);
  const app = { client_id: clientId, client_secret: clientSecret };
  if (body.grant_type === "authorization_code") {
    const code = field(body.code);
    // La PC siempre usa PKCE: sin verificador, un código robado no sirve.
    const verifier = field(body.code_verifier, 128);
    if (!code || !verifier) return reply(400, { message: "Falta la autorización de Mercado Pago." });
    return forward(MP_TOKEN_URL, {
      ...app,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: MP_REDIRECT_URI,
    });
  }
  if (body.grant_type === "refresh_token") {
    const refresh = field(body.refresh_token);
    if (!refresh) return reply(400, { message: "Falta el token para renovar." });
    return forward(MP_TOKEN_URL, { ...app, grant_type: "refresh_token", refresh_token: refresh });
  }
  return reply(400, { message: "Pedido inválido." });
}

/** POST /v1/oauth/tn/token — { code }. Los tokens de Tienda Nube no vencen: no hay renovación. */
export async function handleTnOAuthToken(req: Request, env: OAuthEnv): Promise<Response> {
  const clientId = env.TN_CLIENT_ID?.trim();
  const clientSecret = env.TN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return reply(503, { message: "La conexión con Tienda Nube no está habilitada en el servidor." });
  }
  const code = field((await readBody(req)).code);
  if (!code) return reply(400, { message: "Falta la autorización de Tienda Nube." });
  return forward(TN_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
  });
}
