/** Registro de cuentas + OTP por email (Resend). */

export interface AuthEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  ALLOW_DEV_OTP?: string;
}

const OTP_TTL_SECS = 15 * 60;
const WHATSAPP_URL =
  "https://wa.me/5492665031950?text=" +
  encodeURIComponent("Hola! Me registré en Gestión Comercios y quiero configurar mi comercio.");

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

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailLayout(body: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px">
  <tr><td style="background:#0f172a;padding:20px 24px;color:#fff;font-size:18px;font-weight:700">
    Gestión Comercios <span style="float:right;background:#22c55e;color:#fff;font-size:11px;padding:4px 10px;border-radius:999px">WALTECH</span>
  </td></tr>
  <tr><td style="padding:28px 24px;color:#0f172a;font-size:15px;line-height:1.55">${body}</td></tr>
  <tr><td style="padding:0 24px 28px">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#16a34a,#0d9488);border-radius:12px"><tr><td style="padding:20px;text-align:center;color:#fff">
      <div style="font-weight:700;font-size:16px;margin-bottom:6px">Hablame y contame sobre tu negocio</div>
      <div style="font-size:13px;opacity:.95;margin-bottom:14px">Te ayudo a configurar la app y sacarte las dudas.</div>
      <a href="${WHATSAPP_URL}" style="display:inline-block;background:#fff;color:#15803d;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Escribime por WhatsApp</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:0 24px 24px;text-align:center;color:#94a3b8;font-size:12px">WalTech · Gestión Comercios</td></tr>
  </table></td></tr></table></body></html>`;
}

function otpEmailHtml(name: string, code: string): string {
  const spaced = code.split("").join(" ");
  return emailLayout(`
    <p>Hola ${escapeHtml(name)},</p>
    <p>Gracias por registrarte en Gestión Comercios. Para verificar tu cuenta, ingresá el siguiente código:</p>
    <div style="margin:20px 0;padding:16px;border:2px dashed #38bdf8;border-radius:10px;text-align:center;font-size:28px;font-weight:800;letter-spacing:0.35em;color:#0284c7">${spaced}</div>
    <p style="color:#64748b;font-size:13px">Este código expira en 15 minutos.</p>
    <p style="color:#b91c1c;font-size:12px">Si no solicitaste este código, podés ignorar este email.</p>
  `);
}

function welcomeEmailHtml(name: string): string {
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
  return emailLayout(`
    <p>Hola ${escapeHtml(name)},</p>
    <p>Tu cuenta ha sido verificada exitosamente. ¡Ya podés empezar a usar Gestión Comercios!</p>
    <div style="margin:18px 0;padding:14px 16px;background:#dcfce7;border-radius:10px;color:#166534;font-weight:700">
      GRATIS PARA SIEMPRE<br/>
      <span style="font-weight:500;font-size:13px">Con límites suaves; pasá a Estándar o Pro+ cuando lo necesites.</span>
    </div>
    <p style="font-weight:600">Con tu cuenta gratuita podés:</p>
    ${list}
    <p style="margin-top:18px;color:#64748b;font-size:13px">Cuando tu negocio crezca, podés pasar al plan Estándar o Pro+ para uso sin límites.</p>
  `);
}

async function sendEmail(
  env: AuthEnv,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY no configurada" };
  }
  const from = env.EMAIL_FROM?.trim() || "Gestión Comercios <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

async function storeAndSendOtp(
  env: AuthEnv,
  email: string,
  name: string,
): Promise<{ ok: true; dev_code?: string } | { ok: false; response: Response }> {
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
    "Tu código de verificación — Gestión Comercios",
    otpEmailHtml(name, code),
  );

  if (!sent.ok) {
    if (env.ALLOW_DEV_OTP === "1") {
      return { ok: true, dev_code: code };
    }
    return {
      ok: false,
      response: err(
        "No se pudo enviar el email. Probá más tarde o contactá a WalTech.",
        "email_send_failed",
        503,
      ),
    };
  }
  return { ok: true };
}

export async function handleAuthRegister(req: Request, env: AuthEnv): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    name?: string;
    phone?: string;
    machine_id?: string;
  } | null;
  if (!body) return err("JSON inválido", "bad_json");

  const email = normalizeEmail(body.email || "");
  const name = (body.name || "").trim();
  const phone = (body.phone || "").trim() || null;
  const machineId = (body.machine_id || "").trim();

  if (!isValidEmail(email)) return err("Email inválido", "bad_email");
  if (name.length < 2) return err("Indicá tu nombre", "bad_name");
  if (machineId.length < 8) return err("machine_id inválido", "bad_machine");

  const existing = await env.DB.prepare("SELECT id, verified, name FROM accounts WHERE email = ?1")
    .bind(email)
    .first<{ id: string; verified: number; name: string }>();

  if (existing?.verified) {
    await env.DB.prepare(
      `INSERT INTO account_devices (account_id, machine_id, linked_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(account_id, machine_id) DO NOTHING`,
    )
      .bind(existing.id, machineId, new Date().toISOString())
      .run();
    return json({
      ok: true,
      already_verified: true,
      message: "Esta cuenta ya está verificada. Podés seguir usando la app.",
    });
  }

  const id = existing?.id || crypto.randomUUID();
  const createdAt = new Date().toISOString();
  if (existing) {
    await env.DB.prepare("UPDATE accounts SET name = ?1, phone = ?2 WHERE id = ?3")
      .bind(name, phone, id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO accounts (id, email, name, phone, verified, created_at)
       VALUES (?1, ?2, ?3, ?4, 0, ?5)`,
    )
      .bind(id, email, name, phone, createdAt)
      .run();
  }

  const otp = await storeAndSendOtp(env, email, name);
  if (!otp.ok) return otp.response;

  return json({
    ok: true,
    needs_verification: true,
    message: "Te enviamos un código de 6 dígitos a tu email.",
    ...(otp.dev_code ? { dev_code: otp.dev_code } : {}),
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

  const account = await env.DB.prepare("SELECT id, name FROM accounts WHERE email = ?1")
    .bind(email)
    .first<{ id: string; name: string }>();
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

  await sendEmail(
    env,
    email,
    "Bienvenido a Gestión Comercios!",
    welcomeEmailHtml(account.name),
  );

  return json({
    ok: true,
    verified: true,
    email,
    name: account.name,
    message: "Cuenta verificada. Revisá tu email de bienvenida.",
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
    message: "Te enviamos un nuevo código.",
    ...(otp.dev_code ? { dev_code: otp.dev_code } : {}),
  });
}
