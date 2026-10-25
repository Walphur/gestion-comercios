import {
  handleAuthForgot,
  handleAuthLogin,
  handleAuthRegister,
  handleAuthResend,
  handleAuthReset,
  handleAuthVerify,
} from "./auth";
import {
  handlePortalDashboard,
  handlePortalLogin,
  handlePortalLogout,
  handlePortalMe,
  handlePortalPush,
  handlePortalInterpret,
  portalOptions,
} from "./portal";
import {
  handleWorkshopPortalInfo,
  handleWorkshopPortalLookup,
  handleWorkshopPortalPush,
  workshopPortalOptions,
} from "./workshop-portal";
import {
  handleMenuPortalInfo,
  handleMenuPortalMpCredentials,
  handleMenuPortalMpWebhook,
  handleMenuPortalOrderCreate,
  handleMenuPortalOrderStatus,
  handleMenuPortalOrdersPull,
  handleMenuPortalOrdersUpdate,
  handleMenuPortalPhoto,
  handleMenuPortalPhotos,
  handleMenuPortalPush,
  handleMenuPortalTableRequest,
  handleMenuPortalTableStatus,
  handleMenuPortalTablesSync,
  menuPortalOptions,
} from "./menu-portal";
import {
  handleMenuPortalWaitersManage,
  handleMenuPortalWaitersSync,
  handleWaiterCommand,
  handleWaiterMenu,
  handleWaiterState,
} from "./menu-portal-waiters";
import {
  findActiveSeller,
  normalizeSellerCode,
  saveSeller,
  sellerCodesByLicense,
  sellerReport,
  signupSellerFromWeb,
} from "./sellers";

type D1Database = any;

export interface Env {
  DB: D1Database;
  LICENSE_PRIVATE_KEY_B64: string;
  LICENSE_ADMIN_SECRET: string;
  LICENSE_PUBLIC_KEY_HEX: string;
  /** HMAC para PBS1 portal→bi-ia (opcional hasta configurar secret). */
  PORTAL_BI_SERVICE_SECRET?: string;
  /** Base URL gestion-bi-ia (opcional). */
  PORTAL_BI_IA_URL?: string;
  /** Service binding a gestion-bi-ia. */
  BI_IA?: { fetch: typeof fetch };
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  ALLOW_DEV_OTP?: string;
  GITHUB_TOKEN?: string;
  /** Tienda web: clave AES para el token de Mercado Pago del comercio y secreto de webhooks (opcional). */
  MP_TOKEN_KEY?: string;
  MP_WEBHOOK_SECRET?: string;
}

type Plan = "basic" | "pro" | "free";

interface LicenseRow {
  id: string;
  license_key: string;
  plan: Plan;
  max_devices: number;
  buyer_note: string | null;
  created_at: string;
  revoked: number;
  billing_type: string;
  expires_at: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  amount_ars?: number | null;
  last_paid_at?: string | null;
  updated_at?: string | null;
  /** Saldo del período abierto. null = todavía no hay pagos parciales: se infiere. */
  balance_ars?: number | null;
}

type PaymentStatus = "current" | "pending" | "partial" | "overdue" | "none";

interface LicenseListItem extends LicenseRow {
  activations: number;
  status: "active" | "expiring" | "expired" | "revoked" | "perpetual";
  days_left: number | null;
  payment_status: PaymentStatus;
  /** Saldo a cobrar ahora. 0 si el período vigente ya está cubierto. */
  balance_ars: number | null;
  /** Importe que acepta el próximo registro de pago. */
  amount_due_ars: number;
}

interface ActivationRow {
  id: string;
  license_id: string;
  machine_id: string;
  device_name: string | null;
  activated_at: string;
}

interface TrialRow {
  id: string;
  machine_id: string;
  started_at: string;
  app_version: string | null;
}

interface TrialListItem extends TrialRow {
  converted: number;
}

interface LicensePayload {
  v: number;
  lid: string;
  plan: Plan;
  max_devices: number;
  machine_id: string;
  pro: boolean;
  iat: number;
  key_mask: string;
  exp?: number;
  billing?: string;
}

const TOKEN_PREFIX = "GC1";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

function err(message: string, code: string, status = 400): Response {
  return json({ ok: false, error: code, message }, status);
}

function maskKey(key: string): string {
  const parts = key.split("-");
  if (parts.length >= 2) {
    return `${parts[0]}-****-${parts[parts.length - 1]}`;
  }
  return `****${key.slice(-4)}`;
}

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else {
    bytes = new Uint8Array(data);
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importPrivateKey(b64: string): Promise<CryptoKey> {
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, false, ["sign"]);
}

async function signToken(env: Env, payload: LicensePayload): Promise<string> {
  const payloadJson = JSON.stringify(payload);
  const payloadPart = b64url(payloadJson);
  const signed = `${TOKEN_PREFIX}.${payloadPart}`;
  const key = await importPrivateKey(env.LICENSE_PRIVATE_KEY_B64);
  const sig = await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(signed));
  return `${signed}.${b64url(sig)}`;
}

async function verifyToken(env: Env, token: string): Promise<LicensePayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const signed = `${parts[0]}.${parts[1]}`;
  const payloadBytes = b64urlDecode(parts[1]);
  const sigBytes = b64urlDecode(parts[2]);
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as LicensePayload;
    const pubRaw = hexToBytes(env.LICENSE_PUBLIC_KEY_HEX);
    const pubKey = await crypto.subtle.importKey(
      "raw",
      pubRaw,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "Ed25519",
      pubKey,
      sigBytes,
      new TextEncoder().encode(signed),
    );
    return ok ? payload : null;
  } catch {
    return null;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `GC-${chunk()}-${chunk()}-${chunk()}`;
}

function uuid(): string {
  return crypto.randomUUID();
}

async function findLicense(env: Env, key: string): Promise<LicenseRow | null> {
  const row = await env.DB.prepare(
    `SELECT id, license_key, plan, max_devices, buyer_note, created_at, revoked,
            billing_type, expires_at, client_name, client_phone, amount_ars,
            last_paid_at, updated_at, balance_ars
     FROM licenses WHERE license_key = ?1`,
  )
    .bind(key.trim().toUpperCase())
    .first<LicenseRow>();
  return row;
}

/** Pagando el año de una vez: 12 meses por el precio de 10. */
const ANNUAL_PAID_MONTHS = 10;
const ANNUAL_DAYS = 365;
const QUARTER_PAID_MONTHS = 2.7;
const QUARTER_DAYS = 90;

function defaultAmount(plan: Plan, billing?: string): number {
  if (plan === "free") return 0;
  if (billing === "perpetual") return 12_000;
  if (plan === "pro") return 60_000;
  return 35_000;
}

function defaultDevices(plan: Plan, billing: string): number {
  if (billing === "perpetual") return 1;
  if (plan === "pro") return 3;
  return 2;
}

function licenseStatus(row: LicenseRow): LicenseListItem["status"] {
  if (row.revoked) return "revoked";
  if (row.billing_type !== "monthly" || !row.expires_at) return "perpetual";
  const ms = new Date(row.expires_at).getTime() - Date.now();
  if (ms < 0) return "expired";
  if (ms <= 7 * 86_400_000) return "expiring";
  return "active";
}

function daysLeft(row: LicenseRow): number | null {
  if (!row.expires_at) return null;
  return Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / 86_400_000);
}

function monthlyFee(row: LicenseRow): number {
  if (row.plan === "free") return 0;
  if (row.amount_ars != null && row.amount_ars >= 0) return row.amount_ars;
  return defaultAmount(row.plan, row.billing_type === "monthly" ? "monthly" : "perpetual");
}

function isMonthlyPlan(row: LicenseRow): boolean {
  return row.billing_type === "monthly" && row.plan !== "free";
}

function periodExpired(row: LicenseRow): boolean {
  return !!row.expires_at && new Date(row.expires_at).getTime() < Date.now();
}

/** null en la base = período vigente cubierto, o un mes entero si ya venció. */
function resolvedBalance(row: LicenseRow): number {
  if (!isMonthlyPlan(row)) return 0;
  if (row.balance_ars != null && row.balance_ars >= 0) return row.balance_ars;
  if (periodExpired(row)) return monthlyFee(row);
  return 0;
}

function paymentStatusOf(row: LicenseRow): PaymentStatus {
  if (!isMonthlyPlan(row) || !row.expires_at) return "none";
  const fee = monthlyFee(row);
  const balance = resolvedBalance(row);
  if (periodExpired(row)) {
    if (balance <= 0) return "current";
    if (fee > 0 && balance < fee) return "partial";
    return "overdue";
  }
  if (balance <= 0) return "current";
  if (fee > 0 && balance < fee) return "partial";
  return "pending";
}

function amountDue(row: LicenseRow): number {
  if (!isMonthlyPlan(row)) return 0;
  const balance = resolvedBalance(row);
  if (balance > 0) return balance;
  return monthlyFee(row);
}

function artMonthRange(now = new Date()): { start: string; end: string; label: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const start = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 3, 0, 0));
  const label = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    month: "long",
    year: "numeric",
  }).format(now);
  return { start: start.toISOString(), end: end.toISOString(), label };
}

async function enrichLicense(env: Env, row: LicenseRow): Promise<LicenseListItem> {
  const activations = await countActivations(env, row.id);
  return {
    ...row,
    activations,
    status: licenseStatus(row),
    days_left: daysLeft(row),
    balance_ars: resolvedBalance(row),
    payment_status: paymentStatusOf(row),
    amount_due_ars: amountDue(row),
  };
}

function requireAdmin(req: Request, env: Env): Response | null {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env.LICENSE_ADMIN_SECRET}`) {
    return err("No autorizado", "UNAUTHORIZED", 401);
  }
  return null;
}

function licenseExpired(license: LicenseRow): boolean {
  if (!license.expires_at) return false;
  return new Date(license.expires_at).getTime() < Date.now();
}

function expiryUnix(license: LicenseRow): number {
  if (!license.expires_at) return 0;
  return Math.floor(new Date(license.expires_at).getTime() / 1000);
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Parse YYYY-MM-DD or ISO → UTC Date at start of that calendar day (UTC). */
function parsePeriodStart(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDaysFromDate(base: Date, days: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Resolve monthly expires_at from optional expires_at / period_start / days|months.
 * Prefer explicit expires_at; else period_start + duration; else fromNow + duration.
 */
function resolveMonthlyExpiry(opts: {
  expires_at?: string | null;
  period_start?: string | null;
  days?: number;
  months?: number;
  fromNow?: boolean;
}): { expiresAt: string; periodStart: string | null } | { error: string } {
  const months = opts.months ?? 1;
  const days = opts.days ?? months * 30;

  if (opts.expires_at != null && String(opts.expires_at).trim() !== "") {
    const exp = parsePeriodStart(String(opts.expires_at));
    if (!exp) return { error: "expires_at inválida" };
    // If only a date was given, treat as end-of-day UTC for that date.
    const raw = String(opts.expires_at).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      exp.setUTCHours(23, 59, 59, 999);
    }
    return { expiresAt: exp.toISOString(), periodStart: null };
  }

  if (opts.period_start != null && String(opts.period_start).trim() !== "") {
    const start = parsePeriodStart(String(opts.period_start));
    if (!start) return { error: "period_start inválida" };
    return {
      expiresAt: addDaysFromDate(start, days),
      periodStart: start.toISOString(),
    };
  }

  if (opts.fromNow === false) {
    return { error: "Falta period_start o expires_at" };
  }
  return { expiresAt: addDaysIso(days), periodStart: null };
}

async function countActivations(env: Env, licenseId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM activations WHERE license_id = ?1",
  )
    .bind(licenseId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

type GithubDownloads = {
  total: number | null;
  releases_with_installer: number | null;
  /** ok = conteo real. error = GitHub no respondió: total null, no es cero descargas. */
  status: "ok" | "error";
  error?: string;
  fetched_at: string | null;
  /** Acumulado por versión, no descargas de ese día. */
  by_version: Array<{ tag: string; downloads: number; published_at: string | null }>;
};

const GITHUB_CACHE_URL = "https://walqo.internal/github-setup-downloads-v1";

async function fetchGithubDownloads(env: Env): Promise<GithubDownloads> {
  try {
    const hit = await caches.default.match(new Request(GITHUB_CACHE_URL));
    if (hit) return (await hit.json()) as GithubDownloads;
  } catch {
    /* el caché no está en todos los entornos */
  }
  const fresh = await pullGithubDownloads(env);
  if (fresh.status === "ok") {
    try {
      await caches.default.put(
        new Request(GITHUB_CACHE_URL),
        new Response(JSON.stringify(fresh), {
          headers: { "Cache-Control": "public, max-age=21600" },
        }),
      );
    } catch {
      /* seguir sin caché */
    }
  }
  return fresh;
}

async function pullGithubDownloads(env: Env): Promise<GithubDownloads> {
  const empty: GithubDownloads = {
    total: null,
    releases_with_installer: null,
    status: "error",
    fetched_at: null,
    by_version: [],
  };
  try {
    const headers: Record<string, string> = {
      "User-Agent": "waltech-license-worker",
      Accept: "application/vnd.github+json",
    };
    if (env.GITHUB_TOKEN?.trim()) {
      headers.Authorization = `Bearer ${env.GITHUB_TOKEN.trim()}`;
    }

    let total = 0;
    let releasesWithInstaller = 0;
    const byVersion: GithubDownloads["by_version"] = [];
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `https://api.github.com/repos/Walphur/gestion-comercios/releases?per_page=100&page=${page}`,
        { headers },
      );
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 180);
        console.error("fetchGithubDownloads failed:", res.status, detail);
        return {
          ...empty,
          error: res.status === 403 ? "GitHub limitó la consulta desde el servidor" : `GitHub respondió ${res.status}`,
        };
      }
      const releases = (await res.json()) as Array<{
        tag_name: string;
        published_at?: string | null;
        assets: Array<{ name: string; download_count: number }>;
      }>;
      if (!releases.length) break;
      for (const release of releases) {
        let releaseInstallers = 0;
        for (const asset of release.assets ?? []) {
          const name = (asset.name ?? "").toLowerCase();
          // Solo el instalador NSIS (.exe setup). Excluye .msi, .sig y latest.json.
          if (name.includes("setup") && name.endsWith(".exe")) {
            releaseInstallers += asset.download_count ?? 0;
          }
        }
        if (releaseInstallers > 0) {
          releasesWithInstaller += 1;
          total += releaseInstallers;
          byVersion.push({
            tag: release.tag_name,
            downloads: releaseInstallers,
            published_at: release.published_at ?? null,
          });
        }
      }
      if (releases.length < 100) break;
    }
    return {
      total,
      releases_with_installer: releasesWithInstaller,
      status: "ok",
      fetched_at: new Date().toISOString(),
      by_version: byVersion.slice(0, 12),
    };
  } catch (error) {
    console.error("fetchGithubDownloads exception:", error);
    return { ...empty, error: "No se pudo consultar GitHub" };
  }
}

async function trialStats(env: Env): Promise<{
  trials_total: number;
  trials_last_7d: number;
  trials_converted: number;
  conversion_pct: number;
}> {
  const totalRow = await env.DB.prepare("SELECT COUNT(*) as c FROM trial_events")
    .first<{ c: number }>();
  const last7Row = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM trial_events WHERE started_at >= datetime('now', '-7 days')",
  ).first<{ c: number }>();
  const machinesRow = await env.DB.prepare(
    "SELECT COUNT(DISTINCT machine_id) as c FROM trial_events",
  ).first<{ c: number }>();
  const convertedRow = await env.DB.prepare(
    `SELECT COUNT(DISTINCT t.machine_id) as c
     FROM trial_events t
     INNER JOIN activations a ON a.machine_id = t.machine_id`,
  ).first<{ c: number }>();

  const trialsTotal = totalRow?.c ?? 0;
  const machines = machinesRow?.c ?? 0;
  const trialsConverted = convertedRow?.c ?? 0;
  const conversionPct =
    machines > 0 ? Math.min(100, Math.round((trialsConverted / machines) * 1000) / 10) : 0;

  return {
    trials_total: trialsTotal,
    trials_last_7d: last7Row?.c ?? 0,
    trials_converted: trialsConverted,
    conversion_pct: conversionPct,
  };
}

async function handleTelemetryOpen(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { machine_id?: string; app_version?: string };
  const machineId = body.machine_id?.trim();
  if (!machineId || machineId.length < 8) {
    return err("machine_id inválido", "BAD_REQUEST");
  }
  const now = new Date().toISOString();
  const version = body.app_version?.trim() || null;

  const existing = await env.DB.prepare(
    "SELECT id FROM app_open_events WHERE machine_id = ?1",
  )
    .bind(machineId)
    .first<{ id: string }>();

  if (existing) {
    await env.DB.prepare(
      "UPDATE app_open_events SET last_opened_at = ?1, app_version = COALESCE(?2, app_version) WHERE machine_id = ?3",
    )
      .bind(now, version, machineId)
      .run();
    return json({ ok: true, recorded: false });
  }

  await env.DB.prepare(
    "INSERT INTO app_open_events (id, machine_id, first_opened_at, last_opened_at, app_version) VALUES (?1, ?2, ?3, ?4, ?5)",
  )
    .bind(uuid(), machineId, now, now, version)
    .run();

  return json({ ok: true, recorded: true });
}

async function openStats(env: Env): Promise<{
  opens_total: number;
  opens_last_7d: number;
}> {
  try {
    const totalRow = await env.DB.prepare("SELECT COUNT(*) as c FROM app_open_events")
      .first<{ c: number }>();
    const last7Row = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM app_open_events WHERE first_opened_at >= datetime('now', '-7 days')",
    ).first<{ c: number }>();
    return {
      opens_total: totalRow?.c ?? 0,
      opens_last_7d: last7Row?.c ?? 0,
    };
  } catch {
    return { opens_total: 0, opens_last_7d: 0 };
  }
}

async function handleTrialStart(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { machine_id?: string; app_version?: string };
  const machineId = body.machine_id?.trim();
  if (!machineId || machineId.length < 8) {
    return err("machine_id inválido", "BAD_REQUEST");
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM trial_events WHERE machine_id = ?1",
  )
    .bind(machineId)
    .first<{ id: string }>();

  if (!existing) {
    await env.DB.prepare(
      "INSERT INTO trial_events (id, machine_id, started_at, app_version) VALUES (?1, ?2, ?3, ?4)",
    )
      .bind(uuid(), machineId, new Date().toISOString(), body.app_version?.trim() || null)
      .run();
  }

  return json({ ok: true, recorded: !existing });
}

async function handleTrialBiToken(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { machine_id?: string };
  const machineId = body.machine_id?.trim();
  if (!machineId || machineId.length < 8) {
    return err("machine_id inválido", "BAD_REQUEST");
  }

  const row = await env.DB.prepare(
    "SELECT started_at FROM trial_events WHERE machine_id = ?1 ORDER BY started_at DESC LIMIT 1",
  )
    .bind(machineId)
    .first<{ started_at: string }>();

  if (!row) {
    return err("No hay prueba activa para este equipo.", "NO_TRIAL", 403);
  }

  const startedMs = new Date(row.started_at).getTime();
  const expSec = Math.floor((startedMs + 7 * 86_400_000) / 1000);
  if (Math.floor(Date.now() / 1000) >= expSec) {
    return err("La prueba expiró.", "TRIAL_EXPIRED", 403);
  }

  const payload: LicensePayload = {
    v: 1,
    lid: `trial-${machineId.slice(0, 12)}`,
    plan: "pro",
    max_devices: 1,
    machine_id: machineId,
    pro: true,
    iat: Math.floor(Date.now() / 1000),
    key_mask: "TRIAL",
    exp: expSec,
    billing: "trial",
  };

  const token = await signToken(env, payload);
  return json({ ok: true, token });
}

async function handleAdminTrials(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "80", 10)));

  const rows = await env.DB.prepare(
    `SELECT t.id, t.machine_id, t.started_at, t.app_version,
            CASE WHEN EXISTS (
              SELECT 1 FROM activations a WHERE a.machine_id = t.machine_id
            ) THEN 1 ELSE 0 END AS converted
     FROM trial_events t
     ORDER BY t.started_at DESC
     LIMIT ?1`,
  )
    .bind(limit)
    .all<TrialListItem>();

  return json({ ok: true, trials: rows.results ?? [] });
}

async function findActivation(
  env: Env,
  licenseId: string,
  machineId: string,
): Promise<ActivationRow | null> {
  return env.DB.prepare(
    "SELECT id, license_id, machine_id, device_name, activated_at FROM activations WHERE license_id = ?1 AND machine_id = ?2",
  )
    .bind(licenseId, machineId)
    .first<ActivationRow>();
}

async function issueForLicense(
  env: Env,
  license: LicenseRow,
  machineId: string,
): Promise<Response> {
  if (licenseExpired(license)) {
    return err(
      "Tu suscripción venció. Contactá a Waltech por WhatsApp para renovar.",
      "EXPIRED",
      403,
    );
  }

  const existing = await findActivation(env, license.id, machineId);
  if (!existing) {
    const count = await countActivations(env, license.id);
    if (count >= license.max_devices) {
      return err(
        `Esta licencia ya está en uso en ${license.max_devices} PC(s). Contactá a Waltech para ampliar o transferir.`,
        "MAX_DEVICES",
        403,
      );
    }
    await env.DB.prepare(
      "INSERT INTO activations (id, license_id, machine_id, device_name, activated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
      .bind(uuid(), license.id, machineId, null, new Date().toISOString())
      .run();
  }

  const payload: LicensePayload = {
    v: 1,
    lid: license.id,
    plan: license.plan,
    max_devices: license.max_devices,
    machine_id: machineId,
    pro: license.plan === "pro",
    iat: Math.floor(Date.now() / 1000),
    key_mask: maskKey(license.license_key),
    exp: expiryUnix(license),
    billing: license.billing_type ?? "perpetual",
  };
  const token = await signToken(env, payload);
  return json({
    ok: true,
    token,
    plan: license.plan,
    pro: license.plan === "pro",
    max_devices: license.max_devices,
    billing: license.billing_type ?? "perpetual",
    expires_at: license.expires_at,
  });
}

async function handleActivate(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { key?: string; machine_id?: string; app?: string };
  const key = body.key?.trim().toUpperCase();
  const machineId = body.machine_id?.trim();
  if (!key || !machineId) return err("Faltan datos de activación", "BAD_REQUEST");

  const license = await findLicense(env, key);
  if (!license) return err("Clave de licencia incorrecta", "INVALID_KEY", 404);
  if (license.revoked) return err("Esta licencia fue revocada", "REVOKED", 403);

  return issueForLicense(env, license, machineId);
}

async function handleValidate(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { token?: string; machine_id?: string };
  const token = body.token?.trim();
  const machineId = body.machine_id?.trim();
  if (!token || !machineId) return err("Faltan datos", "BAD_REQUEST");

  const payload = await verifyToken(env, token);
  if (!payload) return err("Licencia inválida", "INVALID_TOKEN", 403);
  if (payload.machine_id !== machineId) {
    return err("La licencia no corresponde a esta PC", "WRONG_MACHINE", 403);
  }

  const license = await env.DB.prepare(
    "SELECT id, license_key, plan, max_devices, buyer_note, created_at, revoked, billing_type, expires_at FROM licenses WHERE id = ?1",
  )
    .bind(payload.lid)
    .first<LicenseRow>();

  if (!license || license.revoked) {
    return err("Licencia revocada o inexistente", "REVOKED", 403);
  }

  if (licenseExpired(license)) {
    return err(
      "Tu suscripción venció. Contactá a Waltech por WhatsApp para renovar.",
      "EXPIRED",
      403,
    );
  }

  const activation = await findActivation(env, license.id, machineId);
  if (!activation) {
    return err("Activación no registrada", "NOT_ACTIVATED", 403);
  }

  const renewed = await signToken(env, {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    pro: license.plan === "pro",
    plan: license.plan,
    max_devices: license.max_devices,
    exp: expiryUnix(license),
    billing: license.billing_type ?? "perpetual",
  });

  return json({
    ok: true,
    valid: true,
    token: renewed,
    billing: license.billing_type ?? "perpetual",
    expires_at: license.expires_at,
  });
}

async function handleAdminCreate(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const body = (await req.json()) as {
    plan?: Plan;
    max_devices?: number;
    buyer_note?: string;
    license_key?: string;
    billing?: "perpetual" | "monthly";
    months?: number;
    days?: number;
    /** Inicio del ciclo de facturación (YYYY-MM-DD o ISO). drives expires_at. */
    period_start?: string;
    /** Vencimiento absoluto (YYYY-MM-DD o ISO). Si viene, tiene prioridad. */
    expires_at?: string;
    client_name?: string;
    client_phone?: string;
    amount_ars?: number;
  };
  const plan = body.plan ?? "basic";
  if (plan !== "basic" && plan !== "pro" && plan !== "free") {
    return err("Plan inválido", "BAD_PLAN");
  }
  let billing = body.billing ?? (plan === "free" ? "perpetual" : "perpetual");
  if (plan === "free") billing = "perpetual";
  const maxDevices =
    body.max_devices ?? (plan === "free" ? 1 : defaultDevices(plan, billing));
  if (maxDevices < 1 || maxDevices > 20) {
    return err("max_devices debe ser entre 1 y 20", "BAD_DEVICES");
  }
  let expiresAt: string | null = null;
  let periodStartIso: string | null = null;
  if (billing === "monthly" && plan !== "free") {
    const resolved = resolveMonthlyExpiry({
      expires_at: body.expires_at,
      period_start: body.period_start,
      days: body.days,
      months: body.months,
      fromNow: true,
    });
    if ("error" in resolved) return err(resolved.error, "BAD_DATE");
    expiresAt = resolved.expiresAt;
    periodStartIso = resolved.periodStart;
  }
  const licenseKey = (body.license_key ?? randomKey()).trim().toUpperCase();
  const id = uuid();
  const now = new Date().toISOString();
  const amount =
    body.amount_ars ??
    (plan === "free" ? 0 : defaultAmount(plan, billing));
  const lastPaid = billing === "monthly" ? now : null;
  await env.DB.prepare(
    `INSERT INTO licenses (
      id, license_key, plan, max_devices, buyer_note, created_at, revoked,
      billing_type, expires_at, client_name, client_phone, amount_ars,
      last_paid_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
  )
    .bind(
      id,
      licenseKey,
      plan,
      maxDevices,
      body.buyer_note ?? null,
      now,
      billing,
      expiresAt,
      body.client_name?.trim() || null,
      body.client_phone?.trim() || null,
      amount,
      lastPaid,
      now,
    )
    .run();

  return json({
    ok: true,
    license_key: licenseKey,
    plan,
    max_devices: maxDevices,
    id,
    billing,
    expires_at: expiresAt,
    period_start: periodStartIso,
    amount_ars: amount,
  });
}

async function extendLicense(
  env: Env,
  license: LicenseRow,
  addDays: number,
  markPaid: boolean,
): Promise<{ expires_at: string; days_added: number }> {
  const base =
    license.expires_at && new Date(license.expires_at) > new Date()
      ? new Date(license.expires_at)
      : new Date();
  base.setUTCDate(base.getUTCDate() + addDays);
  const expiresAt = base.toISOString();
  const now = new Date().toISOString();

  if (markPaid) {
    await env.DB.prepare(
      `UPDATE licenses SET billing_type = 'monthly', expires_at = ?1,
       last_paid_at = ?2, updated_at = ?2, revoked = 0 WHERE license_key = ?3`,
    )
      .bind(expiresAt, now, license.license_key)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE licenses SET billing_type = 'monthly', expires_at = ?1, updated_at = ?2
       WHERE license_key = ?3`,
    )
      .bind(expiresAt, now, license.license_key)
      .run();
  }

  return { expires_at: expiresAt, days_added: addDays };
}

async function handleAdminExtend(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const body = (await req.json()) as { license_key?: string; days?: number; months?: number };
  const key = body.license_key?.trim().toUpperCase();
  if (!key) return err("Falta license_key", "BAD_REQUEST");
  const license = await findLicense(env, key);
  if (!license) return err("Licencia no encontrada", "NOT_FOUND", 404);

  const addDays = body.days ?? (body.months ?? 1) * 30;
  const result = await extendLicense(env, license, addDays, false);
  return json({ ok: true, license_key: key, ...result });
}

async function handleAdminPay(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const body = (await req.json()) as {
    license_key?: string;
    months?: number;
    days?: number;
    amount_ars?: number;
    paid_at?: string;
    method?: string;
    period_start?: string;
    period_end?: string;
    note?: string;
    /** Pago del año de una vez: cubre 365 días y cobra 10 meses. */
    annual?: boolean;
    /** Pago de 3 meses juntos con 10% de descuento: cubre 90 días. */
    quarterly?: boolean;
  };
  const key = body.license_key?.trim().toUpperCase();
  if (!key) return err("Falta license_key", "BAD_REQUEST");
  const license = await findLicense(env, key);
  if (!license) return err("Licencia no encontrada", "NOT_FOUND", 404);

  const prepaid = body.annual === true
    ? { days: ANNUAL_DAYS, months: ANNUAL_PAID_MONTHS, label: `Pago anual: 12 meses por ${ANNUAL_PAID_MONTHS}`, name: "anual" }
    : body.quarterly === true
      ? { days: QUARTER_DAYS, months: QUARTER_PAID_MONTHS, label: "Pago trimestral: 3 meses con 10% de descuento", name: "trimestral" }
      : null;
  const annual = prepaid != null;
  const detailed =
    body.amount_ars != null ||
    body.method != null ||
    body.paid_at != null ||
    body.period_start != null ||
    body.note != null;

  const monthlyPlan = license.billing_type === "monthly" && license.plan !== "free";
  if (!monthlyPlan) {
    if (!detailed) {
      const addDays = body.days ?? (body.months ?? 1) * 30;
      const result = await extendLicense(env, license, addDays, true);
      const updated = await findLicense(env, key);
      return json({
        ok: true,
        license_key: key,
        ...result,
        last_paid_at: updated?.last_paid_at,
        message: "Pago registrado y suscripción renovada",
      });
    }
    return err("Las licencias permanentes no tienen un vencimiento mensual.", "NOT_RECURRING");
  }

  const openBalance =
    license.balance_ars != null && license.balance_ars > 0
      ? license.balance_ars
      : monthlyFee(license);
  const due = openBalance;
  if (due <= 0) return err("Esta licencia no tiene un importe para cobrar.", "NOTHING_DUE");

  const annualFee = prepaid ? Math.round(monthlyFee(license) * prepaid.months) : 0;
  const addDays = prepaid ? prepaid.days : body.days ?? (body.months ?? 1) * 30;
  const periods = Math.max(1, Math.round(addDays / 30));
  const amount = annual
    ? Math.round(Number(body.amount_ars ?? annualFee))
    : detailed
      ? Math.round(Number(body.amount_ars))
      : monthlyFee(license) * periods;
  if (!Number.isFinite(amount) || amount <= 0) {
    return err("El importe tiene que ser mayor a cero.", "BAD_AMOUNT");
  }
  if (prepaid && amount < annualFee) {
    return err(
      `El pago ${prepaid.name} es de $${annualFee.toLocaleString("es-AR")}.`,
      "ANNUAL_AMOUNT",
    );
  }
  if (detailed && !annual && amount > due) {
    return err(
      `El importe supera el saldo de $${due.toLocaleString("es-AR")}.`,
      "AMOUNT_TOO_HIGH",
    );
  }

  const paid = parsePaidAt(body.paid_at);
  if ("error" in paid) return err(paid.error, "BAD_DATE");

  const methods = new Set(["efectivo", "transferencia", "mercadopago", "otro"]);
  const method = (body.method ?? "otro").trim().toLowerCase();
  if (!methods.has(method)) return err("Medio de pago inválido.", "BAD_METHOD");

  const partial = detailed && !annual ? amount < due : false;
  const coveredDays = annual || !detailed ? addDays : 30;
  const now = new Date().toISOString();
  let expiresAt = license.expires_at;
  let daysAdded = 0;
  if (!partial) {
    const base =
      license.expires_at && new Date(license.expires_at) > new Date()
        ? new Date(license.expires_at)
        : new Date();
    base.setUTCDate(base.getUTCDate() + coveredDays);
    expiresAt = base.toISOString();
    daysAdded = coveredDays;
  }

  const period = prepaid
    ? paymentPeriod(license, undefined, undefined, expiresAt, prepaid.days)
    : paymentPeriod(license, body.period_start, body.period_end, partial ? null : expiresAt);
  const note =
    [prepaid?.label ?? null, body.note?.trim() || null]
      .filter(Boolean)
      .join(" · ") || null;
  const paymentId = uuid();

  const dup = await env.DB.prepare(
    `SELECT id FROM license_payments
     WHERE license_id = ?1 AND amount_ars = ?2 AND substr(paid_at, 1, 16) = ?3
       AND ifnull(period_start, '') = ?4`,
  )
    .bind(license.id, amount, paid.iso.slice(0, 16), period.start ?? "")
    .first<{ id: string }>();
  if (dup) {
    return err("Ese pago ya está registrado para esta licencia.", "DUPLICATE_PAYMENT", 409);
  }

  const balance = partial ? due - amount : 0;
  const stmts = [
    env.DB.prepare(
      `INSERT INTO license_payments (
         id, license_id, amount_ars, paid_at, method, period_start, period_end, note, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    ).bind(paymentId, license.id, amount, paid.iso, method, period.start, period.end, note, now),
  ];
  if (partial) {
    stmts.push(
      env.DB.prepare(
        `UPDATE licenses SET last_paid_at = ?1, updated_at = ?1, balance_ars = ?2
         WHERE license_key = ?3`,
      ).bind(paid.iso, balance, key),
    );
  } else {
    stmts.push(
      env.DB.prepare(
        `UPDATE licenses SET billing_type = 'monthly', expires_at = ?1,
         last_paid_at = ?2, updated_at = ?3, revoked = 0, balance_ars = 0
         WHERE license_key = ?4`,
      ).bind(expiresAt, paid.iso, now, key),
    );
  }
  await env.DB.batch(stmts);

  const updated = await findLicense(env, key);
  const enriched = updated ? await enrichLicense(env, updated) : null;
  return json({
    ok: true,
    license_key: key,
    expires_at: enriched?.expires_at ?? expiresAt,
    days_added: daysAdded,
    last_paid_at: enriched?.last_paid_at ?? paid.iso,
    payment_id: paymentId,
    partial,
    balance_ars: enriched?.balance_ars ?? balance,
    payment_status: enriched?.payment_status ?? null,
    message: partial
      ? `Pago parcial. Queda un saldo de $${balance.toLocaleString("es-AR")}. El vencimiento no cambió.`
      : `Pago registrado${license.revoked ? " y licencia desbloqueada" : ""}. Vence el ${expiresAt ? new Date(expiresAt).toLocaleDateString("es-AR") : "—"}.`,
  });
}

function parsePaidAt(raw: string | undefined): { iso: string; day: string } | { error: string } {
  const text = (raw ?? "").trim();
  const now = new Date();
  let date: Date;
  if (!text) date = now;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(text)) date = new Date(`${text}T15:00:00.000Z`);
  else date = new Date(text);
  if (Number.isNaN(date.getTime())) return { error: "Fecha de pago inválida" };
  const art = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  if (art.format(date) > art.format(now)) return { error: "La fecha de pago no puede ser futura" };
  return { iso: date.toISOString(), day: art.format(date) };
}

function paymentPeriod(
  license: LicenseRow,
  startRaw: string | undefined,
  endRaw: string | undefined,
  grantedExpires: string | null,
  spanDays = 30,
): { start: string | null; end: string | null } {
  const start = (startRaw ?? "").trim();
  const end = (endRaw ?? "").trim();
  if (start || end) {
    return {
      start: start ? new Date(`${start}T15:00:00.000Z`).toISOString() : null,
      end: end ? new Date(`${end}T15:00:00.000Z`).toISOString() : null,
    };
  }
  if (grantedExpires) {
    const exp = new Date(grantedExpires);
    const from = new Date(exp);
    from.setUTCDate(from.getUTCDate() - spanDays);
    return { start: from.toISOString(), end: exp.toISOString() };
  }
  if (license.expires_at) {
    const exp = new Date(license.expires_at);
    const from = new Date(exp);
    from.setUTCDate(from.getUTCDate() - 30);
    return { start: from.toISOString(), end: exp.toISOString() };
  }
  return { start: null, end: null };
}

async function handleAdminUpdate(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const body = (await req.json()) as {
    license_key?: string;
    client_name?: string;
    client_phone?: string;
    buyer_note?: string;
    amount_ars?: number;
    plan?: Plan;
    max_devices?: number;
    billing?: "perpetual" | "monthly";
    months?: number;
    days?: number;
    /** Inicio del ciclo: recalcula expires_at = period_start + days/months. */
    period_start?: string;
    /** Vencimiento absoluto; tiene prioridad sobre period_start. */
    expires_at?: string;
  };
  const key = body.license_key?.trim().toUpperCase();
  if (!key) return err("Falta license_key", "BAD_REQUEST");
  const license = await findLicense(env, key);
  if (!license) return err("Licencia no encontrada", "NOT_FOUND", 404);

  let plan = (body.plan ?? license.plan) as Plan;
  if (plan !== "basic" && plan !== "pro" && plan !== "free") {
    return err("Plan inválido", "BAD_PLAN");
  }

  let billing =
    body.billing ??
    (license.billing_type === "monthly" ? "monthly" : "perpetual");
  if (body.billing != null && body.billing !== "perpetual" && body.billing !== "monthly") {
    return err("billing inválido (perpetual|monthly)", "BAD_BILLING");
  }
  if (plan === "free") billing = "perpetual";

  const maxDevices = body.max_devices ?? license.max_devices;
  if (maxDevices < 1 || maxDevices > 20) {
    return err("max_devices debe ser entre 1 y 20", "BAD_DEVICES");
  }

  const amount =
    plan === "free"
      ? 0
      : body.amount_ars ?? license.amount_ars ?? defaultAmount(plan, billing);

  const now = new Date().toISOString();
  const billingChanged = billing !== (license.billing_type ?? "perpetual");
  const wasFree = license.plan === "free";
  const hasDateOverride =
    (body.period_start != null && String(body.period_start).trim() !== "") ||
    (body.expires_at != null && String(body.expires_at).trim() !== "");
  const upgradingToMonthly =
    billing === "monthly" &&
    plan !== "free" &&
    (billingChanged || wasFree || !license.expires_at);

  let expiresAt: string | null = license.expires_at ?? null;
  let lastPaidAt: string | null = license.last_paid_at ?? null;
  let periodStartIso: string | null = null;

  if (billing === "perpetual" || plan === "free") {
    expiresAt = null;
    if (plan === "free") lastPaidAt = null;
  } else if (hasDateOverride) {
    // Admin ajusta inicio de ciclo o vencimiento (ej. dar clave hoy, ciclo desde oct 1).
    const resolved = resolveMonthlyExpiry({
      expires_at: body.expires_at,
      period_start: body.period_start,
      days: body.days,
      months: body.months,
      fromNow: false,
    });
    if ("error" in resolved) return err(resolved.error, "BAD_DATE");
    expiresAt = resolved.expiresAt;
    periodStartIso = resolved.periodStart;
    if (!lastPaidAt) lastPaidAt = now;
  } else if (upgradingToMonthly) {
    // Gratis/perpetual → mensual: arranca ciclo de 30 días (o days/months del body).
    const resolved = resolveMonthlyExpiry({
      days: body.days,
      months: body.months,
      fromNow: true,
    });
    if ("error" in resolved) return err(resolved.error, "BAD_DATE");
    expiresAt = resolved.expiresAt;
    lastPaidAt = now;
  }
  // Si ya era mensual con vence y no mandaron fechas, no tocar expires_at
  // (usar /admin/pay para renovar).

  await env.DB.prepare(
    `UPDATE licenses SET client_name = ?1, client_phone = ?2, buyer_note = ?3,
     amount_ars = ?4, plan = ?5, max_devices = ?6, billing_type = ?7,
     expires_at = ?8, last_paid_at = ?9, updated_at = ?10
     WHERE license_key = ?11`,
  )
    .bind(
      body.client_name !== undefined
        ? body.client_name.trim() || null
        : license.client_name ?? null,
      body.client_phone !== undefined
        ? body.client_phone.trim() || null
        : license.client_phone ?? null,
      body.buyer_note !== undefined
        ? body.buyer_note.trim() || null
        : license.buyer_note ?? null,
      amount,
      plan,
      maxDevices,
      billing,
      expiresAt,
      lastPaidAt,
      now,
      key,
    )
    .run();

  const updated = await findLicense(env, key);
  if (!updated) return err("Error al actualizar", "INTERNAL", 500);
  return json({
    ok: true,
    license: await enrichLicense(env, updated),
    period_start: periodStartIso,
  });
}

async function handleAdminRevoke(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const body = (await req.json()) as { license_key?: string };
  const key = body.license_key?.trim().toUpperCase();
  if (!key) return err("Falta license_key", "BAD_REQUEST");
  await env.DB.prepare(
    "UPDATE licenses SET revoked = 1, updated_at = ?1 WHERE license_key = ?2",
  )
    .bind(new Date().toISOString(), key)
    .run();
  return json({ ok: true, revoked: key });
}

async function handleAdminUnrevoke(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const body = (await req.json()) as { license_key?: string };
  const key = body.license_key?.trim().toUpperCase();
  if (!key) return err("Falta license_key", "BAD_REQUEST");
  await env.DB.prepare(
    "UPDATE licenses SET revoked = 0, updated_at = ?1 WHERE license_key = ?2",
  )
    .bind(new Date().toISOString(), key)
    .run();
  return json({ ok: true, unrevoked: key });
}

async function handleAdminDelete(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const body = (await req.json()) as { license_key?: string };
  const key = body.license_key?.trim().toUpperCase();
  if (!key) return err("Falta license_key", "BAD_REQUEST");

  const license = await findLicense(env, key);
  if (!license) return err("Licencia no encontrada", "NOT_FOUND", 404);

  // Todo lo que cuelga de la licencia: con foreign keys activas, si queda algo el DELETE falla.
  const dependents = [
    "license_payments",
    "activations",
    "portal_snapshots",
    "workshop_portal_snapshots",
    "menu_portal_snapshots",
    "menu_portal_orders",
    "menu_portal_mp_credentials",
    "menu_portal_photos",
    "menu_portal_tables",
    "menu_portal_table_requests",
    "menu_portal_waiters",
    "menu_portal_floor",
    "menu_portal_waiter_commands",
  ];
  for (const table of dependents) {
    try {
      await env.DB.prepare(`DELETE FROM ${table} WHERE license_id = ?1`).bind(license.id).run();
    } catch (e) {
      // Tabla que todavía no existe en esta base: no hay nada que borrar.
      if (!/no such table/i.test(String(e))) throw e;
    }
  }
  await env.DB.prepare("UPDATE accounts SET license_id = NULL, license_key = NULL WHERE license_id = ?1")
    .bind(license.id)
    .run();
  await env.DB.prepare("DELETE FROM licenses WHERE id = ?1").bind(license.id).run();

  return json({ ok: true, deleted: key });
}

async function handleAdminList(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "all";
  const pay = url.searchParams.get("pay") ?? "";
  const plan = url.searchParams.get("plan") ?? "";
  const paidMonth = url.searchParams.get("paid_month") === "1";
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "200", 10)));

  const rows = await env.DB.prepare(
    `SELECT id, license_key, plan, max_devices, buyer_note, created_at, revoked,
            billing_type, expires_at, client_name, client_phone, amount_ars,
            last_paid_at, updated_at, balance_ars
     FROM licenses ORDER BY created_at DESC LIMIT ?1`,
  )
    .bind(limit)
    .all<LicenseRow>();

  const sellerCodes = await sellerCodesByLicense(env.DB);
  let items = await Promise.all(
    (rows.results ?? []).map(async (r) => ({
      ...(await enrichLicense(env, r)),
      seller_code: sellerCodes.get(r.id) ?? null,
    })),
  );

  if (filter === "recurring") {
    items = items.filter(
      (it) =>
        it.billing_type === "monthly" &&
        !it.revoked &&
        it.plan !== "free" &&
        (it.status === "active" || it.status === "expiring"),
    );
  } else if (filter !== "all") {
    items = items.filter((it) => it.status === filter);
  }
  if (pay === "open") {
    items = items.filter(
      (it) =>
        it.status !== "expired" &&
        (it.payment_status === "pending" || it.payment_status === "partial"),
    );
  } else if (pay === "overdue") {
    const nowMs = Date.now();
    items = items.filter(
      (it) =>
        it.billing_type === "monthly" &&
        !!it.expires_at &&
        new Date(it.expires_at).getTime() < nowMs &&
        (it.balance_ars ?? 0) > 0,
    );
  } else if (pay) {
    items = items.filter((it) => it.payment_status === pay);
  }
  if (plan) {
    items = items.filter((it) => it.plan === plan);
  }
  if (paidMonth) {
    const range = artMonthRange();
    const paidRows = await env.DB.prepare(
      `SELECT DISTINCT license_id FROM license_payments
       WHERE paid_at >= ?1 AND paid_at < ?2`,
    )
      .bind(range.start, range.end)
      .all<{ license_id: string }>();
    const ids = new Set((paidRows.results ?? []).map((r) => r.license_id));
    items = items.filter((it) => ids.has(it.id));
  }
  if (q) {
    items = items.filter((it) => {
      const hay = [
        it.license_key,
        it.client_name,
        it.client_phone,
        it.buyer_note,
        it.seller_code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return json({ ok: true, licenses: items });
}

async function handleSellerCheck(req: Request, env: Env): Promise<Response> {
  const code = normalizeSellerCode(new URL(req.url).searchParams.get("code"));
  const seller = code ? await findActiveSeller(env.DB, code) : null;
  if (!seller) return err("Ese código de vendedor no existe. Revisalo o dejalo vacío.", "SELLER_NOT_FOUND", 404);
  return json({ ok: true, code: seller.code, name: seller.name });
}

async function handleSellerSignup(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { name?: string; phone?: string; model?: string } | null;
  if (!body) return err("JSON inválido", "BAD_JSON");
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const res = await signupSellerFromWeb(env.DB, body, ip);
  if (!res.ok) return err(res.message, "BAD_SELLER", res.status);
  return json(res);
}

async function handleAdminSellers(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const month = new URL(req.url).searchParams.get("month");
  return json({ ok: true, ...(await sellerReport(env.DB, month)) });
}

async function handleAdminSellerSave(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const res = await saveSeller(env.DB, (await req.json()) as Parameters<typeof saveSeller>[1]);
  if (!res.ok) return err(res.message, "BAD_SELLER");
  return json(res);
}

async function handleAdminSellerAssign(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const body = (await req.json()) as { license_key?: string; seller_code?: string };
  const key = body.license_key?.trim().toUpperCase();
  if (!key) return err("Falta license_key", "BAD_REQUEST");
  const license = await findLicense(env, key);
  if (!license) return err("Licencia no encontrada", "NOT_FOUND", 404);
  let code: string | null = null;
  if ((body.seller_code ?? "").trim()) {
    code = normalizeSellerCode(body.seller_code);
    const seller = code ? await findActiveSeller(env.DB, code) : null;
    if (!seller) return err("Ese código de vendedor no existe o está pausado.", "SELLER_NOT_FOUND", 404);
  }
  await env.DB.prepare("UPDATE licenses SET seller_code = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(code, new Date().toISOString(), license.id)
    .run();
  return json({ ok: true, license_key: key, seller_code: code });
}

async function handleAdminStats(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;

  const rows = await env.DB.prepare(
    `SELECT id, license_key, plan, max_devices, buyer_note, created_at, revoked,
            billing_type, expires_at, client_name, client_phone, amount_ars,
            last_paid_at, updated_at, balance_ars
     FROM licenses`,
  ).all<LicenseRow>();

  const all = await Promise.all((rows.results ?? []).map((r) => enrichLicense(env, r)));
  const monthly = all.filter((l) => l.billing_type === "monthly" && !l.revoked);
  const mrr = monthly
    .filter((l) => l.status === "active" || l.status === "expiring")
    .reduce((s, l) => s + (l.amount_ars ?? defaultAmount(l.plan)), 0);

  const [github, trials, opens, accountsRow, freeLicensesRow] = await Promise.all([
    fetchGithubDownloads(env),
    trialStats(env),
    openStats(env),
    env.DB.prepare(
      "SELECT COUNT(*) as c FROM accounts WHERE verified = 1",
    ).first<{ c: number }>(),
    env.DB.prepare(
      "SELECT COUNT(*) as c FROM licenses WHERE plan = 'free' AND revoked = 0",
    ).first<{ c: number }>(),
  ]);

  const range = artMonthRange();
  const collectedRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_ars), 0) as s FROM license_payments
     WHERE paid_at >= ?1 AND paid_at < ?2`,
  )
    .bind(range.start, range.end)
    .first<{ s: number }>();

  const billable = all.filter((l) => l.billing_type === "monthly" && l.plan !== "free");
  const pendingRows = billable.filter(
    (l) => !l.revoked && l.status !== "expired" && (l.balance_ars ?? 0) > 0,
  );
  const overdueRows = billable.filter(
    (l) => !!l.expires_at && new Date(l.expires_at).getTime() < Date.now() && (l.balance_ars ?? 0) > 0,
  );
  const expiringRows = billable.filter((l) => !l.revoked && l.status === "expiring");
  const brief = (rows: LicenseListItem[]) =>
    rows.slice(0, 8).map((l) => ({
      license_key: l.license_key,
      client_name: l.client_name,
      client_phone: l.client_phone,
      amount_due_ars: l.amount_due_ars,
      balance_ars: l.balance_ars,
      expires_at: l.expires_at,
      status: l.status,
      payment_status: l.payment_status,
    }));

  return json({
    ok: true,
    stats: {
      total: all.length,
      active_monthly: monthly.filter((l) => l.status === "active").length,
      expiring_soon: monthly.filter((l) => l.status === "expiring").length,
      expired: monthly.filter((l) => l.status === "expired").length,
      revoked: all.filter((l) => l.revoked).length,
      perpetual: all.filter((l) => l.status === "perpetual").length,
      free_licenses: freeLicensesRow?.c ?? 0,
      accounts_verified: accountsRow?.c ?? 0,
      estimated_mrr_ars: mrr,
      finance: {
        month_label: range.label,
        collected_month_ars: collectedRow?.s ?? 0,
        pending_ars: pendingRows.reduce((s, l) => s + (l.balance_ars ?? 0), 0),
        pending_count: pendingRows.length,
        overdue_ars: overdueRows.reduce((s, l) => s + (l.balance_ars ?? 0), 0),
        overdue_count: overdueRows.length,
        expiring_count: expiringRows.length,
        expiring_ars: expiringRows.reduce(
          (s, l) => s + (l.amount_ars ?? defaultAmount(l.plan)),
          0,
        ),
        recurring_active_ars: mrr,
      },
      attention: {
        expiring: brief(expiringRows),
        overdue: brief(overdueRows),
        pending: brief(pendingRows),
        blocked: brief(all.filter((l) => l.revoked)),
      },
      series: await analyticsSeries(env),
      demo: {
        github_downloads_total: github.total,
        github_downloads_releases: github.releases_with_installer,
        github_downloads_status: github.status,
        github_downloads_error: github.error ?? null,
        github_downloads_at: github.fetched_at,
        github_downloads_by_version: github.by_version,
        app_opens_total: opens.opens_total,
        app_opens_last_7d: opens.opens_last_7d,
        trials_total: trials.trials_total,
        trials_last_7d: trials.trials_last_7d,
        trials_converted: trials.trials_converted,
        trials_not_converted: Math.max(0, trials.trials_total - trials.trials_converted),
        conversion_pct: trials.conversion_pct,
      },
    },
  });
}

function fillDays(
  rows: Array<{ day: string; c: number }>,
  days: number,
): Array<{ day: string; count: number }> {
  const map = new Map(rows.map((r) => [String(r.day).slice(0, 10), Number(r.c) || 0]));
  const out: Array<{ day: string; count: number }> = [];
  let cursor = artDay(new Date());
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    keys.unshift(cursor);
    cursor = shiftArtDay(cursor, -1);
  }
  for (const key of keys) out.push({ day: key, count: map.get(key) ?? 0 });
  return out;
}

function artDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftArtDay(yyyyMmDd: string, delta: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 15));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return artDay(dt);
}

function compareWindow(
  series: Array<{ day: string; count: number }>,
  window: number,
  oldestDay: string | null,
): { current: number; previous: number | null } {
  const current = series.slice(-window).reduce((s, p) => s + p.count, 0);
  const prev = series.slice(-window * 2, -window);
  if (!oldestDay || prev.length < window || oldestDay > prev[0].day) {
    return { current, previous: null };
  }
  return { current, previous: prev.reduce((s, p) => s + p.count, 0) };
}

/** Series reales para la analítica. Sin días inventados de descargas. */
async function analyticsSeries(env: Env): Promise<Record<string, unknown> | null> {
  try {
    const since = shiftArtDay(artDay(new Date()), -89) + "T03:00:00.000Z";
    const [installs, accounts, undatedAccounts, oldestOpen, activeRow, payDays, payMonths, recentPays] =
      await Promise.all([
      env.DB.prepare(
        `SELECT date(first_opened_at, '-3 hours') as day, COUNT(*) as c
         FROM app_open_events
         WHERE first_opened_at >= ?1
         GROUP BY day`,
      ).bind(since).all<{ day: string; c: number }>(),
      env.DB.prepare(
        `SELECT date(verified_at, '-3 hours') as day, COUNT(*) as c
         FROM accounts
         WHERE verified = 1 AND verified_at IS NOT NULL AND verified_at >= ?1
         GROUP BY day`,
      ).bind(since).all<{ day: string; c: number }>(),
      env.DB.prepare(
        `SELECT
           SUM(CASE WHEN verified = 1 AND verified_at IS NULL THEN 1 ELSE 0 END) as c,
           MIN(CASE WHEN verified = 1 THEN date(verified_at, '-3 hours') END) as oldest
         FROM accounts`,
      ).first<{ c: number; oldest: string | null }>(),
      env.DB.prepare("SELECT MIN(date(first_opened_at, '-3 hours')) as d FROM app_open_events").first<{ d: string | null }>(),
      env.DB.prepare(
        `SELECT
           SUM(CASE WHEN last_opened_at >= ?1 THEN 1 ELSE 0 END) as d7,
           SUM(CASE WHEN last_opened_at >= ?2 THEN 1 ELSE 0 END) as d30,
           SUM(CASE WHEN last_opened_at >= ?3 THEN 1 ELSE 0 END) as d90
         FROM app_open_events`,
      )
        .bind(
          shiftArtDay(artDay(new Date()), -6) + "T03:00:00.000Z",
          shiftArtDay(artDay(new Date()), -29) + "T03:00:00.000Z",
          since,
        )
        .first<{ d7: number; d30: number; d90: number }>(),
      env.DB.prepare(
        `SELECT date(paid_at, '-3 hours') as day,
                SUM(amount_ars) as amount,
                COUNT(*) as c,
                COUNT(DISTINCT license_id) as licenses
         FROM license_payments
         WHERE paid_at >= ?1
         GROUP BY day`,
      ).bind(since).all<{ day: string; amount: number; c: number; licenses: number }>(),
      env.DB.prepare(
        `SELECT substr(date(paid_at, '-3 hours'), 1, 7) as month,
                SUM(amount_ars) as amount, COUNT(*) as c
         FROM license_payments GROUP BY month ORDER BY month`,
      ).all<{ month: string; amount: number; c: number }>(),
      env.DB.prepare(
        `SELECT p.amount_ars, p.paid_at, p.method, p.note, p.id, l.client_name
         FROM license_payments p
         JOIN licenses l ON l.id = p.license_id
         ORDER BY p.paid_at DESC LIMIT 12`,
      ).all(),
    ]);
    const paidWindows = await env.DB.prepare(
      `SELECT
         COUNT(DISTINCT CASE WHEN paid_at >= ?1 THEN license_id END) as l7,
         COUNT(DISTINCT CASE WHEN paid_at >= ?2 THEN license_id END) as l30,
         COUNT(DISTINCT CASE WHEN paid_at >= ?3 THEN license_id END) as l90,
         COALESCE(SUM(CASE WHEN paid_at >= ?1 THEN amount_ars END), 0) as a7,
         COALESCE(SUM(CASE WHEN paid_at >= ?2 THEN amount_ars END), 0) as a30,
         COALESCE(SUM(CASE WHEN paid_at >= ?3 THEN amount_ars END), 0) as a90
       FROM license_payments`,
    )
      .bind(
        shiftArtDay(artDay(new Date()), -6) + "T03:00:00.000Z",
        shiftArtDay(artDay(new Date()), -29) + "T03:00:00.000Z",
        since,
      )
      .first<{ l7: number; l30: number; l90: number; a7: number; a30: number; a90: number }>();
    const installSeries = fillDays(installs.results ?? [], 90);
    const accountSeries = fillDays(accounts.results ?? [], 90);
    const oldest = oldestOpen?.d ? String(oldestOpen.d).slice(0, 10) : null;
    const paySeries = fillDays(
      (payDays.results ?? []).map((r) => ({ day: r.day, c: Number(r.amount) || 0 })),
      90,
    );
    return {
      timezone: "America/Argentina/Buenos_Aires",
      installs: installSeries,
      accounts: accountSeries,
      accounts_without_date: Number(undatedAccounts?.c) || 0,
      downloads_daily: null,
      active_machines: {
        d7: Number(activeRow?.d7) || 0,
        d30: Number(activeRow?.d30) || 0,
        d90: Number(activeRow?.d90) || 0,
      },
      installs_compare: {
        d7: compareWindow(installSeries, 7, oldest),
        d30: compareWindow(installSeries, 30, oldest),
        d90: compareWindow(installSeries, 90, oldest),
      },
      accounts_compare: {
        d7: compareWindow(accountSeries, 7, undatedAccounts?.oldest ?? null),
        d30: compareWindow(accountSeries, 30, undatedAccounts?.oldest ?? null),
        d90: compareWindow(accountSeries, 90, undatedAccounts?.oldest ?? null),
      },
      collected_by_day: paySeries,
      payments_by_month: (payMonths.results ?? []).map((r) => ({
        month: r.month,
        amount: Number(r.amount) || 0,
        count: Number(r.c) || 0,
      })),
      paid_licenses_by_day: (payDays.results ?? []).map((r) => ({
        day: r.day,
        licenses: Number(r.licenses) || 0,
        payments: Number(r.c) || 0,
      })),
      recent_payments: recentPays.results ?? [],
      paid_windows: {
        d7: { licenses: Number(paidWindows?.l7) || 0, amount: Number(paidWindows?.a7) || 0 },
        d30: { licenses: Number(paidWindows?.l30) || 0, amount: Number(paidWindows?.a30) || 0 },
        d90: { licenses: Number(paidWindows?.l90) || 0, amount: Number(paidWindows?.a90) || 0 },
      },
      fetched_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("analyticsSeries", error);
    return null;
  }
}

async function handleAdminPayments(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const url = new URL(req.url);
  const key = url.searchParams.get("license_key")?.trim().toUpperCase() ?? "";
  if (!key) {
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "80", 10)));
    const rows = await env.DB.prepare(
      `SELECT p.id, p.amount_ars, p.paid_at, p.method, p.period_start, p.period_end, p.note,
              l.license_key, l.client_name, l.client_phone
       FROM license_payments p
       JOIN licenses l ON l.id = p.license_id
       ORDER BY p.paid_at DESC
       LIMIT ?1`,
    )
      .bind(limit)
      .all();
    return json({ ok: true, payments: rows.results ?? [] });
  }
  const license = await findLicense(env, key);
  if (!license) return err("Licencia no encontrada", "NOT_FOUND", 404);
  const enriched = await enrichLicense(env, license);
  const rows = await env.DB.prepare(
    `SELECT id, amount_ars, paid_at, method, period_start, period_end, note, created_at
     FROM license_payments WHERE license_id = ?1 ORDER BY paid_at DESC, created_at DESC`,
  )
    .bind(license.id)
    .all();
  return json({
    ok: true,
    license: enriched,
    payments: rows.results ?? [],
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
      return portalOptions(req);
    }

    const url = new URL(req.url);
    try {
      // Privacidad / LGPD — exigidos por Tienda Nube Partners (responden 200).
      if (
        req.method === "POST" &&
        (url.pathname === "/v1/tiendanube/privacy/store-redact" ||
          url.pathname === "/v1/tiendanube/privacy/customers-redact" ||
          url.pathname === "/v1/tiendanube/privacy/customers-data-request")
      ) {
        let body: unknown = null;
        try {
          body = await req.json();
        } catch {
          body = null;
        }
        console.log("tn_privacy_webhook", url.pathname, body);
        return json({ ok: true, received: true }, 200);
      }

      if (req.method === "POST" && url.pathname === "/v1/activate") {
        return handleActivate(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/validate") {
        return handleValidate(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/trial/start") {
        return handleTrialStart(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/trial/bi-token") {
        return handleTrialBiToken(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/telemetry/open") {
        return handleTelemetryOpen(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/register") {
        return handleAuthRegister(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/verify") {
        return handleAuthVerify(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/resend") {
        return handleAuthResend(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/login") {
        return handleAuthLogin(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/forgot") {
        return handleAuthForgot(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/reset") {
        return handleAuthReset(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/portal/login") {
        return handlePortalLogin(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/portal/logout") {
        return handlePortalLogout(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/portal/me") {
        return handlePortalMe(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/portal/push") {
        return handlePortalPush(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/portal/dashboard") {
        return handlePortalDashboard(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/portal/interpret") {
        return handlePortalInterpret(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/workshop-portal/push") {
        return handleWorkshopPortalPush(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/workshop-portal/info") {
        return handleWorkshopPortalInfo(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/workshop-portal/lookup") {
        return handleWorkshopPortalLookup(req, env);
      }
      if (req.method === "OPTIONS" && url.pathname.startsWith("/v1/workshop-portal/")) {
        return workshopPortalOptions(req);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/push") {
        return handleMenuPortalPush(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/menu-portal/info") {
        return handleMenuPortalInfo(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/order") {
        return handleMenuPortalOrderCreate(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/orders/pull") {
        return handleMenuPortalOrdersPull(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/orders/update") {
        return handleMenuPortalOrdersUpdate(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/menu-portal/order/status") {
        return handleMenuPortalOrderStatus(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/mp/credentials") {
        return handleMenuPortalMpCredentials(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/mp/webhook") {
        return handleMenuPortalMpWebhook(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/photos") {
        return handleMenuPortalPhotos(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/menu-portal/photo") {
        return handleMenuPortalPhoto(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/tables/sync") {
        return handleMenuPortalTablesSync(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/table") {
        return handleMenuPortalTableRequest(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/menu-portal/table/status") {
        return handleMenuPortalTableStatus(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/waiters/manage") {
        return handleMenuPortalWaitersManage(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/waiters/sync") {
        return handleMenuPortalWaitersSync(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/menu-portal/waiter/state") {
        return handleWaiterState(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/menu-portal/waiter/menu") {
        return handleWaiterMenu(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/menu-portal/waiter/command") {
        return handleWaiterCommand(req, env);
      }
      if (req.method === "OPTIONS" && url.pathname.startsWith("/v1/menu-portal/")) {
        return menuPortalOptions(req);
      }
      if (req.method === "POST" && url.pathname === "/admin/create") {
        return handleAdminCreate(req, env);
      }
      if (req.method === "POST" && url.pathname === "/admin/extend") {
        return handleAdminExtend(req, env);
      }
      if (req.method === "POST" && url.pathname === "/admin/revoke") {
        return handleAdminRevoke(req, env);
      }
      if (req.method === "POST" && url.pathname === "/admin/unrevoke") {
        return handleAdminUnrevoke(req, env);
      }
      if (req.method === "POST" && url.pathname === "/admin/delete") {
        return handleAdminDelete(req, env);
      }
      if (req.method === "POST" && url.pathname === "/admin/pay") {
        return handleAdminPay(req, env);
      }
      if (req.method === "POST" && url.pathname === "/admin/update") {
        return handleAdminUpdate(req, env);
      }
      if (req.method === "GET" && url.pathname === "/admin/list") {
        return handleAdminList(req, env);
      }
      if (req.method === "GET" && url.pathname === "/admin/stats") {
        return handleAdminStats(req, env);
      }
      if (req.method === "GET" && url.pathname === "/admin/payments") {
        return handleAdminPayments(req, env);
      }
      if (req.method === "GET" && url.pathname === "/admin/trials") {
        return handleAdminTrials(req, env);
      }
      if (req.method === "GET" && url.pathname === "/admin/sellers") {
        return handleAdminSellers(req, env);
      }
      if (req.method === "POST" && url.pathname === "/admin/sellers/save") {
        return handleAdminSellerSave(req, env);
      }
      if (req.method === "POST" && url.pathname === "/admin/sellers/assign") {
        return handleAdminSellerAssign(req, env);
      }
      if (req.method === "GET" && url.pathname === "/v1/seller") {
        return handleSellerCheck(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/seller/signup") {
        return handleSellerSignup(req, env);
      }
      if (req.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "gestion-comercios-license" });
      }
      return err("Ruta no encontrada", "NOT_FOUND", 404);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error interno";
      return err(msg, "INTERNAL", 500);
    }
  },
};
