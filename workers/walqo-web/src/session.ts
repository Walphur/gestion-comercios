/** Sesión del navegador: ws1.<datos>.<firma HMAC-SHA256>, válida 30 días. */
const PREFIX = "ws1";
const SESSION_DAYS = 30;

export interface Session {
  /** id de la cuenta en license-api: también nombra la base del comercio. */
  account: string;
  email: string;
  /** Sube con «Cerrar sesión en todos los aparatos»; las sesiones viejas dejan de servir. */
  epoch: number;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function sessionSecret(env: Env): string {
  const secret = env.SESSION_SECRET?.trim();
  if (!secret) throw new Error("Falta SESSION_SECRET en el servidor de WalQo Web.");
  return secret;
}

export async function signSession(env: Env, session: Session): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
  const data = b64url(
    new TextEncoder().encode(JSON.stringify({ a: session.account, e: session.email, v: session.epoch, x: exp })),
  );
  const signed = `${PREFIX}.${data}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(sessionSecret(env)), new TextEncoder().encode(signed));
  return `${signed}.${b64url(new Uint8Array(sig))}`;
}

export async function readSession(env: Env, token: string): Promise<Session | null> {
  const [prefix, data, sig] = token.split(".");
  if (prefix !== PREFIX || !data || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(sessionSecret(env)),
      b64urlDecode(sig),
      new TextEncoder().encode(`${prefix}.${data}`),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(data))) as {
      a?: string;
      e?: string;
      v?: number;
      x?: number;
    };
    if (!payload.a || !payload.e || !payload.x || payload.x < Date.now() / 1000) return null;
    return { account: payload.a, email: payload.e, epoch: Number(payload.v) || 0 };
  } catch {
    return null;
  }
}
