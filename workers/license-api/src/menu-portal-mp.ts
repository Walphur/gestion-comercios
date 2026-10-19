import type { PortalEnv } from "./portal";

/** Pago online de la tienda web con Checkout Pro, usando el token de Mercado Pago del comercio. */
export interface MpEnv extends PortalEnv {
  /** Clave AES-256 en base64 (32 bytes) para cifrar el token del comercio en D1. */
  MP_TOKEN_KEY?: string;
  /** Clave secreta de Webhooks de la app de Mercado Pago (opcional: si está, se valida x-signature). */
  MP_WEBHOOK_SECRET?: string;
}

const MP_API = "https://api.mercadopago.com";
const MP_TIMEOUT_MS = 10_000;
const PREFERENCE_TTL_MS = 60 * 60_000;
export const MP_CURRENCY = "ARS";

export type MpCredentialStatus = "ok" | "invalid" | "none";

/** Estado del pago online de un pedido. `null` = paga al retirar/recibir. */
export type OrderPaymentStatus = "awaiting" | "pending" | "approved" | "rejected" | "review" | "refunded";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

let keyCache: { raw: string; key: CryptoKey } | null = null;

async function tokenKey(env: MpEnv): Promise<CryptoKey | null> {
  const raw = (env.MP_TOKEN_KEY || "").trim();
  if (!raw) return null;
  if (keyCache?.raw === raw) return keyCache.key;
  let bytes: Uint8Array;
  try {
    bytes = b64decode(raw);
  } catch {
    return null;
  }
  if (bytes.length !== 32) return null;
  const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  keyCache = { raw, key };
  return key;
}

export async function mpTokenKeyReady(env: MpEnv): Promise<boolean> {
  return (await tokenKey(env)) != null;
}

/** `v1.<iv>.<cifrado>`; la licencia va como dato asociado para que no se pueda mover a otro comercio. */
export async function encryptMpToken(env: MpEnv, licenseId: string, token: string): Promise<string | null> {
  const key = await tokenKey(env);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(licenseId) },
    key,
    enc.encode(token),
  );
  return `v1.${b64encode(iv)}.${b64encode(new Uint8Array(ct))}`;
}

export async function decryptMpToken(env: MpEnv, licenseId: string, stored: string): Promise<string | null> {
  const key = await tokenKey(env);
  if (!key) return null;
  const [v, ivB64, ctB64] = stored.split(".");
  if (v !== "v1" || !ivB64 || !ctB64) return null;
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(ivB64), additionalData: enc.encode(licenseId) },
      key,
      b64decode(ctB64),
    );
    return dec.decode(pt);
  } catch {
    return null;
  }
}

export interface MpCredential {
  token: string;
  webhookKey: string;
  status: MpCredentialStatus;
}

export async function loadMpCredential(env: MpEnv, licenseId: string): Promise<MpCredential | null> {
  const row = await env.DB.prepare(
    `SELECT token_enc, status, webhook_key FROM menu_portal_mp_credentials WHERE license_id = ?1`,
  )
    .bind(licenseId)
    .first<{ token_enc: string; status: string; webhook_key: string }>();
  if (!row) return null;
  const token = await decryptMpToken(env, licenseId, row.token_enc);
  if (!token) return null;
  return {
    token,
    webhookKey: row.webhook_key,
    status: row.status === "ok" ? "ok" : "invalid",
  };
}

export async function mpCredentialStatus(env: MpEnv, licenseId: string): Promise<MpCredentialStatus> {
  const row = await env.DB.prepare(
    `SELECT status FROM menu_portal_mp_credentials WHERE license_id = ?1`,
  )
    .bind(licenseId)
    .first<{ status: string }>();
  if (!row) return "none";
  return row.status === "ok" ? "ok" : "invalid";
}

export async function markMpCredentialInvalid(env: MpEnv, licenseId: string, detail: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE menu_portal_mp_credentials SET status = 'invalid', status_detail = ?1, updated_at = ?2
     WHERE license_id = ?3`,
  )
    .bind(detail.slice(0, 120), new Date().toISOString(), licenseId)
    .run();
}

interface MpResponse {
  status: number;
  data: Record<string, unknown> | null;
}

async function mpFetch(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<MpResponse> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.idempotencyKey) headers["x-idempotency-key"] = init.idempotencyKey;
  const res = await fetch(`${MP_API}${path}`, {
    method: init.method || "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(MP_TIMEOUT_MS),
  });
  let data: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

/** Comprueba que el token sirva. `null` = Mercado Pago no respondió. */
export async function checkMpToken(token: string): Promise<{ ok: boolean; userId: string | null } | null> {
  try {
    const r = await mpFetch(token, "/users/me");
    if (r.status === 200) {
      const id = r.data?.id;
      return { ok: true, userId: id != null ? String(id).slice(0, 32) : null };
    }
    if (isAuthFailure(r.status)) return { ok: false, userId: null };
    return null;
  } catch {
    return null;
  }
}

/** Fecha en el formato que acepta Mercado Pago (con zona horaria explícita). */
function mpDate(ms: number): string {
  return new Date(ms).toISOString().replace("Z", "+00:00");
}

export interface PreferenceInput {
  orderId: string;
  code: string;
  businessName: string;
  lines: { id: number; name: string; qty: number; price: number }[];
  deliveryCost: number | null;
  notificationUrl: string;
  backUrl: string;
}

export type PreferenceResult =
  | { ok: true; preferenceId: string; initPoint: string }
  | { ok: false; reason: "auth" | "error" };

export async function createMpPreference(token: string, input: PreferenceInput): Promise<PreferenceResult> {
  const items = input.lines
    .filter((l) => l.price > 0)
    .map((l) => ({
      id: String(l.id),
      title: l.name.slice(0, 120),
      quantity: l.qty,
      unit_price: Math.round(l.price * 100) / 100,
      currency_id: MP_CURRENCY,
    }));
  if (input.deliveryCost && input.deliveryCost > 0) {
    items.push({
      id: "envio",
      title: "Envío",
      quantity: 1,
      unit_price: Math.round(input.deliveryCost * 100) / 100,
      currency_id: MP_CURRENCY,
    });
  }
  if (items.length === 0) return { ok: false, reason: "error" };
  const now = Date.now();
  const sep = input.backUrl.includes("?") ? "&" : "?";
  const body = {
    items,
    external_reference: input.orderId,
    notification_url: input.notificationUrl,
    back_urls: {
      success: `${input.backUrl}${sep}pago=ok`,
      pending: `${input.backUrl}${sep}pago=pendiente`,
      failure: `${input.backUrl}${sep}pago=error`,
    },
    auto_return: "approved",
    expires: true,
    expiration_date_from: mpDate(now - 60_000),
    expiration_date_to: mpDate(now + PREFERENCE_TTL_MS),
    payment_methods: {
      excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
    },
    metadata: { walqo_order_code: input.code },
  };
  try {
    const r = await mpFetch(token, "/checkout/preferences", {
      method: "POST",
      body,
      idempotencyKey: `walqo-pref-${input.orderId}`,
    });
    if (isAuthFailure(r.status)) return { ok: false, reason: "auth" };
    const id = typeof r.data?.id === "string" ? r.data.id : "";
    const initPoint = typeof r.data?.init_point === "string" ? r.data.init_point : "";
    if (r.status >= 200 && r.status < 300 && id && initPoint.startsWith("https://")) {
      return { ok: true, preferenceId: id, initPoint };
    }
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Corta el link de pago de un pedido que ya se cobró en el local o se rechazó. */
export async function expireMpPreference(token: string, preferenceId: string): Promise<void> {
  try {
    await mpFetch(token, `/checkout/preferences/${encodeURIComponent(preferenceId)}`, {
      method: "PUT",
      body: { expires: true, expiration_date_to: mpDate(Date.now()) },
    });
  } catch {
    /* si falla, el link vence solo en una hora */
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Firma `x-signature` (ts=…,v1=…) de los Webhooks de Mercado Pago. */
export async function verifyMpSignature(
  secret: string,
  xSignature: string,
  xRequestId: string | null,
  dataId: string,
): Promise<boolean> {
  let ts = "";
  let v1 = "";
  for (const part of xSignature.split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (k === "ts") ts = v || "";
    if (k === "v1") v1 = (v || "").toLowerCase();
  }
  if (!ts || !v1) return false;
  let manifest = "";
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;
  return safeEqual(await hmacHex(secret, manifest), v1);
}

function mapPaymentStatus(status: string): OrderPaymentStatus | null {
  switch (status) {
    case "approved":
      return "approved";
    case "pending":
    case "in_process":
    case "authorized":
      return "pending";
    case "rejected":
    case "cancelled":
      return "rejected";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return null;
  }
}

export type SyncResult =
  | { result: "applied"; payment_status: OrderPaymentStatus }
  | { result: "ignored" }
  | { result: "retry" };

/**
 * Consulta el pago a Mercado Pago con el token del comercio y lo anota en su pedido.
 * No confía en lo que manda el navegador ni el webhook: pedido, monto y moneda salen de la API.
 */
export async function syncMpPayment(env: MpEnv, licenseId: string, paymentId: string): Promise<SyncResult> {
  if (!/^\d{1,20}$/.test(paymentId)) return { result: "ignored" };
  const cred = await loadMpCredential(env, licenseId);
  if (!cred) return { result: "ignored" };

  let r: MpResponse;
  try {
    r = await mpFetch(cred.token, `/v1/payments/${paymentId}`);
  } catch {
    return { result: "retry" };
  }
  if (isAuthFailure(r.status)) {
    await markMpCredentialInvalid(env, licenseId, `payments ${r.status}`);
    return { result: "ignored" };
  }
  if (r.status === 404 || r.status === 400) return { result: "ignored" };
  if (r.status < 200 || r.status >= 300 || !r.data) return { result: "retry" };

  const p = r.data;
  const orderId = typeof p.external_reference === "string" ? p.external_reference.trim() : "";
  if (!orderId || orderId.length > 64) return { result: "ignored" };
  const mapped = mapPaymentStatus(typeof p.status === "string" ? p.status : "");
  if (!mapped) return { result: "ignored" };

  const order = await env.DB.prepare(
    `SELECT total, delivery_cost, payment_method, payment_status, mp_payment_id
     FROM menu_portal_orders WHERE id = ?1 AND license_id = ?2`,
  )
    .bind(orderId, licenseId)
    .first<{
      total: number;
      delivery_cost: number | null;
      payment_method: string | null;
      payment_status: string | null;
      mp_payment_id: string | null;
    }>();
  if (!order || order.payment_method !== "mercadopago") return { result: "ignored" };

  const pid = String(p.id ?? paymentId);
  if (pid !== paymentId) return { result: "ignored" };
  if (order.payment_status === "approved" && order.mp_payment_id && order.mp_payment_id !== pid) {
    return { result: "ignored" };
  }

  const expected = Math.round((order.total + (order.delivery_cost ?? 0)) * 100) / 100;
  const amount = typeof p.transaction_amount === "number" ? p.transaction_amount : Number.NaN;
  let next = mapped;
  if (next === "approved" && (p.currency_id !== MP_CURRENCY || !(Math.abs(amount - expected) < 0.01))) {
    next = "review";
  }
  if (order.payment_status === "approved" && order.mp_payment_id === pid && next !== "refunded") {
    return { result: "applied", payment_status: "approved" };
  }

  const now = new Date().toISOString();
  const paid = next === "approved" || next === "review" ? (Number.isFinite(amount) ? amount : null) : null;
  await env.DB.prepare(
    `UPDATE menu_portal_orders
     SET payment_status = ?1, mp_payment_id = ?2, paid_amount = ?3,
         paid_at = CASE WHEN ?1 = 'approved' THEN COALESCE(paid_at, ?4) ELSE paid_at END,
         updated_at = ?4
     WHERE id = ?5 AND license_id = ?6
       AND NOT (payment_status = 'approved' AND mp_payment_id IS NOT NULL AND mp_payment_id <> ?2)`,
  )
    .bind(next, pid, paid, now, orderId, licenseId)
    .run();
  return { result: "applied", payment_status: next };
}
