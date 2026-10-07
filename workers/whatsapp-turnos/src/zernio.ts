const ZERNIO_API = "https://api.zernio.com/v1";

export interface ZernioEnv {
  ZERNIO_API_KEY?: string;
  WEBHOOK_PUBLIC_URL: string;
}

export function zernioConfigured(env: ZernioEnv): boolean {
  return Boolean(env.ZERNIO_API_KEY?.trim());
}

async function zernioFetch(
  env: ZernioEnv,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${env.ZERNIO_API_KEY}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${ZERNIO_API}${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

function errorMessage(data: Record<string, unknown>, status: number): string {
  const message = data.message;
  if (typeof message === "string" && message.trim()) return message;
  const error = data.error;
  if (typeof error === "string" && error.trim()) return error;
  return `Zernio respondió ${status}`;
}

export async function ensureZernioProfile(
  env: ZernioEnv,
  machineId: string,
  businessName: string,
  existingProfileId: string | null,
): Promise<string> {
  if (existingProfileId?.trim()) return existingProfileId.trim();
  const name = `WalQo ${businessName}`.replace(/\s+/g, " ").trim().slice(0, 80) || "WalQo";
  const created = await zernioFetch(env, "/profiles", {
    method: "POST",
    headers: { "idempotency-key": `walqo-${machineId}` },
    body: JSON.stringify({ name, description: "Recordatorios de turnos WalQo" }),
  });
  const profile = created.data.profile as { _id?: string } | undefined;
  if (created.ok && profile?._id) return profile._id;

  const details = created.data.details as { existingProfileId?: string } | undefined;
  if (created.status === 409 && details?.existingProfileId) return details.existingProfileId;
  throw new Error(errorMessage(created.data, created.status));
}

export async function zernioConnectUrl(
  env: ZernioEnv,
  profileId: string,
  redirectUrl: string,
): Promise<string> {
  const query = new URLSearchParams({
    profileId,
    redirect_url: redirectUrl,
    onboarding: "business_app",
    signup: "hosted",
  });
  const result = await zernioFetch(env, `/connect/whatsapp?${query.toString()}`);
  const authUrl = result.data.authUrl;
  if (!result.ok || typeof authUrl !== "string" || !authUrl.startsWith("https://")) {
    throw new Error(errorMessage(result.data, result.status));
  }
  return authUrl;
}

export async function ensureReminderTemplate(
  env: ZernioEnv,
  accountId: string,
  templateName: string,
  templateLang: string,
): Promise<void> {
  const created = await zernioFetch(env, "/whatsapp/templates", {
    method: "POST",
    body: JSON.stringify({
      accountId,
      name: templateName,
      language: templateLang,
      category: "UTILITY",
      parameter_format: "POSITIONAL",
      components: [
        {
          type: "BODY",
          text: "Hola {{1}}! Te recordamos tu turno en {{2}}: {{3}}. Servicio: {{4}}.",
          example: { body_text: [["Ana", "Tu comercio", "07/10 15:00", "Corte"]] },
        },
        {
          type: "BUTTONS",
          buttons: [
            { type: "QUICK_REPLY", text: "Confirmar" },
            { type: "QUICK_REPLY", text: "Cancelar" },
            { type: "QUICK_REPLY", text: "Reprogramar" },
          ],
        },
      ],
    }),
  });
  if (created.ok || created.status === 409) return;
  const message = errorMessage(created.data, created.status).toLowerCase();
  if (message.includes("already") || message.includes("exist") || message.includes("duplicate")) return;
  console.error(`zernio template: ${errorMessage(created.data, created.status)}`);
}

export async function registerZernioWebhook(env: ZernioEnv): Promise<void> {
  const url = `${env.WEBHOOK_PUBLIC_URL}/zernio/webhook`;
  const created = await zernioFetch(env, "/webhooks", {
    method: "POST",
    body: JSON.stringify({
      url,
      events: ["message.received", "message.inbound"],
    }),
  });
  if (created.ok || created.status === 409) return;
  console.error(`zernio webhook: ${errorMessage(created.data, created.status)}`);
}

export async function sendZernioTemplate(
  env: ZernioEnv,
  accountId: string,
  to: string,
  templateName: string,
  templateLanguage: string,
  templateParams: string[],
): Promise<{ ok: boolean; error?: string }> {
  const result = await zernioFetch(env, "/inbox/conversations", {
    method: "POST",
    body: JSON.stringify({
      accountId,
      participantId: to,
      templateName,
      templateLanguage,
      templateParams,
    }),
  });
  if (!result.ok) return { ok: false, error: errorMessage(result.data, result.status) };
  return { ok: true };
}

export async function sendZernioText(
  env: ZernioEnv,
  accountId: string,
  to: string,
  text: string,
): Promise<void> {
  const query = new URLSearchParams({ accountId, participantId: to });
  const listed = await zernioFetch(env, `/inbox/conversations?${query.toString()}`);
  const rows = (listed.data.conversations ?? listed.data.data ?? listed.data.results) as
    | { id?: string; conversationId?: string }[]
    | undefined;
  const conversationId = rows?.[0]?.conversationId ?? rows?.[0]?.id;
  if (!conversationId) {
    console.error("zernio text: no conversation for reply");
    return;
  }
  const sent = await zernioFetch(env, `/inbox/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ accountId, text }),
  });
  if (!sent.ok) console.error(`zernio text: ${errorMessage(sent.data, sent.status)}`);
}

export function inboundFromZernio(body: Record<string, unknown>): { accountId: string; from: string; text: string } | null {
  const data = (body.data as Record<string, unknown> | undefined) ?? body;
  const message = (data.message as Record<string, unknown> | undefined) ?? {};
  const accountId = String(data.accountId ?? body.accountId ?? "");
  const from = String(
    message.from ??
      message.participantId ??
      data.participantId ??
      data.from ??
      "",
  ).replace(/\D/g, "");
  const button = message.button as { text?: string } | undefined;
  const interactive = message.interactive as { button_reply?: { title?: string } } | undefined;
  const text = String(
    button?.text ??
      interactive?.button_reply?.title ??
      message.text ??
      (message.body as { text?: string } | undefined)?.text ??
      data.text ??
      "",
  ).trim();
  if (!accountId || !from || !text) return null;
  return { accountId, from, text };
}
