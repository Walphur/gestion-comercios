/**
 * Fase 4E-1 — auth bridge WP1 + PBS1 service identity + interpret stub.
 * Run: npx tsx scripts/run-portal-fase4e1-tests.ts
 */
import assert from "node:assert/strict";
import {
  mintPortalServiceToken,
  verifyPortalServiceToken,
  PORTAL_SERVICE_ISS,
  PORTAL_SERVICE_AUD,
  PORTAL_SERVICE_NAME,
  PORTAL_SERVICE_MAX_TTL_SECS,
  PORTAL_SERVICE_TOKEN_PREFIX,
} from "../workers/license-api/src/portalServiceAuth.ts";
import { verifyPortalServiceToken as verifyBiIa } from "../workers/bi-ia/src/portalServiceAuth.ts";
import {
  mintSession,
  handlePortalInterpret,
  parsePortalInterpretHints,
  type PortalEnv,
} from "../workers/license-api/src/portal.ts";
import { hasBusinessIntelligence, assertMachineMatch } from "../workers/bi-ia/src/licenseAuth.ts";

const SECRET = "test-portal-bi-service-secret-32b";
const ADMIN = "test-license-admin-secret-32bytes!!";

const AID_A = "account-aaaa-1111";
const LID_A = "license-aaaa-1111";
const AID_B = "account-bbbb-2222";
const LID_B = "license-bbbb-2222";

let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log("PASS", name);
    } catch (e) {
      failed += 1;
      console.error("FAIL", name, e instanceof Error ? e.message : e);
    }
  })();
}

function mockBiIaOk(): typeof fetch {
  return async () =>
    new Response(
      JSON.stringify({
        ok: true,
        summary: "Resumen de prueba del portal.",
        insights: ["Observación segura"],
        recommendations: ["Revisá el stock crítico"],
        uncertainty: ["Los datos pueden estar demorados"],
        engine: "workers-ai",
        model: "test-model",
        payload_version: "portal-1",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
}

function mockEnv(opts: {
  snapshots?: Record<string, { payload: string; device_name: string; updated_at: string }>;
  serviceSecret?: string | undefined;
  biIaFetch?: typeof fetch;
}): PortalEnv {
  const snapshots = opts.snapshots ?? {};
  return {
    LICENSE_ADMIN_SECRET: ADMIN,
    LICENSE_PUBLIC_KEY_HEX: "00",
    PORTAL_BI_SERVICE_SECRET: opts.serviceSecret,
    PORTAL_BI_IA_URL: "https://bi-ia.test",
    portalBiIaFetch: opts.biIaFetch ?? mockBiIaOk(),
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async first() {
                if (sql.includes("FROM portal_snapshots WHERE license_id")) {
                  const lid = String(args[0]);
                  return snapshots[lid] ?? null;
                }
                if (sql.includes("FROM accounts WHERE id")) {
                  return { business_name: "Biz", name: "Owner" };
                }
                if (sql.includes("SELECT plan FROM licenses")) {
                  return { plan: "basic" };
                }
                // fallback join path — no rows
                return null;
              },
              async all() {
                return { results: [] };
              },
              async run() {
                return {};
              },
            };
          },
        };
      },
    },
  };
}

async function wp1(
  env: PortalEnv,
  account: { id: string; name: string; email: string; license_id: string },
) {
  return mintSession(env, account);
}

function interpretReq(token: string | null, body?: unknown) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "https://walqo.pro",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("https://example.test/v1/portal/interpret", {
    method: "POST",
    headers,
    body: body === undefined ? "{}" : JSON.stringify(body),
  });
}

await check("1. WP1 válido → interpret ready (mock bi-ia)", async () => {
  const env = mockEnv({
    snapshots: {
      [LID_A]: {
        payload: JSON.stringify({ sales_today_total: 10, business_name: "A" }),
        device_name: "PC",
        updated_at: "2026-09-17T00:00:00Z",
      },
    },
    serviceSecret: SECRET,
  });
  const token = await wp1(env, {
    id: AID_A,
    name: "A",
    email: "a@test.com",
    license_id: LID_A,
  });
  const res = await handlePortalInterpret(interpretReq(token, { period: "30d" }), env);
  assert.equal(res.status, 200);
  const data = (await res.json()) as Record<string, unknown>;
  assert.equal(data.ok, true);
  assert.equal(data.status, "interpreted");
  assert.equal(data.has_snapshot, true);
  assert.equal(data.period, "30d");
  assert.equal(data.payload_version, "portal-1");
  assert.equal(typeof data.summary, "string");
  const text = JSON.stringify(data);
  assert.ok(!text.includes(SECRET));
  assert.ok(!text.includes("PBS1."));
  assert.ok(!text.includes("machine_id"));
});

await check("2. WP1 ausente → 401", async () => {
  const env = mockEnv({ serviceSecret: SECRET });
  const res = await handlePortalInterpret(interpretReq(null), env);
  assert.equal(res.status, 401);
});

await check("3. WP1 inválido → 401", async () => {
  const env = mockEnv({ serviceSecret: SECRET });
  const res = await handlePortalInterpret(interpretReq("WP1.bad.token"), env);
  assert.equal(res.status, 401);
});

await check("4. WP1 expirado → 401", async () => {
  const env = mockEnv({ serviceSecret: SECRET });
  // Token con exp pasado: mint normal y manipular no es fácil; usar verifySession path
  // con payload firmado viejo via mint + reloj — construimos token expirado a mano.
  const { mintSession: _m } = await import("../workers/license-api/src/portal.ts");
  void _m;
  // Firmar payload expirado con ADMIN
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    aid: AID_A,
    lid: LID_A,
    email: "a@test.com",
    name: "A",
    iat: now - 100000,
    exp: now - 10,
  };
  const b64 = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const signed = `WP1.${b64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ADMIN),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const sig = Buffer.from(new Uint8Array(sigBuf))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const expired = `${signed}.${sig}`;
  const res = await handlePortalInterpret(interpretReq(expired), env);
  assert.equal(res.status, 401);
});

await check("5. account/license autorizado (sesión)", async () => {
  const env = mockEnv({
    snapshots: {
      [LID_A]: {
        payload: JSON.stringify({ sales_today_total: 1 }),
        device_name: "PC",
        updated_at: "2026-09-17T00:00:00Z",
      },
    },
    serviceSecret: SECRET,
  });
  const token = await wp1(env, {
    id: AID_A,
    name: "A",
    email: "a@test.com",
    license_id: LID_A,
  });
  const res = await handlePortalInterpret(interpretReq(token), env);
  const data = (await res.json()) as { has_snapshot?: boolean };
  assert.equal(data.has_snapshot, true);
});

await check("6. intento cambiar license_id en body → ignorado", async () => {
  const env = mockEnv({
    snapshots: {
      [LID_A]: {
        payload: JSON.stringify({ sales_today_total: 1 }),
        device_name: "PC",
        updated_at: "2026-09-17T00:00:00Z",
      },
      [LID_B]: {
        payload: JSON.stringify({ sales_today_total: 99999 }),
        device_name: "OTHER",
        updated_at: "2026-09-17T00:00:00Z",
      },
    },
    serviceSecret: SECRET,
  });
  const token = await wp1(env, {
    id: AID_A,
    name: "A",
    email: "a@test.com",
    license_id: LID_A,
  });
  const res = await handlePortalInterpret(
    interpretReq(token, { license_id: LID_B, lid: LID_B }),
    env,
  );
  const data = (await res.json()) as Record<string, unknown>;
  assert.equal(data.has_snapshot, true);
  // No leak de totales de B
  assert.ok(!JSON.stringify(data).includes("99999"));
});

await check("7. intento cambiar account_id en body → ignorado", async () => {
  const env = mockEnv({
    snapshots: {
      [LID_A]: {
        payload: JSON.stringify({ sales_today_total: 1 }),
        device_name: "PC",
        updated_at: "2026-09-17T00:00:00Z",
      },
    },
    serviceSecret: SECRET,
  });
  const token = await wp1(env, {
    id: AID_A,
    name: "A",
    email: "a@test.com",
    license_id: LID_A,
  });
  const res = await handlePortalInterpret(
    interpretReq(token, { account_id: AID_B, aid: AID_B }),
    env,
  );
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { ok: boolean }).ok, true);
});

await check("8. snapshot ausente → 404", async () => {
  const env = mockEnv({ serviceSecret: SECRET });
  const token = await wp1(env, {
    id: AID_A,
    name: "A",
    email: "a@test.com",
    license_id: LID_A,
  });
  const res = await handlePortalInterpret(interpretReq(token), env);
  assert.equal(res.status, 404);
  const data = (await res.json()) as { error?: string };
  assert.equal(data.error, "snapshot_empty");
});

await check("9. service token válido", async () => {
  const tok = await mintPortalServiceToken(SECRET, { aid: AID_A, lid: LID_A });
  assert.ok(tok.startsWith(PORTAL_SERVICE_TOKEN_PREFIX + "."));
  const v = await verifyPortalServiceToken(SECRET, tok);
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.claims.aid, AID_A);
    assert.equal(v.claims.lid, LID_A);
    assert.equal(v.claims.iss, PORTAL_SERVICE_ISS);
    assert.equal(v.claims.aud, PORTAL_SERVICE_AUD);
    assert.equal(v.claims.service, PORTAL_SERVICE_NAME);
  }
  // bi-ia verifier acepta el mismo token
  const v2 = await verifyBiIa(SECRET, tok);
  assert.equal(v2.ok, true);
});

await check("10. service token expirado", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await mintPortalServiceToken(SECRET, {
    aid: AID_A,
    lid: LID_A,
    ttlSecs: 30,
    nowSecs: now - 120,
  });
  const v = await verifyPortalServiceToken(SECRET, tok, now);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "expired");
});

await check("11. firma inválida", async () => {
  const tok = await mintPortalServiceToken(SECRET, { aid: AID_A, lid: LID_A });
  const bad = tok.slice(0, -4) + "xxxx";
  const v = await verifyPortalServiceToken(SECRET, bad);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "bad_signature");
});

await check("12. issuer inválido", async () => {
  const tok = await mintPortalServiceToken(SECRET, { aid: AID_A, lid: LID_A });
  const parts = tok.split(".");
  const payload = JSON.parse(
    Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
  );
  payload.iss = "evil";
  const body = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  // re-sign with secret so signature ok but issuer wrong
  const signed = `${PORTAL_SERVICE_TOKEN_PREFIX}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const sig = Buffer.from(new Uint8Array(sigBuf))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const v = await verifyPortalServiceToken(SECRET, `${signed}.${sig}`);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "bad_issuer");
});

await check("13. audience inválida", async () => {
  const tok = await mintPortalServiceToken(SECRET, { aid: AID_A, lid: LID_A });
  const parts = tok.split(".");
  const payload = JSON.parse(
    Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
  );
  payload.aud = "wrong";
  const body = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const signed = `${PORTAL_SERVICE_TOKEN_PREFIX}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const sig = Buffer.from(new Uint8Array(sigBuf))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const v = await verifyPortalServiceToken(SECRET, `${signed}.${sig}`);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "bad_audience");
});

await check("14. service inválido", async () => {
  const tok = await mintPortalServiceToken(SECRET, { aid: AID_A, lid: LID_A });
  const parts = tok.split(".");
  const payload = JSON.parse(
    Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
  );
  payload.service = "desktop";
  const body = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const signed = `${PORTAL_SERVICE_TOKEN_PREFIX}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const sig = Buffer.from(new Uint8Array(sigBuf))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const v = await verifyPortalServiceToken(SECRET, `${signed}.${sig}`);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "bad_service");
});

await check("15. aid/lid faltantes", async () => {
  await assert.rejects(() => mintPortalServiceToken(SECRET, { aid: "", lid: LID_A }));
  await assert.rejects(() => mintPortalServiceToken(SECRET, { aid: AID_A, lid: "x" }));
});

await check("16. TTL excesivo", async () => {
  await assert.rejects(() =>
    mintPortalServiceToken(SECRET, {
      aid: AID_A,
      lid: LID_A,
      ttlSecs: PORTAL_SERVICE_MAX_TTL_SECS + 1,
    }),
  );
});

await check("17. GC1 desktop semantics intactas", () => {
  assert.equal(
    hasBusinessIntelligence({
      v: 1,
      lid: "x",
      plan: "basic",
      max_devices: 1,
      machine_id: "m12345678",
      pro: false,
      iat: 1,
      key_mask: "x",
      billing: "monthly",
    }),
    true,
  );
  assert.equal(
    assertMachineMatch(
      {
        v: 1,
        lid: "x",
        plan: "basic",
        max_devices: 1,
        machine_id: "m12345678",
        pro: false,
        iat: 1,
        key_mask: "x",
      },
      "m12345678",
    ),
    true,
  );
  assert.equal(
    assertMachineMatch(
      {
        v: 1,
        lid: "x",
        plan: "basic",
        max_devices: 1,
        machine_id: "m12345678",
        pro: false,
        iat: 1,
        key_mask: "x",
      },
      "other-machine",
    ),
    false,
  );
});

await check("18. tenant A/B isolation", async () => {
  const env = mockEnv({
    snapshots: {
      [LID_A]: {
        payload: JSON.stringify({ marker: "TENANT_A_ONLY" }),
        device_name: "A",
        updated_at: "2026-09-17T00:00:00Z",
      },
      [LID_B]: {
        payload: JSON.stringify({ marker: "TENANT_B_ONLY" }),
        device_name: "B",
        updated_at: "2026-09-17T00:00:00Z",
      },
    },
    serviceSecret: SECRET,
  });
  const tokA = await wp1(env, {
    id: AID_A,
    name: "A",
    email: "a@test.com",
    license_id: LID_A,
  });
  const tokB = await wp1(env, {
    id: AID_B,
    name: "B",
    email: "b@test.com",
    license_id: LID_B,
  });
  const resA = await handlePortalInterpret(
    interpretReq(tokA, { license_id: LID_B, metrics: { marker: "TENANT_B_ONLY" } }),
    env,
  );
  const resB = await handlePortalInterpret(interpretReq(tokB), env);
  const a = (await resA.json()) as Record<string, unknown>;
  const b = (await resB.json()) as Record<string, unknown>;
  assert.equal(a.has_snapshot, true);
  assert.equal(b.has_snapshot, true);
  assert.ok(!JSON.stringify(a).includes("TENANT_B_ONLY"));
  assert.ok(!JSON.stringify(b).includes("TENANT_A_ONLY"));
});

await check("19. browser no puede proporcionar identidad", async () => {
  const hints = parsePortalInterpretHints({
    period: "7d",
    aid: AID_B,
    lid: LID_B,
    machine_id: "evil-machine",
    metrics: { sales: 1 },
    alerts: [{ id: "x" }],
  });
  assert.equal(hints.period, "7d");
  // Solo period sobrevive
  assert.deepEqual(Object.keys(hints), ["period"]);
});

await check("20. browser no recibe secret", async () => {
  const env = mockEnv({
    snapshots: {
      [LID_A]: {
        payload: JSON.stringify({ sales_today_total: 1 }),
        device_name: "PC",
        updated_at: "2026-09-17T00:00:00Z",
      },
    },
    serviceSecret: SECRET,
  });
  const token = await wp1(env, {
    id: AID_A,
    name: "A",
    email: "a@test.com",
    license_id: LID_A,
  });
  const res = await handlePortalInterpret(interpretReq(token), env);
  const text = await res.text();
  assert.ok(!text.includes(SECRET));
  assert.ok(!text.includes(ADMIN));
  assert.ok(!text.includes("PBS1."));
  assert.ok(!text.includes("OPENAI"));
});

await check("21. claims sensibles en PBS1 rechazados", async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: PORTAL_SERVICE_ISS,
    aud: PORTAL_SERVICE_AUD,
    service: PORTAL_SERVICE_NAME,
    aid: AID_A,
    lid: LID_A,
    iat: now,
    exp: now + 30,
    machine_id: "should-fail",
  };
  const body = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const signed = `${PORTAL_SERVICE_TOKEN_PREFIX}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const sig = Buffer.from(new Uint8Array(sigBuf))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const v = await verifyPortalServiceToken(SECRET, `${signed}.${sig}`);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.reason, "forbidden_claims");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll Fase 4E-1 portal AI auth bridge tests passed.");
