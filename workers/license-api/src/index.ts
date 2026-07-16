export interface Env {
  DB: D1Database;
  LICENSE_PRIVATE_KEY_B64: string;
  LICENSE_ADMIN_SECRET: string;
  LICENSE_PUBLIC_KEY_HEX: string;
}

type Plan = "basic" | "pro";

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
}

interface LicenseListItem extends LicenseRow {
  activations: number;
  status: "active" | "expiring" | "expired" | "revoked" | "perpetual";
  days_left: number | null;
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
            last_paid_at, updated_at
     FROM licenses WHERE license_key = ?1`,
  )
    .bind(key.trim().toUpperCase())
    .first<LicenseRow>();
  return row;
}

function defaultAmount(plan: Plan): number {
  return plan === "pro" ? 50_000 : 35_000;
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

async function enrichLicense(env: Env, row: LicenseRow): Promise<LicenseListItem> {
  const activations = await countActivations(env, row.id);
  return {
    ...row,
    activations,
    status: licenseStatus(row),
    days_left: daysLeft(row),
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

async function countActivations(env: Env, licenseId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM activations WHERE license_id = ?1",
  )
    .bind(licenseId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

async function fetchGithubDownloads(): Promise<{
  total: number;
  releases_with_installer: number;
}> {
  try {
    let total = 0;
    let releasesWithInstaller = 0;
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `https://api.github.com/repos/Walphur/gestion-comercios/releases?per_page=100&page=${page}`,
        { headers: { "User-Agent": "waltech-license-worker", Accept: "application/vnd.github+json" } },
      );
      if (!res.ok) break;
      const releases = (await res.json()) as Array<{
        tag_name: string;
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
        if (releaseInstallers > 0) releasesWithInstaller += 1;
        total += releaseInstallers;
      }
      if (releases.length < 100) break;
    }
    return { total, releases_with_installer: releasesWithInstaller };
  } catch {
    return { total: 0, releases_with_installer: 0 };
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
  const convertedRow = await env.DB.prepare(
    `SELECT COUNT(DISTINCT t.machine_id) as c
     FROM trial_events t
     INNER JOIN activations a ON a.machine_id = t.machine_id`,
  ).first<{ c: number }>();

  const trialsTotal = totalRow?.c ?? 0;
  const trialsConverted = convertedRow?.c ?? 0;
  const conversionPct =
    trialsTotal > 0 ? Math.round((trialsConverted / trialsTotal) * 1000) / 10 : 0;

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
    client_name?: string;
    client_phone?: string;
    amount_ars?: number;
  };
  const plan = body.plan ?? "basic";
  if (plan !== "basic" && plan !== "pro") return err("Plan inválido", "BAD_PLAN");
  const maxDevices =
    body.max_devices ?? (plan === "pro" ? 3 : 1);
  if (maxDevices < 1 || maxDevices > 20) {
    return err("max_devices debe ser entre 1 y 20", "BAD_DEVICES");
  }
  const billing = body.billing ?? "perpetual";
  let expiresAt: string | null = null;
  if (billing === "monthly") {
    const months = body.months ?? 1;
    const days = body.days ?? months * 30;
    expiresAt = addDaysIso(days);
  }
  const licenseKey = (body.license_key ?? randomKey()).trim().toUpperCase();
  const id = uuid();
  const now = new Date().toISOString();
  const amount = body.amount_ars ?? (billing === "monthly" ? defaultAmount(plan) : null);
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
  };
  const key = body.license_key?.trim().toUpperCase();
  if (!key) return err("Falta license_key", "BAD_REQUEST");
  const license = await findLicense(env, key);
  if (!license) return err("Licencia no encontrada", "NOT_FOUND", 404);

  const addDays = body.days ?? (body.months ?? 1) * 30;
  const result = await extendLicense(env, license, addDays, true);

  if (body.amount_ars != null && body.amount_ars > 0) {
    await env.DB.prepare("UPDATE licenses SET amount_ars = ?1 WHERE license_key = ?2")
      .bind(body.amount_ars, key)
      .run();
  }

  const updated = await findLicense(env, key);
  return json({
    ok: true,
    license_key: key,
    ...result,
    last_paid_at: updated?.last_paid_at,
    message: "Pago registrado y suscripción renovada",
  });
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
  };
  const key = body.license_key?.trim().toUpperCase();
  if (!key) return err("Falta license_key", "BAD_REQUEST");
  const license = await findLicense(env, key);
  if (!license) return err("Licencia no encontrada", "NOT_FOUND", 404);

  const plan = body.plan ?? license.plan;
  const maxDevices = body.max_devices ?? license.max_devices;
  await env.DB.prepare(
    `UPDATE licenses SET client_name = ?1, client_phone = ?2, buyer_note = ?3,
     amount_ars = ?4, plan = ?5, max_devices = ?6, updated_at = ?7
     WHERE license_key = ?8`,
  )
    .bind(
      body.client_name?.trim() ?? license.client_name ?? null,
      body.client_phone?.trim() ?? license.client_phone ?? null,
      body.buyer_note?.trim() ?? license.buyer_note ?? null,
      body.amount_ars ?? license.amount_ars ?? defaultAmount(plan),
      plan,
      maxDevices,
      new Date().toISOString(),
      key,
    )
    .run();

  const updated = await findLicense(env, key);
  if (!updated) return err("Error al actualizar", "INTERNAL", 500);
  return json({ ok: true, license: await enrichLicense(env, updated) });
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

  await env.DB.prepare("DELETE FROM activations WHERE license_id = ?1")
    .bind(license.id)
    .run();
  await env.DB.prepare("DELETE FROM licenses WHERE license_key = ?1").bind(key).run();

  return json({ ok: true, deleted: key });
}

async function handleAdminList(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "all";
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "200", 10)));

  const rows = await env.DB.prepare(
    `SELECT id, license_key, plan, max_devices, buyer_note, created_at, revoked,
            billing_type, expires_at, client_name, client_phone, amount_ars,
            last_paid_at, updated_at
     FROM licenses ORDER BY created_at DESC LIMIT ?1`,
  )
    .bind(limit)
    .all<LicenseRow>();

  let items = await Promise.all((rows.results ?? []).map((r) => enrichLicense(env, r)));

  if (filter !== "all") {
    items = items.filter((it) => it.status === filter);
  }
  if (q) {
    items = items.filter((it) => {
      const hay = [
        it.license_key,
        it.client_name,
        it.client_phone,
        it.buyer_note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return json({ ok: true, licenses: items });
}

async function handleAdminStats(req: Request, env: Env): Promise<Response> {
  const denied = requireAdmin(req, env);
  if (denied) return denied;

  const rows = await env.DB.prepare(
    `SELECT id, license_key, plan, max_devices, buyer_note, created_at, revoked,
            billing_type, expires_at, client_name, client_phone, amount_ars,
            last_paid_at, updated_at
     FROM licenses`,
  ).all<LicenseRow>();

  const all = await Promise.all((rows.results ?? []).map((r) => enrichLicense(env, r)));
  const monthly = all.filter((l) => l.billing_type === "monthly" && !l.revoked);
  const mrr = monthly
    .filter((l) => l.status === "active" || l.status === "expiring")
    .reduce((s, l) => s + (l.amount_ars ?? defaultAmount(l.plan)), 0);

  const [github, trials, opens] = await Promise.all([
    fetchGithubDownloads(),
    trialStats(env),
    openStats(env),
  ]);

  return json({
    ok: true,
    stats: {
      total: all.length,
      active_monthly: monthly.filter((l) => l.status === "active").length,
      expiring_soon: monthly.filter((l) => l.status === "expiring").length,
      expired: monthly.filter((l) => l.status === "expired").length,
      revoked: all.filter((l) => l.revoked).length,
      perpetual: all.filter((l) => l.status === "perpetual").length,
      estimated_mrr_ars: mrr,
      demo: {
        github_downloads_total: github.total,
        github_downloads_releases: github.releases_with_installer,
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
        },
      });
    }

    const url = new URL(req.url);
    try {
      if (req.method === "POST" && url.pathname === "/v1/activate") {
        return handleActivate(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/validate") {
        return handleValidate(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/trial/start") {
        return handleTrialStart(req, env);
      }
      if (req.method === "POST" && url.pathname === "/v1/telemetry/open") {
        return handleTelemetryOpen(req, env);
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
      if (req.method === "GET" && url.pathname === "/admin/trials") {
        return handleAdminTrials(req, env);
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
