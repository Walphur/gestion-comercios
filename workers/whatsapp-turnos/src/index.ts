export interface Env {
  DB: D1Database;
  WEBHOOK_PUBLIC_URL: string;
}

interface TenantRow {
  id: string;
  api_token: string;
  phone_number_id: string;
  access_token: string;
  business_name: string;
  reminder_hours: number;
  webhook_verify_token: string;
  template_name: string;
  template_lang: string;
}

interface SyncedAppointment {
  appointment_id: number;
  customer_phone: string;
  customer_name?: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  resource_name?: string | null;
  vehicle_plate?: string | null;
}

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

function nowIso(): string {
  return new Date().toISOString();
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("549") && digits.length >= 12) return digits;
  if (digits.startsWith("54") && digits.length >= 11) return digits;
  if (digits.startsWith("0")) return normalizePhone(digits.slice(1));
  if (digits.length === 10) return `549${digits}`;
  if (digits.length === 11 && digits.startsWith("9")) return `54${digits}`;
  return digits;
}

function parseSqliteDateTime(value: string): Date {
  return new Date(value.replace(" ", "T"));
}

function formatDateShort(value: string): string {
  const d = parseSqliteDateTime(value);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(value: string): string {
  const d = parseSqliteDateTime(value);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

async function authTenant(request: Request, env: Env): Promise<TenantRow | Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return err("Falta token de API.", "unauthorized", 401);

  const row = await env.DB.prepare(
    "SELECT * FROM tenants WHERE api_token = ?1 LIMIT 1",
  )
    .bind(token)
    .first<TenantRow>();
  if (!row) return err("Token inválido.", "forbidden", 403);
  return row;
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as {
    machine_id?: string;
    phone_number_id?: string;
    access_token?: string;
    business_name?: string;
    reminder_hours?: number;
    webhook_verify_token?: string;
    template_name?: string;
    template_lang?: string;
  };

  const machineId = body.machine_id?.trim();
  const phoneNumberId = body.phone_number_id?.trim();
  const accessToken = body.access_token?.trim();
  const businessName = body.business_name?.trim();
  const verifyToken = body.webhook_verify_token?.trim();
  if (!machineId || !phoneNumberId || !accessToken || !businessName || !verifyToken) {
    return err("Completá machine_id, credenciales de WhatsApp y nombre del negocio.", "invalid_body");
  }

  const reminderHours = Math.min(72, Math.max(1, body.reminder_hours ?? 24));
  const templateName = body.template_name?.trim() || "gc_recordatorio_turno";
  const templateLang = body.template_lang?.trim() || "es_AR";
  const ts = nowIso();

  const existing = await env.DB.prepare("SELECT api_token FROM tenants WHERE id = ?1")
    .bind(machineId)
    .first<{ api_token: string }>();

  const apiToken = existing?.api_token ?? randomToken();

  await env.DB.prepare(
    `INSERT INTO tenants
      (id, api_token, phone_number_id, access_token, business_name, reminder_hours,
       webhook_verify_token, template_name, template_lang, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
     ON CONFLICT(id) DO UPDATE SET
       phone_number_id = excluded.phone_number_id,
       access_token = excluded.access_token,
       business_name = excluded.business_name,
       reminder_hours = excluded.reminder_hours,
       webhook_verify_token = excluded.webhook_verify_token,
       template_name = excluded.template_name,
       template_lang = excluded.template_lang,
       updated_at = excluded.updated_at`,
  )
    .bind(
      machineId,
      apiToken,
      phoneNumberId,
      accessToken,
      businessName,
      reminderHours,
      verifyToken,
      templateName,
      templateLang,
      ts,
      ts,
    )
    .run();

  return json({
    ok: true,
    api_token: apiToken,
    webhook_url: `${env.WEBHOOK_PUBLIC_URL}/webhook`,
  });
}

async function handleSync(request: Request, env: Env, tenant: TenantRow): Promise<Response> {
  const body = (await request.json()) as { appointments?: SyncedAppointment[] };
  const items = body.appointments ?? [];
  const ts = nowIso();

  for (const appt of items) {
    const phone = normalizePhone(appt.customer_phone ?? "");
    if (!phone || !appt.appointment_id) continue;
    await env.DB.prepare(
      `INSERT INTO synced_appointments
        (tenant_id, appointment_id, customer_phone, customer_name, title, starts_at, ends_at,
         status, resource_name, vehicle_plate, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
       ON CONFLICT(tenant_id, appointment_id) DO UPDATE SET
         customer_phone = excluded.customer_phone,
         customer_name = excluded.customer_name,
         title = excluded.title,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         status = excluded.status,
         resource_name = excluded.resource_name,
         vehicle_plate = excluded.vehicle_plate,
         updated_at = excluded.updated_at`,
    )
      .bind(
        tenant.id,
        appt.appointment_id,
        phone,
        appt.customer_name?.trim() || null,
        appt.title.trim(),
        appt.starts_at,
        appt.ends_at,
        appt.status,
        appt.resource_name?.trim() || null,
        appt.vehicle_plate?.trim() || null,
        ts,
      )
      .run();
  }

  return json({ ok: true, synced: items.length });
}

async function handlePendingUpdates(request: Request, env: Env, tenant: TenantRow): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, appointment_id, action, customer_phone, customer_name, created_at
     FROM pending_replies
     WHERE tenant_id = ?1 AND synced_at IS NULL
     ORDER BY created_at ASC
     LIMIT 50`,
  )
    .bind(tenant.id)
    .all<{
      id: string;
      appointment_id: number;
      action: string;
      customer_phone: string | null;
      customer_name: string | null;
      created_at: string;
    }>();

  return json({ ok: true, updates: rows.results ?? [] });
}

async function handleAckUpdates(request: Request, env: Env, tenant: TenantRow): Promise<Response> {
  const body = (await request.json()) as { ids?: string[] };
  const ids = body.ids ?? [];
  if (!ids.length) return json({ ok: true, acked: 0 });

  const ts = nowIso();
  for (const id of ids) {
    await env.DB.prepare(
      "UPDATE pending_replies SET synced_at = ?1 WHERE id = ?2 AND tenant_id = ?3",
    )
      .bind(ts, id, tenant.id)
      .run();
  }
  return json({ ok: true, acked: ids.length });
}

async function sendGraphMessage(
  tenant: TenantRow,
  to: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; message_id?: string; error?: string }> {
  const url = `https://graph.facebook.com/v21.0/${tenant.phone_number_id}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${tenant.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload }),
  });
  const data = (await res.json()) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
  }
  return { ok: true, message_id: data.messages?.[0]?.id };
}

async function sendReminderTemplate(
  tenant: TenantRow,
  appt: {
    appointment_id: number;
    customer_phone: string;
    customer_name: string | null;
    title: string;
    starts_at: string;
    business_name: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const name = appt.customer_name?.trim() || "cliente";
  const dateTime = `${formatDateShort(appt.starts_at)} ${formatTime(appt.starts_at)}`;

  const result = await sendGraphMessage(tenant, appt.customer_phone, {
    type: "template",
    template: {
      name: tenant.template_name,
      language: { code: tenant.template_lang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: name },
            { type: "text", text: appt.business_name },
            { type: "text", text: dateTime },
            { type: "text", text: appt.title },
          ],
        },
      ],
    },
  });
  return result;
}

async function sendTextReply(tenant: TenantRow, to: string, body: string): Promise<void> {
  await sendGraphMessage(tenant, to, { type: "text", text: { body } });
}

async function queueReply(
  env: Env,
  tenantId: string,
  appointmentId: number,
  action: string,
  phone: string,
  customerName: string | null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO pending_replies
      (id, tenant_id, appointment_id, action, customer_phone, customer_name, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7)`,
  )
    .bind(randomToken(), tenantId, appointmentId, action, phone, customerName, nowIso())
    .run();
}

async function resolveAppointmentFromPhone(
  env: Env,
  tenantId: string,
  phone: string,
): Promise<{ appointment_id: number; customer_name: string | null; title: string } | null> {
  const pending = await env.DB.prepare(
    `SELECT appointment_id FROM pending_confirmations
     WHERE tenant_id = ?1 AND customer_phone = ?2 AND expires_at > ?3
     ORDER BY sent_at DESC LIMIT 1`,
  )
    .bind(tenantId, phone, nowIso())
    .first<{ appointment_id: number }>();

  if (!pending) return null;

  const appt = await env.DB.prepare(
    `SELECT appointment_id, customer_name, title FROM synced_appointments
     WHERE tenant_id = ?1 AND appointment_id = ?2 LIMIT 1`,
  )
    .bind(tenantId, pending.appointment_id)
    .first<{ appointment_id: number; customer_name: string | null; title: string }>();

  return appt ?? null;
}

function mapButtonAction(text: string): "confirm" | "cancel" | "reschedule" | null {
  const t = text.trim().toLowerCase();
  if (t.includes("confirm")) return "confirm";
  if (t.includes("cancel")) return "cancel";
  if (t.includes("reprogram") || t.includes("reagend") || t.includes("cambiar")) return "reschedule";
  return null;
}

async function applyCustomerAction(
  env: Env,
  tenant: TenantRow,
  phone: string,
  action: "confirm" | "cancel" | "reschedule",
): Promise<void> {
  const appt = await resolveAppointmentFromPhone(env, tenant.id, phone);
  if (!appt) {
    await sendTextReply(
      tenant,
      phone,
      "No encontramos un turno pendiente de confirmación. Escribinos si necesitás ayuda.",
    );
    return;
  }

  if (action === "confirm") {
    await env.DB.prepare(
      "UPDATE synced_appointments SET status = 'confirmed', updated_at = ?1 WHERE tenant_id = ?2 AND appointment_id = ?3",
    )
      .bind(nowIso(), tenant.id, appt.appointment_id)
      .run();
    await queueReply(env, tenant.id, appt.appointment_id, "confirm", phone, appt.customer_name);
    await sendTextReply(
      tenant,
      phone,
      `¡Perfecto! Tu turno quedó *confirmado*. Te esperamos. — ${tenant.business_name}`,
    );
    return;
  }

  if (action === "cancel") {
    await env.DB.prepare(
      "UPDATE synced_appointments SET status = 'cancelled', updated_at = ?1 WHERE tenant_id = ?2 AND appointment_id = ?3",
    )
      .bind(nowIso(), tenant.id, appt.appointment_id)
      .run();
    await queueReply(env, tenant.id, appt.appointment_id, "cancel", phone, appt.customer_name);
    await sendTextReply(
      tenant,
      phone,
      `Turno *cancelado*. Si querés reagendar, escribinos cuando quieras. — ${tenant.business_name}`,
    );
    return;
  }

  await queueReply(env, tenant.id, appt.appointment_id, "reschedule", phone, appt.customer_name);
  await sendTextReply(
    tenant,
    phone,
    `Gracias. Un integrante de *${tenant.business_name}* te va a escribir pronto para coordinar un nuevo horario.`,
  );
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !token || !challenge) {
      return new Response("Bad request", { status: 400 });
    }
    const tenant = await env.DB.prepare(
      "SELECT id FROM tenants WHERE webhook_verify_token = ?1 LIMIT 1",
    )
      .bind(token)
      .first();
    if (!tenant) return new Response("Forbidden", { status: 403 });
    return new Response(challenge, { status: 200 });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload = (await request.json()) as {
    entry?: {
      changes?: {
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: {
            from?: string;
            type?: string;
            text?: { body?: string };
            button?: { text?: string; payload?: string };
            interactive?: { type?: string; button_reply?: { title?: string; id?: string } };
          }[];
        };
      }[];
    }[];
  };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const tenant = await env.DB.prepare(
        "SELECT * FROM tenants WHERE phone_number_id = ?1 LIMIT 1",
      )
        .bind(phoneNumberId)
        .first<TenantRow>();
      if (!tenant) continue;

      for (const msg of change.value?.messages ?? []) {
        const from = normalizePhone(msg.from ?? "");
        if (!from) continue;

        let action: "confirm" | "cancel" | "reschedule" | null = null;

        if (msg.type === "button" && msg.button?.text) {
          action = mapButtonAction(msg.button.text);
        } else if (msg.type === "interactive" && msg.interactive?.button_reply?.title) {
          action = mapButtonAction(msg.interactive.button_reply.title);
        } else if (msg.type === "text" && msg.text?.body) {
          action = mapButtonAction(msg.text.body);
        }

        if (action) {
          await applyCustomerAction(env, tenant, from, action);
        }
      }
    }
  }

  return new Response("ok", { status: 200 });
}

async function runReminders(env: Env): Promise<{ sent: number; errors: number }> {
  const tenants = await env.DB.prepare("SELECT * FROM tenants").all<TenantRow>();
  let sent = 0;
  let errors = 0;
  const now = Date.now();

  for (const tenant of tenants.results ?? []) {
    const rows = await env.DB.prepare(
      `SELECT appointment_id, customer_phone, customer_name, title, starts_at
       FROM synced_appointments
       WHERE tenant_id = ?1
         AND status = 'scheduled'
         AND reminder_sent_at IS NULL
         AND trim(customer_phone) != ''`,
    )
      .bind(tenant.id)
      .all<{
        appointment_id: number;
        customer_phone: string;
        customer_name: string | null;
        title: string;
        starts_at: string;
      }>();

    for (const appt of rows.results ?? []) {
      const starts = parseSqliteDateTime(appt.starts_at).getTime();
      const hoursUntil = (starts - now) / (1000 * 60 * 60);
      if (hoursUntil < tenant.reminder_hours - 1 || hoursUntil > tenant.reminder_hours + 1) {
        continue;
      }

      const result = await sendReminderTemplate(tenant, {
        ...appt,
        business_name: tenant.business_name,
      });

      if (!result.ok) {
        errors += 1;
        console.error(`reminder failed tenant=${tenant.id} appt=${appt.appointment_id}: ${result.error}`);
        continue;
      }

      const ts = nowIso();
      const expires = new Date(now + 48 * 60 * 60 * 1000).toISOString();
      await env.DB.prepare(
        "UPDATE synced_appointments SET reminder_sent_at = ?1, updated_at = ?1 WHERE tenant_id = ?2 AND appointment_id = ?3",
      )
        .bind(ts, tenant.id, appt.appointment_id)
        .run();
      await env.DB.prepare(
        `INSERT INTO pending_confirmations
          (tenant_id, customer_phone, appointment_id, sent_at, expires_at)
         VALUES (?1,?2,?3,?4,?5)
         ON CONFLICT(tenant_id, customer_phone, appointment_id) DO UPDATE SET
           sent_at = excluded.sent_at,
           expires_at = excluded.expires_at`,
      )
        .bind(tenant.id, appt.customer_phone, appt.appointment_id, ts, expires)
        .run();
      sent += 1;
    }
  }

  return { sent, errors };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/webhook") {
      return handleWebhook(request, env);
    }

    if (path === "/v1/register" && request.method === "POST") {
      return handleRegister(request, env);
    }

    const authed = await authTenant(request, env);
    if (authed instanceof Response) return authed;
    const tenant = authed;

    if (path === "/v1/sync-appointments" && request.method === "POST") {
      return handleSync(request, env, tenant);
    }
    if (path === "/v1/pending-updates" && request.method === "GET") {
      return handlePendingUpdates(request, env, tenant);
    }
    if (path === "/v1/ack-updates" && request.method === "POST") {
      return handleAckUpdates(request, env, tenant);
    }
    if (path === "/v1/run-reminders" && request.method === "POST") {
      const result = await runReminders(env);
      return json({ ok: true, ...result });
    }

    return err("Ruta no encontrada.", "not_found", 404);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runReminders(env));
  },
};
