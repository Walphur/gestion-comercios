/** Registro de cuentas + OTP por email (Resend) + licencia free al verificar. */

type D1Database = any;

export interface AuthEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  /** Dirección desde la cual se envían los correos. Debe estar verificada en Resend. */
  EMAIL_FROM?: string;
  /** URL pública HTTPS del logo (PNG/JPG). Si no hay, usa el ícono del repo. */
  EMAIL_LOGO_URL?: string;
  ALLOW_DEV_OTP?: string;
}

const OTP_TTL_SECS = 15 * 60;
const DEFAULT_LOGO_URL = "https://walqo.pro/branding/walqo-mark.png";
const WHATSAPP_URL =
  "https://wa.me/5492665031950?text=" +
  encodeURIComponent("Hola! Me registré en WalQo y quiero configurar mi comercio.");

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function genCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

function randomLicenseKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `GC-${chunk()}-${chunk()}-${chunk()}`;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(email: string, password: string): Promise<string> {
  return sha256Hex(`pw:${email}:${password}`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function logoUrl(env?: AuthEnv): string {
  const custom = env?.EMAIL_LOGO_URL?.trim();
  return custom || DEFAULT_LOGO_URL;
}

function emailLayout(body: string, env?: AuthEnv): string {
  const logo = escapeHtml(logoUrl(env));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:28px 12px;background:#eef2f7">
  <tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:560px;box-shadow:0 4px 24px rgba(15,23,42,.08)">
  <tr><td style="background:#05060a;padding:28px 24px;text-align:center">
    <img src="${logo}" alt="WalQo" width="72" height="72" style="display:block;margin:0 auto 14px;border:0;outline:none" />
    <div style="color:#c5cbe0;font-size:26px;font-weight:800;letter-spacing:-0.02em">Wal<span style="color:#2f6bff">Q</span>o</div>
    <div style="margin-top:8px;color:#9aa3b5;font-size:13px">Simplificá la gestión. Impulsá el crecimiento.</div>
  </td></tr>
  <tr><td style="padding:28px 28px 8px;color:#0f172a;font-size:15px;line-height:1.6">${body}</td></tr>
  <tr><td style="padding:16px 28px 28px">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#16a34a;border-radius:14px">
    <tr><td style="padding:22px 20px;text-align:center;color:#fff">
      <div style="font-weight:700;font-size:17px;margin-bottom:6px">Hablame y contame sobre tu negocio</div>
      <div style="font-size:13px;opacity:.95;margin-bottom:16px;line-height:1.45">Te ayudo a configurar la app y sacarte las dudas.</div>
      <a href="${WHATSAPP_URL}" style="display:inline-block;background:#ffffff;color:#15803d;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px;font-size:14px">Escribime por WhatsApp</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:0 28px 24px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.5">
    WalQo<br/>
    <span style="color:#cbd5e1">Este correo es automático; respondé por WhatsApp si necesitás ayuda.</span>
  </td></tr>
  </table>
  </td></tr></table>
</body></html>`;
}

function otpEmailHtml(name: string, code: string, env?: AuthEnv): string {
  const spaced = code.split("").join(" ");
  return emailLayout(
    `
    <p style="margin:0 0 12px;font-size:16px">Hola <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin:0 0 8px">Gracias por registrarte en WalQo.</p>
    <p style="margin:0 0 18px">Para verificar tu cuenta, ingresá este código:</p>
    <div style="margin:0 0 18px;padding:20px 16px;background:#f0f9ff;border:2px dashed #38bdf8;border-radius:12px;text-align:center">
      <div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:#0284c7;margin-bottom:8px">CÓDIGO DE VERIFICACIÓN</div>
      <div style="font-size:30px;font-weight:800;letter-spacing:0.4em;color:#0369a1;font-family:Consolas,monospace">${spaced}</div>
    </div>
    <p style="margin:0 0 8px;color:#64748b;font-size:13px">Expira en 15 minutos.</p>
    <p style="margin:0;color:#b91c1c;font-size:12px">Si no pediste este código, ignorá este email.</p>
  `,
    env,
  );
}

function welcomeEmailHtml(name: string, licenseKey: string, env?: AuthEnv): string {
  const items = [
    "Punto de venta y caja",
    "Control de stock",
    "Clientes y cuenta corriente",
    "Plan gratis: 25 productos y 50 ventas al mes",
    "Cuando crezcas: Estándar o Pro+ (taller + ARCA)",
  ];
  const list = items
    .map(
      (t) =>
        `<div style="margin:8px 0;padding:12px 14px;background:#f8fafc;border-radius:8px;border-left:3px solid #22c55e">${escapeHtml(t)}</div>`,
    )
    .join("");
  return emailLayout(
    `
    <p style="margin:0 0 12px;font-size:16px">Hola <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin:0 0 8px">Tu cuenta ya está verificada.</p>
    <p style="margin:0 0 18px">Esta es tu <strong>licencia del plan gratis</strong>:</p>
    <div style="margin:0 0 16px;padding:18px 14px;background:#f0fdf4;border:2px dashed #22c55e;border-radius:12px;text-align:center">
      <div style="font-size:11px;font-weight:700;letter-spacing:.12em;color:#15803d;margin-bottom:8px">CLAVE DE LICENCIA</div>
      <div style="font-size:18px;font-weight:800;letter-spacing:0.08em;color:#166534;font-family:Consolas,monospace">${escapeHtml(licenseKey)}</div>
    </div>
    <p style="margin:0 0 16px;font-size:13px;color:#334155"><strong>Cómo activarla:</strong> Configuración → Licencia (o el banner del plan gratis) y pegá la clave. Si verificaste en la misma PC, a veces se activa sola.</p>
    <div style="margin:0 0 18px;padding:14px 16px;background:#dcfce7;border-radius:10px;color:#166534;font-weight:700">
      GRATIS PARA SIEMPRE<br/>
      <span style="font-weight:500;font-size:13px">Con límites suaves; pasá a Estándar o Pro+ cuando lo necesites.</span>
    </div>
    <p style="margin:0 0 8px;font-weight:600">Con tu cuenta gratuita podés:</p>
    ${list}
    <p style="margin:18px 0 0;color:#64748b;font-size:13px">Guardá este mail: la clave te identifica y nos ayuda a darte mejor soporte.</p>
  `,
    env,
  );
}

async function sendEmail(
  env: AuthEnv,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();

  if (!key) {
    return { ok: false, error: "RESEND_API_KEY no configurada" };
  }
  if (!from) {
    return { ok: false, error: "EMAIL_FROM no configurada" };
  }

  console.log("API KEY PREFIX:", key.substring(0, 8));
  console.log("API KEY LENGTH:", key.length);
  console.log("EMAIL_FROM RAW:", JSON.stringify(env.EMAIL_FROM));
  console.log("FROM FINAL:", JSON.stringify(from));

  const payload = { from, to, subject, html };
  console.log("PAYLOAD:", JSON.stringify(payload));
  console.log("=========== ENVIANDO EMAIL ===========");
  console.log("FROM:", from);
  console.log("TO:", to);
  console.log("SUBJECT:", subject);
  console.log("======================================");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
  
    console.error("STATUS:", res.status);
    console.error("HEADERS:", Object.fromEntries(res.headers.entries()));
    console.error("BODY RAW:", JSON.stringify(text));
  
    return {
      ok: false,
      error: `Resend ${res.status}: ${text}`,
    };
  }
  
  const body = await res.text();
  
  console.log("RESEND OK");
  console.log(body);
  
  return { ok: true };
}

async function storeAndSendOtp(
  env: AuthEnv,
  email: string,
  name: string,
): Promise<
  | { ok: true; email_sent: true }
  | { ok: true; email_sent: false; dev_code?: string; email_error?: string }
  | { ok: false; response: Response }
> {
  const code = genCode();
  const codeHash = await sha256Hex(`${email}:${code}`);
  const now = Math.floor(Date.now() / 1000);
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO account_otps (email, code_hash, expires_at, attempts, created_at)
     VALUES (?1, ?2, ?3, 0, ?4)
     ON CONFLICT(email) DO UPDATE SET
       code_hash = excluded.code_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       created_at = excluded.created_at`,
  )
    .bind(email, codeHash, now + OTP_TTL_SECS, createdAt)
    .run();

  const sent = await sendEmail(
    env,
    email,
    "Tu código de verificación — WalQo",
    otpEmailHtml(name, code, env),
  );

  if (!sent.ok) {
    if (env.ALLOW_DEV_OTP === "1") {
      return { ok: true, email_sent: false, dev_code: code, email_error: sent.error };
    }
    return {
      ok: false,
      response: err(
        "No se pudo enviar el email. Probá más tarde o contactá a WalQo.",
        "email_send_failed",
        503,
      ),
    };
  }
  return { ok: true, email_sent: true };
}

/** Crea (o reutiliza) licencia free vinculada a la cuenta. */
async function ensureFreeLicense(
  env: AuthEnv,
  account: { id: string; name: string; email: string; phone?: string | null; license_id?: string | null; license_key?: string | null },
): Promise<{ license_id: string; license_key: string }> {
  if (account.license_id && account.license_key) {
    return { license_id: account.license_id, license_key: account.license_key };
  }

  const existing = await env.DB.prepare(
    "SELECT id, license_key FROM licenses WHERE buyer_note = ?1 AND plan = 'free' LIMIT 1",
  )
    .bind(`signup:${account.email}`)
    .first<{ id: string; license_key: string }>();

  if (existing) {
    await env.DB.prepare(
      "UPDATE accounts SET license_id = ?1, license_key = ?2 WHERE id = ?3",
    )
      .bind(existing.id, existing.license_key, account.id)
      .run();
    return { license_id: existing.id, license_key: existing.license_key };
  }

  const licenseId = crypto.randomUUID();
  const licenseKey = randomLicenseKey();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO licenses (
      id, license_key, plan, max_devices, buyer_note, created_at, revoked,
      billing_type, expires_at, client_name, client_phone, amount_ars,
      last_paid_at, updated_at
    ) VALUES (?1, ?2, 'free', 1, ?3, ?4, 0, 'perpetual', NULL, ?5, ?6, 0, NULL, ?4)`,
  )
    .bind(
      licenseId,
      licenseKey,
      `signup:${account.email}`,
      now,
      account.name,
      account.phone ?? null,
    )
    .run();

  await env.DB.prepare(
    "UPDATE accounts SET license_id = ?1, license_key = ?2 WHERE id = ?3",
  )
    .bind(licenseId, licenseKey, account.id)
    .run();

  return { license_id: licenseId, license_key: licenseKey };
}

export async function handleAuthRegister(req: Request, env: AuthEnv): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    name?: string;
    phone?: string;
    password?: string;
    business_name?: string;
    rubro?: string;
    machine_id?: string;
  } | null;
  if (!body) return err("JSON inválido", "bad_json");

  const email = normalizeEmail(body.email || "");
  const name = (body.name || "").trim();
  const phone = (body.phone || "").trim() || null;
  const password = body.password || "";
  const businessName = (body.business_name || "").trim();
  const rubro = (body.rubro || "").trim();
  const machineId = (body.machine_id || "").trim();

  if (!isValidEmail(email)) return err("Email inválido", "bad_email");
  if (name.length < 2) return err("Indicá tu nombre", "bad_name");
  if (password.length < 8) return err("La contraseña debe tener al menos 8 caracteres", "bad_password");
  if (businessName.length < 2) return err("Indicá el nombre de tu negocio", "bad_business");
  if (rubro.length < 2) return err("Elegí el rubro de tu negocio", "bad_rubro");
  if (machineId.length < 8) return err("machine_id inválido", "bad_machine");

  const passwordHash = await hashPassword(email, password);

  const existing = await env.DB.prepare(
    "SELECT id, verified, name, phone, license_id, license_key FROM accounts WHERE email = ?1",
  )
    .bind(email)
    .first<{
      id: string;
      verified: number;
      name: string;
      phone: string | null;
      license_id: string | null;
      license_key: string | null;
    }>();

  if (existing?.verified) {
    return err(
      "Ya tenés cuenta con este email. Iniciá sesión con tu contraseña.",
      "already_verified",
      409,
    );
  }

  const id = existing?.id || crypto.randomUUID();
  const createdAt = new Date().toISOString();
  if (existing) {
    await env.DB.prepare(
      `UPDATE accounts SET name = ?1, phone = ?2, password_hash = ?3, business_name = ?4, rubro = ?5 WHERE id = ?6`,
    )
      .bind(name, phone, passwordHash, businessName, rubro, id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO accounts (id, email, name, phone, password_hash, business_name, rubro, verified, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8)`,
    )
      .bind(id, email, name, phone, passwordHash, businessName, rubro, createdAt)
      .run();
  }

  const otp = await storeAndSendOtp(env, email, name);
  if (!otp.ok) return otp.response;

  return json({
    ok: true,
    needs_verification: true,
    email_sent: otp.email_sent,
    message: otp.email_sent
      ? "Te enviamos un código de 6 dígitos a tu email. Revisá también spam."
      : "No pudimos enviar el email. Usá el código que aparece abajo para continuar.",
    ...(otp.email_sent === false && otp.dev_code
      ? { dev_code: otp.dev_code, email_error: otp.email_error }
      : {}),
  });
}

export async function handleAuthVerify(req: Request, env: AuthEnv): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    code?: string;
    machine_id?: string;
  } | null;
  if (!body) return err("JSON inválido", "bad_json");

  const email = normalizeEmail(body.email || "");
  const code = (body.code || "").replace(/\s+/g, "");
  const machineId = (body.machine_id || "").trim();

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return err("Código o email inválido", "bad_input");
  }
  if (machineId.length < 8) return err("machine_id inválido", "bad_machine");

  const otp = await env.DB.prepare(
    "SELECT code_hash, expires_at, attempts FROM account_otps WHERE email = ?1",
  )
    .bind(email)
    .first<{ code_hash: string; expires_at: number; attempts: number }>();

  if (!otp) return err("Pedí un código nuevo", "no_otp");
  if (otp.attempts >= 8) return err("Demasiados intentos. Pedí un código nuevo.", "too_many");
  if (Math.floor(Date.now() / 1000) > otp.expires_at) {
    return err("El código expiró. Pedí uno nuevo.", "expired");
  }

  const hash = await sha256Hex(`${email}:${code}`);
  if (hash !== otp.code_hash) {
    await env.DB.prepare("UPDATE account_otps SET attempts = attempts + 1 WHERE email = ?1")
      .bind(email)
      .run();
    return err("Código incorrecto", "bad_code");
  }

  const account = await env.DB.prepare(
    "SELECT id, name, phone, business_name, rubro, license_id, license_key FROM accounts WHERE email = ?1",
  )
    .bind(email)
    .first<{
      id: string;
      name: string;
      phone: string | null;
      business_name: string | null;
      rubro: string | null;
      license_id: string | null;
      license_key: string | null;
    }>();
  if (!account) return err("Cuenta no encontrada", "not_found", 404);

  const verifiedAt = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE accounts SET verified = 1, verified_at = ?1 WHERE id = ?2",
  )
    .bind(verifiedAt, account.id)
    .run();
  await env.DB.prepare("DELETE FROM account_otps WHERE email = ?1").bind(email).run();
  await env.DB.prepare(
    `INSERT INTO account_devices (account_id, machine_id, linked_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(account_id, machine_id) DO NOTHING`,
  )
    .bind(account.id, machineId, verifiedAt)
    .run();

  const lic = await ensureFreeLicense(env, {
    id: account.id,
    name: account.name,
    email,
    phone: account.phone,
    license_id: account.license_id,
    license_key: account.license_key,
  });

  await sendEmail(
    env,
    email,
    "Tu licencia WalQo (plan gratis)",
    welcomeEmailHtml(account.name, lic.license_key, env),
  );

  return json({
    ok: true,
    verified: true,
    email,
    name: account.name,
    business_name: account.business_name ?? undefined,
    rubro: account.rubro ?? undefined,
    license_key: lic.license_key,
    message: "Cuenta verificada. Te enviamos la licencia por email.",
  });
}

export async function handleAuthLogin(req: Request, env: AuthEnv): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
    machine_id?: string;
  } | null;
  if (!body) return err("JSON inválido", "bad_json");

  const email = normalizeEmail(body.email || "");
  const password = body.password || "";
  const machineId = (body.machine_id || "").trim();

  if (!isValidEmail(email)) return err("Email inválido", "bad_email");
  if (password.length < 8) return err("Contraseña inválida", "bad_password");
  if (machineId.length < 8) return err("machine_id inválido", "bad_machine");

  const account = await env.DB.prepare(
    `SELECT id, name, phone, verified, password_hash, business_name, rubro, license_id, license_key
     FROM accounts WHERE email = ?1`,
  )
    .bind(email)
    .first<{
      id: string;
      name: string;
      phone: string | null;
      verified: number;
      password_hash: string | null;
      business_name: string | null;
      rubro: string | null;
      license_id: string | null;
      license_key: string | null;
    }>();

  if (!account) {
    return err("Email o contraseña incorrectos", "bad_credentials", 401);
  }
  if (!account.verified) {
    return err("Verificá tu email antes de iniciar sesión", "not_verified", 403);
  }
  if (!account.password_hash) {
    return err(
      "Tu cuenta no tiene contraseña. Registrate de nuevo o contactá a WalQo.",
      "no_password",
      403,
    );
  }

  const hash = await hashPassword(email, password);
  if (hash !== account.password_hash) {
    return err("Email o contraseña incorrectos", "bad_credentials", 401);
  }

  const linkedAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO account_devices (account_id, machine_id, linked_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(account_id, machine_id) DO NOTHING`,
  )
    .bind(account.id, machineId, linkedAt)
    .run();

  const lic = await ensureFreeLicense(env, {
    id: account.id,
    name: account.name,
    email,
    phone: account.phone,
    license_id: account.license_id,
    license_key: account.license_key,
  });

  return json({
    ok: true,
    email,
    name: account.name,
    business_name: account.business_name ?? undefined,
    rubro: account.rubro ?? undefined,
    license_key: lic.license_key,
    message: "Sesión iniciada.",
  });
}

export async function handleAuthResend(req: Request, env: AuthEnv): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  if (!body) return err("JSON inválido", "bad_json");
  const email = normalizeEmail(body.email || "");
  if (!isValidEmail(email)) return err("Email inválido", "bad_email");

  const account = await env.DB.prepare("SELECT name, verified FROM accounts WHERE email = ?1")
    .bind(email)
    .first<{ name: string; verified: number }>();
  if (!account) return err("Cuenta no encontrada", "not_found", 404);
  if (account.verified) {
    return json({ ok: true, already_verified: true, message: "La cuenta ya está verificada." });
  }

  const otp = await storeAndSendOtp(env, email, account.name);
  if (!otp.ok) return otp.response;

  return json({
    ok: true,
    email_sent: otp.email_sent,
    message: otp.email_sent
      ? "Te enviamos un nuevo código. Revisá también spam."
      : "No pudimos enviar el email. Usá el código que aparece abajo.",
    ...(otp.email_sent === false && otp.dev_code
      ? { dev_code: otp.dev_code, email_error: otp.email_error }
      : {}),
  });
}
