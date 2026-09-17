/**
 * Identidad de servicio corta: license-api → gestion-bi-ia (canal portal).
 * NO usar LICENSE_ADMIN_SECRET ni GC1. NO incluir machine_id.
 */

export const PORTAL_SERVICE_TOKEN_PREFIX = "PBS1";
export const PORTAL_SERVICE_ISS = "license-api";
export const PORTAL_SERVICE_AUD = "gestion-bi-ia";
export const PORTAL_SERVICE_NAME = "portal";

/** TTL por defecto (segundos). */
export const PORTAL_SERVICE_TTL_SECS = 60;
/** Máximo absoluto aceptado al verificar (F4E-3: 60 s). */
export const PORTAL_SERVICE_MAX_TTL_SECS = 60;
/** iat no puede estar demasiado en el futuro. */
export const PORTAL_SERVICE_MAX_FUTURE_SKEW_SECS = 60;

export interface PortalServiceClaims {
  iss: typeof PORTAL_SERVICE_ISS;
  aud: typeof PORTAL_SERVICE_AUD;
  service: typeof PORTAL_SERVICE_NAME;
  aid: string;
  lid: string;
  iat: number;
  exp: number;
}

function b64url(buf: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof buf === "string"
      ? new TextEncoder().encode(buf)
      : buf instanceof Uint8Array
        ? buf
        : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64url(sig);
}

function isNonEmptyId(v: unknown): v is string {
  return typeof v === "string" && v.trim().length >= 8 && v.trim().length <= 128;
}

export interface MintPortalServiceTokenOptions {
  aid: string;
  lid: string;
  /** Override TTL (capped by MAX). */
  ttlSecs?: number;
  /** Override now (tests). */
  nowSecs?: number;
}

/**
 * Emite PBS1 firmado con PORTAL_BI_SERVICE_SECRET.
 * Lanza si secret/claims inválidos.
 */
export async function mintPortalServiceToken(
  secret: string,
  opts: MintPortalServiceTokenOptions,
): Promise<string> {
  if (!secret || secret.length < 16) {
    throw new Error("PORTAL_BI_SERVICE_SECRET ausente o demasiado corto");
  }
  if (!isNonEmptyId(opts.aid) || !isNonEmptyId(opts.lid)) {
    throw new Error("aid/lid inválidos para service token");
  }
  const now = opts.nowSecs ?? Math.floor(Date.now() / 1000);
  let ttl = opts.ttlSecs ?? PORTAL_SERVICE_TTL_SECS;
  if (!Number.isFinite(ttl) || ttl <= 0) ttl = PORTAL_SERVICE_TTL_SECS;
  if (ttl > PORTAL_SERVICE_MAX_TTL_SECS) {
    throw new Error("TTL de service token excesivo");
  }
  const claims: PortalServiceClaims = {
    iss: PORTAL_SERVICE_ISS,
    aud: PORTAL_SERVICE_AUD,
    service: PORTAL_SERVICE_NAME,
    aid: opts.aid.trim(),
    lid: opts.lid.trim(),
    iat: now,
    exp: now + Math.floor(ttl),
  };
  const body = b64url(JSON.stringify(claims));
  const signed = `${PORTAL_SERVICE_TOKEN_PREFIX}.${body}`;
  const sig = await hmacSign(secret, signed);
  return `${signed}.${sig}`;
}

export type VerifyPortalServiceFailure =
  | "missing_secret"
  | "malformed"
  | "bad_signature"
  | "bad_issuer"
  | "bad_audience"
  | "bad_service"
  | "missing_aid"
  | "missing_lid"
  | "expired"
  | "ttl_excessive"
  | "iat_future"
  | "forbidden_claims";

export type VerifyPortalServiceResult =
  | { ok: true; claims: PortalServiceClaims }
  | { ok: false; reason: VerifyPortalServiceFailure };

/**
 * Verifica PBS1. Rechaza machine_id / secrets en claims.
 */
export async function verifyPortalServiceToken(
  secret: string | undefined | null,
  token: string,
  nowSecs?: number,
): Promise<VerifyPortalServiceResult> {
  if (!secret || secret.length < 16) {
    return { ok: false, reason: "missing_secret" };
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PORTAL_SERVICE_TOKEN_PREFIX) {
    return { ok: false, reason: "malformed" };
  }
  const signed = `${parts[0]}.${parts[1]}`;
  const expected = await hmacSign(secret, signed);
  if (expected !== parts[2]) {
    return { ok: false, reason: "bad_signature" };
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]!))) as Record<
      string,
      unknown
    >;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // Claims sensibles / identidad de dispositivo: rechazar si aparecen.
  if (
    "machine_id" in raw ||
    "token" in raw ||
    "secret" in raw ||
    "openai" in raw ||
    "password" in raw
  ) {
    return { ok: false, reason: "forbidden_claims" };
  }

  if (raw.iss !== PORTAL_SERVICE_ISS) return { ok: false, reason: "bad_issuer" };
  if (raw.aud !== PORTAL_SERVICE_AUD) return { ok: false, reason: "bad_audience" };
  if (raw.service !== PORTAL_SERVICE_NAME) return { ok: false, reason: "bad_service" };
  if (!isNonEmptyId(raw.aid)) return { ok: false, reason: "missing_aid" };
  if (!isNonEmptyId(raw.lid)) return { ok: false, reason: "missing_lid" };

  const iat = Number(raw.iat);
  const exp = Number(raw.exp);
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) {
    return { ok: false, reason: "malformed" };
  }
  if (exp - iat > PORTAL_SERVICE_MAX_TTL_SECS) {
    return { ok: false, reason: "ttl_excessive" };
  }
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  if (iat > now + PORTAL_SERVICE_MAX_FUTURE_SKEW_SECS) {
    return { ok: false, reason: "iat_future" };
  }
  if (exp < now) return { ok: false, reason: "expired" };

  return {
    ok: true,
    claims: {
      iss: PORTAL_SERVICE_ISS,
      aud: PORTAL_SERVICE_AUD,
      service: PORTAL_SERVICE_NAME,
      aid: String(raw.aid).trim(),
      lid: String(raw.lid).trim(),
      iat,
      exp,
    },
  };
}
