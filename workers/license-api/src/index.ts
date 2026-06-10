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
}

interface ActivationRow {
  id: string;
  license_id: string;
  machine_id: string;
  device_name: string | null;
  activated_at: string;
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
    "SELECT id, license_key, plan, max_devices, buyer_note, created_at, revoked FROM licenses WHERE license_key = ?1",
  )
    .bind(key.trim().toUpperCase())
    .first<LicenseRow>();
  return row;
}

async function countActivations(env: Env, licenseId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM activations WHERE license_id = ?1",
  )
    .bind(licenseId)
    .first<{ c: number }>();
  return row?.c ?? 0;
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
  };
  const token = await signToken(env, payload);
  return json({
    ok: true,
    token,
    plan: license.plan,
    pro: license.plan === "pro",
    max_devices: license.max_devices,
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
    "SELECT id, license_key, plan, max_devices, buyer_note, created_at, revoked FROM licenses WHERE id = ?1",
  )
    .bind(payload.lid)
    .first<LicenseRow>();

  if (!license || license.revoked) {
    return err("Licencia revocada o inexistente", "REVOKED", 403);
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
  });

  return json({ ok: true, valid: true, token: renewed });
}

async function handleAdminCreate(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env.LICENSE_ADMIN_SECRET}`) {
    return err("No autorizado", "UNAUTHORIZED", 401);
  }
  const body = (await req.json()) as {
    plan?: Plan;
    max_devices?: number;
    buyer_note?: string;
    license_key?: string;
  };
  const plan = body.plan ?? "basic";
  if (plan !== "basic" && plan !== "pro") return err("Plan inválido", "BAD_PLAN");
  const maxDevices =
    body.max_devices ?? (plan === "pro" ? 3 : 1);
  if (maxDevices < 1 || maxDevices > 20) {
    return err("max_devices debe ser entre 1 y 20", "BAD_DEVICES");
  }
  const licenseKey = (body.license_key ?? randomKey()).trim().toUpperCase();
  const id = uuid();
  await env.DB.prepare(
    "INSERT INTO licenses (id, license_key, plan, max_devices, buyer_note, created_at, revoked) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)",
  )
    .bind(id, licenseKey, plan, maxDevices, body.buyer_note ?? null, new Date().toISOString())
    .run();

  return json({
    ok: true,
    license_key: licenseKey,
    plan,
    max_devices: maxDevices,
    id,
  });
}

async function handleAdminRevoke(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env.LICENSE_ADMIN_SECRET}`) {
    return err("No autorizado", "UNAUTHORIZED", 401);
  }
  const body = (await req.json()) as { license_key?: string };
  const key = body.license_key?.trim().toUpperCase();
  if (!key) return err("Falta license_key", "BAD_REQUEST");
  await env.DB.prepare("UPDATE licenses SET revoked = 1 WHERE license_key = ?1").bind(key).run();
  return json({ ok: true, revoked: key });
}

async function handleAdminList(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env.LICENSE_ADMIN_SECRET}`) {
    return err("No autorizado", "UNAUTHORIZED", 401);
  }
  const rows = await env.DB.prepare(
    "SELECT id, license_key, plan, max_devices, buyer_note, created_at, revoked FROM licenses ORDER BY created_at DESC LIMIT 100",
  ).all<LicenseRow>();
  return json({ ok: true, licenses: rows.results ?? [] });
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
      if (req.method === "POST" && url.pathname === "/admin/create") {
        return handleAdminCreate(req, env);
      }
      if (req.method === "POST" && url.pathname === "/admin/revoke") {
        return handleAdminRevoke(req, env);
      }
      if (req.method === "GET" && url.pathname === "/admin/list") {
        return handleAdminList(req, env);
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
