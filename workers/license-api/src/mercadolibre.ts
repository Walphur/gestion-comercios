/**
 * Mercado Libre: licencia y mensaje después de la compra, y respuestas a preguntas frecuentes.
 *
 * - POST /v1/ml/notify   notificaciones de Mercado Libre (orders_v2, questions). Contesta 200 enseguida
 *                        y procesa en segundo plano. El payload solo se usa para saber qué consultar:
 *                        la orden o la pregunta se leen de la API con el token del vendedor.
 * - cron cada 5 min      pollMercadoLibre: lo mismo sin depender de las notificaciones.
 * - POST /admin/ml/token  token vigente para los scripts locales (Bearer ML_SYNC_SECRET).
 * - POST /admin/ml/seed   tokens nuevos al volver a autorizar la cuenta (Bearer ML_SYNC_SECRET).
 * - POST /admin/ml/test   prueba con una orden o pregunta inventada, sin mandar nada (admin).
 * - GET  /admin/ml/log    últimas órdenes y preguntas procesadas (admin).
 *
 * Apagar: ML_AUTO_ORDERS = "0" o ML_AUTO_ANSWERS = "0" en las variables del worker. Apagado, todo
 * queda registrado para Juan (sin licencia, sin mensaje, sin respuesta).
 */
import { decryptMpToken, encryptMpToken, safeEqual, type MpEnv } from "./menu-portal-mp";
import faqConfig from "../../../marketing/mercadolibre/respuestas-automaticas.json";
import published from "../../../marketing/mercadolibre/publicadas.json";
import catalog from "../../../marketing/mercadolibre/publicaciones.json";

const ML_API = "https://api.mercadolibre.com";
const ML_TIMEOUT_MS = 15_000;
const MESSAGE_MAX = 350;
const TOKEN_ROW = "main";
const STALE_CLAIM_MS = 5 * 60_000;

export interface MlEnv extends MpEnv {
  ML_CLIENT_ID?: string;
  ML_CLIENT_SECRET?: string;
  /** Refresh token inicial. Después el vigente queda cifrado en D1 (ml_tokens): Mercado Libre lo rota en cada uso. */
  ML_REFRESH_TOKEN?: string;
  ML_SELLER_ID?: string;
  ML_SYNC_SECRET?: string;
  ML_AUTO_ORDERS?: string;
  ML_AUTO_ANSWERS?: string;
  /** Ventas creadas antes de esta fecha (ISO) no se procesan solas. */
  ML_ORDERS_SINCE?: string;
  LICENSE_ADMIN_SECRET: string;
}

type Ctx = { waitUntil(p: Promise<unknown>): void };

export type PlanName = "WalQo Completo" | "WalQo Pro" | "WalQo Permanente";

export interface LicenseSpec {
  plan: "basic" | "pro";
  billing: "monthly" | "perpetual";
  maxDevices: number;
  amount: number;
  days: number | null;
  buyerNote: string;
  clientName: string | null;
}

export type CreateLicense = (
  env: MlEnv,
  spec: LicenseSpec,
) => Promise<{ id: string; license_key: string; expires_at: string | null }>;

interface Listing {
  slug: string;
  plan: PlanName;
}

const LISTINGS: Map<string, Listing> = (() => {
  const planBySlug = new Map<string, PlanName>(
    (catalog as { items: { slug: string; plan: PlanName }[] }).items.map((i) => [i.slug, i.plan]),
  );
  const out = new Map<string, Listing>();
  for (const [key, p] of Object.entries(published as Record<string, { id: string }>)) {
    const slug = key.replace(/-(replaced|bloqueada)$/, "");
    const plan = planBySlug.get(slug);
    if (plan) out.set(p.id, { slug, plan });
  }
  return out;
})();

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function bearerIs(req: Request, secret: string | undefined): boolean {
  const auth = req.headers.get("authorization") ?? "";
  return !!secret && safeEqual(auth, `Bearer ${secret}`);
}

function nowIso(): string {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ token */

async function saveTokens(env: MlEnv, access: string, refresh: string, expiresIn: number): Promise<string> {
  const accessEnc = await encryptMpToken(env, "ml:access", access);
  const refreshEnc = await encryptMpToken(env, "ml:refresh", refresh);
  if (!accessEnc || !refreshEnc) throw new Error("Falta MP_TOKEN_KEY para guardar el token de Mercado Libre");
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO ml_tokens (id, access_enc, refresh_enc, expires_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(id) DO UPDATE SET access_enc = ?2, refresh_enc = ?3, expires_at = ?4, updated_at = ?5`,
  )
    .bind(TOKEN_ROW, accessEnc, refreshEnc, expiresAt, nowIso())
    .run();
  return expiresAt;
}

async function readTokenRow(env: MlEnv) {
  return env.DB.prepare(`SELECT access_enc, refresh_enc, expires_at FROM ml_tokens WHERE id = ?1`)
    .bind(TOKEN_ROW)
    .first<{ access_enc: string; refresh_enc: string; expires_at: string }>();
}

export async function mlAccessToken(env: MlEnv): Promise<{ token: string; expiresAt: string }> {
  const row = await readTokenRow(env);
  if (row && Date.parse(row.expires_at) - Date.now() > 5 * 60_000) {
    const token = await decryptMpToken(env, "ml:access", row.access_enc);
    if (token) return { token, expiresAt: row.expires_at };
  }
  const refresh = row ? await decryptMpToken(env, "ml:refresh", row.refresh_enc) : env.ML_REFRESH_TOKEN;
  if (!refresh || !env.ML_CLIENT_ID || !env.ML_CLIENT_SECRET) throw new Error("Mercado Libre sin configurar");

  const res = await fetch(`${ML_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.ML_CLIENT_ID,
      client_secret: env.ML_CLIENT_SECRET,
      refresh_token: refresh,
    }),
    signal: AbortSignal.timeout(ML_TIMEOUT_MS),
  });
  const t = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    message?: string;
  };
  if (!res.ok || !t.access_token) {
    // Otra ejecución pudo haber renovado con el mismo refresh token un instante antes.
    const again = await readTokenRow(env);
    if (again && again.expires_at !== row?.expires_at && Date.parse(again.expires_at) > Date.now()) {
      const token = await decryptMpToken(env, "ml:access", again.access_enc);
      if (token) return { token, expiresAt: again.expires_at };
    }
    throw new Error(`No se pudo renovar el token de Mercado Libre (${res.status} ${t.message ?? ""})`.trim());
  }
  const expiresAt = await saveTokens(env, t.access_token, t.refresh_token ?? refresh, t.expires_in ?? 21_600);
  return { token: t.access_token, expiresAt };
}

async function ml(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${ML_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(ML_TIMEOUT_MS),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, data };
}

/* ------------------------------------------------------------------ orders */

const PLAN_SPECS: Record<PlanName, Omit<LicenseSpec, "buyerNote" | "clientName">> = {
  "WalQo Completo": { plan: "basic", billing: "monthly", maxDevices: 2, amount: 35_000, days: 30 },
  "WalQo Pro": { plan: "pro", billing: "monthly", maxDevices: 3, amount: 60_000, days: 30 },
  "WalQo Permanente": { plan: "basic", billing: "perpetual", maxDevices: 1, amount: 12_000, days: null },
};

function licenseSpecFor(listing: Listing): Omit<LicenseSpec, "buyerNote" | "clientName"> {
  // Peluquería, barbería y estética: WalQo Completo con turnos y comisiones = licencia Pro de 2 PCs.
  if (listing.slug === "peluqueria-barberia-estetica" && listing.plan === "WalQo Completo") {
    return { plan: "pro", billing: "monthly", maxDevices: 2, amount: 35_000, days: 30 };
  }
  return PLAN_SPECS[listing.plan];
}

function fmtDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function buyerMessage(plan: PlanName, key: string, expiresAt: string | null): string {
  const what = expiresAt ? `${plan} (hasta el ${fmtDate(expiresAt)})` : `${plan} (no vence)`;
  const parts = [
    `¡Gracias por tu compra! Tu clave de ${what}: ${key}.`,
    "Descargá WalQo desde https://walqo.pro e instalalo en tu PC. Activala en Configuración > Funciones adicionales > Cambiar licencia.",
    "Si te trabás, escribinos por acá.",
    "Cuando lo tengas andando, ¡nos ayuda mucho tu calificación!",
  ];
  while (parts.join(" ").length > MESSAGE_MAX && parts.length > 2) parts.splice(parts.length - 2, 1);
  return parts.join(" ");
}

interface MlOrder {
  id: number | string;
  status: string;
  pack_id?: number | string | null;
  seller?: { id: number | string };
  buyer?: { id: number | string; nickname?: string };
  order_items?: { item: { id: string; title?: string }; quantity: number }[];
  date_created?: string;
  tags?: string[];
}

interface OrderDeps {
  env: MlEnv;
  createLicense: CreateLicense;
  /** null = prueba: no llama a Mercado Libre. */
  token: string | null;
  test: boolean;
}

interface OrderResult {
  order_id: string;
  status: "done" | "licensed" | "review" | "ignored" | "duplicate" | "dry_run";
  detail: string;
  slug?: string;
  plan?: PlanName;
  license_key?: string;
  message?: string;
  message_status?: string;
}

/** Por qué una orden no se resuelve sola, o null si se puede emitir la licencia. */
async function reviewReason(env: MlEnv, order: MlOrder, listing: Listing | undefined): Promise<string | null> {
  const lines = order.order_items ?? [];
  if (lines.length !== 1) return "La orden trae más de una publicación.";
  if (lines[0].quantity !== 1) return `Compró ${lines[0].quantity} unidades: lo resuelve Juan.`;
  if (!listing) return `Publicación desconocida (${lines[0].item.id}).`;
  if (env.ML_AUTO_ORDERS !== "1") return "La posventa automática está apagada (ML_AUTO_ORDERS).";
  if (env.ML_ORDERS_SINCE && order.date_created && Date.parse(order.date_created) < Date.parse(env.ML_ORDERS_SINCE)) {
    return "Venta anterior a la posventa automática: la atiende Juan.";
  }
  const prev = await env.DB.prepare(
    `SELECT order_id FROM ml_orders WHERE buyer_id = ?1 AND test = 0 AND license_key IS NOT NULL AND order_id != ?2 LIMIT 1`,
  )
    .bind(String(order.buyer?.id ?? ""), String(order.id))
    .first<{ order_id: string }>();
  if (prev) return `El comprador ya tiene licencia por la orden ${prev.order_id}: ¿renovación o segundo local?`;
  return null;
}

async function sendBuyerMessage(
  env: MlEnv,
  token: string,
  order: MlOrder,
  text: string,
): Promise<{ status: "sent" | "moderated" | "failed"; detail: string }> {
  const pack = String(order.pack_id ?? order.id);
  let r = await ml(token, "POST", `/messages/action_guide/packs/${pack}/option?tag=post_sale`, {
    option_id: "OTHER",
    text,
  });
  if (!r.ok && r.status === 403) {
    // Si el comprador ya escribió, la charla sigue por /messages sin elegir motivo.
    r = await ml(token, "POST", `/messages/packs/${pack}/sellers/${env.ML_SELLER_ID}?tag=post_sale`, {
      from: { user_id: String(env.ML_SELLER_ID) },
      to: { user_id: String(order.buyer?.id ?? "") },
      text,
    });
  }
  if (!r.ok) return { status: "failed", detail: `${r.status} ${r.data?.message ?? r.data?.error ?? ""}`.trim() };
  const moderation = r.data?.message_moderation?.status;
  if (r.data?.status === "moderated" || moderation === "rejected") {
    return { status: "moderated", detail: r.data?.message_moderation?.reason ?? "moderado" };
  }
  return { status: "sent", detail: "ok" };
}

async function upsertOrderRow(env: MlEnv, orderId: string, fields: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(fields);
  const sets = cols.map((c, i) => `${c} = ?${i + 2}`).join(", ");
  await env.DB.prepare(`UPDATE ml_orders SET ${sets}, updated_at = ?${cols.length + 2} WHERE order_id = ?1`)
    .bind(orderId, ...cols.map((c) => fields[c] ?? null), nowIso())
    .run();
}

/** Reserva la orden. false = ya la está procesando o la procesó otra notificación. */
async function claimOrder(env: MlEnv, order: MlOrder, listing: Listing | undefined, test: boolean): Promise<boolean> {
  const now = nowIso();
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO ml_orders
       (order_id, pack_id, item_id, slug, plan, buyer_id, buyer_nick, status, test, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'processing', ?8, ?9, ?9)`,
  )
    .bind(
      String(order.id),
      String(order.pack_id ?? order.id),
      order.order_items?.[0]?.item.id ?? null,
      listing?.slug ?? null,
      listing?.plan ?? null,
      String(order.buyer?.id ?? ""),
      order.buyer?.nickname ?? null,
      test ? 1 : 0,
      now,
    )
    .run();
  if ((ins.meta?.changes ?? 0) > 0) return true;
  const stale = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const re = await env.DB.prepare(
    `UPDATE ml_orders SET updated_at = ?2
     WHERE order_id = ?1 AND status = 'processing' AND license_key IS NULL AND updated_at < ?3`,
  )
    .bind(String(order.id), now, stale)
    .run();
  return (re.meta?.changes ?? 0) > 0;
}

async function retryMessage(deps: OrderDeps, order: MlOrder): Promise<OrderResult | null> {
  const row = await deps.env.DB.prepare(
    `SELECT status, plan, license_key, message_status, updated_at FROM ml_orders WHERE order_id = ?1`,
  )
    .bind(String(order.id))
    .first<{
      status: string;
      plan: PlanName;
      license_key: string | null;
      message_status: string | null;
      updated_at: string;
    }>();
  if (!row || row.status !== "licensed" || !row.license_key || !deps.token) return null;
  if (Date.now() - Date.parse(row.updated_at) < 10 * 60_000) return null;
  const lic = await deps.env.DB.prepare(`SELECT expires_at FROM licenses WHERE license_key = ?1`)
    .bind(row.license_key)
    .first<{ expires_at: string | null }>();
  const text = buyerMessage(row.plan, row.license_key, lic?.expires_at ?? null);
  const sent = await sendBuyerMessage(deps.env, deps.token, order, text);
  // Un solo reintento: si vuelve a fallar, el mensaje lo manda Juan.
  const status = sent.status === "sent" ? "done" : "review";
  await upsertOrderRow(deps.env, String(order.id), {
    status,
    message_status: sent.status,
    detail: sent.status === "sent" ? "Mensaje enviado (reintento)." : `Licencia emitida. Mandar el mensaje a mano: ${sent.detail}`,
  });
  return { order_id: String(order.id), status, detail: sent.detail, message_status: sent.status };
}

export async function processOrder(deps: OrderDeps, order: MlOrder, dryRun = false): Promise<OrderResult> {
  const { env } = deps;
  const orderId = String(order.id);
  if (String(order.seller?.id ?? "") !== String(env.ML_SELLER_ID)) {
    return { order_id: orderId, status: "ignored", detail: "La orden no es de esta cuenta." };
  }
  if (order.status !== "paid") {
    return { order_id: orderId, status: "ignored", detail: `Orden en estado ${order.status}: se espera el pago.` };
  }
  const listing = LISTINGS.get(order.order_items?.[0]?.item.id ?? "");
  const reason = await reviewReason(env, order, listing);

  if (dryRun) {
    if (reason) return { order_id: orderId, status: "review", detail: reason, slug: listing?.slug };
    const spec = licenseSpecFor(listing!);
    const fakeExp = spec.days ? new Date(Date.now() + spec.days * 86_400_000).toISOString() : null;
    const message = buyerMessage(listing!.plan, "GC-XXXX-XXXX-XXXX", fakeExp);
    return {
      order_id: orderId,
      status: "dry_run",
      detail: `Emitiría ${spec.plan}/${spec.billing}, ${spec.maxDevices} PC, $${spec.amount}${spec.days ? `, ${spec.days} días` : ""}.`,
      slug: listing!.slug,
      plan: listing!.plan,
      message,
    };
  }

  if (!(await claimOrder(env, order, listing, deps.test))) {
    return (await retryMessage(deps, order)) ?? { order_id: orderId, status: "duplicate", detail: "Ya procesada." };
  }
  if (reason) {
    await upsertOrderRow(env, orderId, { status: "review", detail: reason });
    return { order_id: orderId, status: "review", detail: reason, slug: listing?.slug };
  }

  const buyerNote = `Mercado Libre orden ${orderId}${deps.test ? " (PRUEBA)" : ""}`;
  const existing = await env.DB.prepare(`SELECT id, license_key, expires_at FROM licenses WHERE buyer_note = ?1 LIMIT 1`)
    .bind(buyerNote)
    .first<{ id: string; license_key: string; expires_at: string | null }>();
  const spec = licenseSpecFor(listing!);
  const lic =
    existing ??
    (await deps.createLicense(env, {
      ...spec,
      buyerNote,
      clientName: order.buyer?.nickname ? `ML ${order.buyer.nickname}` : null,
    }));
  await upsertOrderRow(env, orderId, {
    status: "licensed",
    license_id: lic.id,
    license_key: lic.license_key,
    detail: "Licencia emitida.",
  });

  const message = buyerMessage(listing!.plan, lic.license_key, lic.expires_at);
  if (!deps.token) {
    await upsertOrderRow(env, orderId, { status: "done", message_status: "test", detail: "Prueba: no se mandó mensaje." });
    return {
      order_id: orderId,
      status: "done",
      detail: "Prueba: licencia emitida, sin mensaje.",
      slug: listing!.slug,
      plan: listing!.plan,
      license_key: lic.license_key,
      message,
      message_status: "test",
    };
  }
  const sent = await sendBuyerMessage(env, deps.token, order, message);
  const status = sent.status === "sent" ? "done" : sent.status === "moderated" ? "review" : "licensed";
  await upsertOrderRow(env, orderId, {
    status,
    message_status: sent.status,
    detail: sent.status === "sent" ? "Licencia emitida y mensaje enviado." : `Licencia emitida. Mensaje: ${sent.detail}`,
  });
  return {
    order_id: orderId,
    status,
    detail: sent.detail,
    slug: listing!.slug,
    plan: listing!.plan,
    license_key: lic.license_key,
    message_status: sent.status,
  };
}

/* ------------------------------------------------------------------ questions */

interface FaqTopic {
  id: string;
  detectar: string[];
  no_responder_si?: string[];
  texto?: Record<string, string>;
  por_publicacion?: Record<string, string>;
}

interface FaqRubro {
  id: string;
  nombre: string;
  plan: PlanName;
  palabras: string[];
  detalle: string;
  especial?: string;
}

const FAQ = faqConfig as unknown as {
  max_caracteres_pregunta: number;
  saludo: string;
  despedida: string;
  no_responder_si: string[];
  temas: FaqTopic[];
  rubros: FaqRubro[];
  textos_rubro: Record<string, string>;
};

export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const anyMatch = (patterns: string[] | undefined, text: string) =>
  (patterns ?? []).some((p) => new RegExp(p).test(text));

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function rubroAnswer(text: string, listing: Listing): string | null {
  const found = FAQ.rubros.filter((r) => anyMatch(r.palabras, text));
  if (found.length !== 1) return null;
  const r = found[0];
  const vars = { nombre: r.nombre, detalle: r.detalle, plan: r.plan, especial: r.especial ?? "" };
  const t = FAQ.textos_rubro;
  if (listing.plan === "WalQo Permanente") {
    return fill(r.especial || r.plan === "WalQo Pro" ? t.permanente_especial : t.permanente_general, vars);
  }
  if (listing.plan === r.plan) return fill(t.mismo_plan, vars);
  if (r.plan === "WalQo Pro") return fill(t.pide_pro, vars);
  return fill(t.alcanza_completo, vars);
}

export interface FaqMatch {
  topics: string[];
  answer: string | null;
  reason: string;
}

export function matchFaq(rawText: string, listing: Listing): FaqMatch {
  const text = normalizeQuestion(rawText);
  if (text.length > FAQ.max_caracteres_pregunta) return { topics: [], answer: null, reason: "Pregunta larga." };
  if (anyMatch(FAQ.no_responder_si, text)) return { topics: [], answer: null, reason: "Tema que responde Juan." };

  const hits = FAQ.temas.filter((t) => anyMatch(t.detectar, text) && !anyMatch(t.no_responder_si, text));
  const topics = hits.map((t) => t.id);
  if (!hits.length) return { topics, answer: null, reason: "No coincide con ninguna pregunta frecuente." };
  if (hits.length > 2) return { topics, answer: null, reason: "Mezcla demasiados temas." };

  const parts: string[] = [];
  for (const t of hits) {
    const piece =
      t.id === "rubro"
        ? rubroAnswer(text, listing)
        : t.por_publicacion?.[listing.slug] ?? t.texto?.[listing.plan] ?? t.texto?.todos ?? null;
    if (!piece) return { topics, answer: null, reason: `No hay respuesta segura para «${t.id}».` };
    parts.push(piece);
  }
  return { topics, answer: `${FAQ.saludo}${parts.join(" ")}${FAQ.despedida}`.trim(), reason: "ok" };
}

interface MlQuestion {
  id: number | string;
  item_id: string;
  seller_id?: number | string;
  status: string;
  text: string;
}

interface QuestionResult {
  question_id: string;
  status: "answered" | "pending" | "ignored" | "duplicate" | "dry_run" | "failed";
  detail: string;
  topics?: string[];
  answer?: string | null;
}

export async function processQuestion(
  env: MlEnv,
  token: string | null,
  q: MlQuestion,
  dryRun = false,
): Promise<QuestionResult> {
  const qid = String(q.id);
  if (q.seller_id != null && String(q.seller_id) !== String(env.ML_SELLER_ID)) {
    return { question_id: qid, status: "ignored", detail: "No es de esta cuenta." };
  }
  if (q.status !== "UNANSWERED") return { question_id: qid, status: "ignored", detail: `Estado ${q.status}.` };
  const listing = LISTINGS.get(q.item_id);
  const m = listing ? matchFaq(q.text, listing) : { topics: [], answer: null, reason: "Publicación desconocida." };
  const willAnswer = !!m.answer && env.ML_AUTO_ANSWERS === "1";
  const detail = m.answer && !willAnswer ? "Respuestas automáticas apagadas (ML_AUTO_ANSWERS)." : m.reason;

  if (dryRun) {
    return { question_id: qid, status: "dry_run", detail, topics: m.topics, answer: m.answer };
  }

  const now = nowIso();
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO ml_questions (question_id, item_id, text, status, topics, answer, detail, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'processing', ?4, ?5, ?6, ?7, ?7)`,
  )
    .bind(qid, q.item_id, q.text.slice(0, 2000), m.topics.join(","), m.answer, detail, now)
    .run();
  if ((ins.meta?.changes ?? 0) === 0) return { question_id: qid, status: "duplicate", detail: "Ya procesada." };

  let status: QuestionResult["status"] = "pending";
  let finalDetail = detail;
  if (willAnswer && token) {
    const r = await ml(token, "POST", "/answers", { question_id: Number(q.id), text: m.answer });
    status = r.ok ? "answered" : "failed";
    if (!r.ok) finalDetail = `No se pudo responder: ${r.status} ${r.data?.message ?? ""}`.trim();
  }
  await env.DB.prepare(`UPDATE ml_questions SET status = ?2, detail = ?3, updated_at = ?4 WHERE question_id = ?1`)
    .bind(qid, status, finalDetail, nowIso())
    .run();
  return { question_id: qid, status, detail: finalDetail, topics: m.topics, answer: m.answer };
}

/* ------------------------------------------------------------------ rutas */

async function logEvent(env: MlEnv, topic: string, resource: string, result: string): Promise<void> {
  try {
    await env.DB.prepare(`INSERT INTO ml_events (topic, resource, result, created_at) VALUES (?1, ?2, ?3, ?4)`)
      .bind(topic, resource.slice(0, 120), result.slice(0, 500), nowIso())
      .run();
  } catch (e) {
    console.log("ml_event_log_failed", String(e));
  }
}

async function handleNotification(env: MlEnv, createLicense: CreateLicense, topic: string, resource: string) {
  try {
    const { token } = await mlAccessToken(env);
    if (topic === "orders_v2") {
      const r = await ml(token, "GET", resource);
      if (!r.ok) return logEvent(env, topic, resource, `GET ${r.status}`);
      const out = await processOrder({ env, createLicense, token, test: false }, r.data as MlOrder);
      return logEvent(env, topic, resource, `${out.status}: ${out.detail}`);
    }
    const r = await ml(token, "GET", `${resource}?api_version=4`);
    if (!r.ok) return logEvent(env, topic, resource, `GET ${r.status}`);
    const out = await processQuestion(env, token, r.data as MlQuestion);
    return logEvent(env, topic, resource, `${out.status}: ${out.detail}`);
  } catch (e) {
    return logEvent(env, topic, resource, `error: ${String(e).slice(0, 300)}`);
  }
}

export async function handleMlNotify(req: Request, env: MlEnv, ctx: Ctx, createLicense: CreateLicense) {
  let body: { topic?: string; resource?: string; user_id?: number | string; application_id?: number | string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false }, 400);
  }
  const topic = String(body.topic ?? "");
  const resource = String(body.resource ?? "");
  const ours =
    String(body.user_id ?? "") === String(env.ML_SELLER_ID) &&
    String(body.application_id ?? "") === String(env.ML_CLIENT_ID);
  const valid =
    (topic === "orders_v2" && /^\/orders\/\d{1,20}$/.test(resource)) ||
    (topic === "questions" && /^\/questions\/\d{1,20}$/.test(resource));
  if (ours && valid) ctx.waitUntil(handleNotification(env, createLicense, topic, resource));
  // Siempre 200: si no, Mercado Libre reintenta y termina desactivando el tópico.
  return json({ ok: true });
}

/**
 * Cada 5 minutos (cron): preguntas sin responder y ventas pagadas de los últimos 3 días.
 * Cubre lo mismo que las notificaciones, por si no están configuradas o alguna se pierde.
 * Sin permiso de ventas, /orders/search da 403 y se sigue solo con las preguntas.
 */
export async function pollMercadoLibre(env: MlEnv, createLicense: CreateLicense): Promise<void> {
  let token: string;
  try {
    token = (await mlAccessToken(env)).token;
  } catch (e) {
    const last = await env.DB.prepare(`SELECT result FROM ml_events ORDER BY id DESC LIMIT 1`).first<{ result: string }>();
    const msg = `error: ${String(e).slice(0, 300)}`;
    if (last?.result !== msg) await logEvent(env, "poll", "token", msg);
    return;
  }

  const qs = await ml(
    token,
    "GET",
    `/questions/search?seller_id=${env.ML_SELLER_ID}&status=UNANSWERED&api_version=4&sort_fields=date_created&sort_types=DESC&limit=50`,
  );
  for (const q of (qs.ok ? qs.data?.questions : null) ?? []) {
    const out = await processQuestion(env, token, q as MlQuestion);
    if (out.status !== "duplicate") await logEvent(env, "poll:questions", `/questions/${q.id}`, `${out.status}: ${out.detail}`);
  }

  const from = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const os = await ml(
    token,
    "GET",
    `/orders/search?seller=${env.ML_SELLER_ID}&order.status=paid&order.date_created.from=${encodeURIComponent(from)}&sort=date_desc&limit=50`,
  );
  const orders = ((os.ok ? os.data?.results : null) ?? []) as MlOrder[];
  if (!orders.length) return;
  const ids = orders.map((o) => String(o.id));
  const known = await env.DB.prepare(
    `SELECT order_id, status FROM ml_orders WHERE order_id IN (${ids.map((_, i) => `?${i + 1}`).join(",")})`,
  )
    .bind(...ids)
    .all<{ order_id: string; status: string }>();
  const done = new Map((known.results ?? []).map((r) => [r.order_id, r.status]));
  for (const o of orders) {
    const st = done.get(String(o.id));
    if (st && st !== "licensed" && st !== "processing") continue;
    const out = await processOrder({ env, createLicense, token, test: false }, o);
    if (out.status !== "duplicate") await logEvent(env, "poll:orders", `/orders/${o.id}`, `${out.status}: ${out.detail}`);
  }
}

/** Tokens nuevos después de volver a autorizar la cuenta (scripts/mercadolibre/connect.mjs). */
export async function handleMlSeed(req: Request, env: MlEnv) {
  if (!bearerIs(req, env.ML_SYNC_SECRET)) return json({ ok: false, error: "No autorizado" }, 401);
  const b = (await req.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!b.access_token || !b.refresh_token) return json({ ok: false, error: "Faltan tokens" }, 400);
  const me = await ml(b.access_token, "GET", "/users/me");
  if (!me.ok || String(me.data?.id) !== String(env.ML_SELLER_ID)) {
    return json({ ok: false, error: "El token no es de la cuenta vendedora" }, 400);
  }
  const expiresAt = await saveTokens(env, b.access_token, b.refresh_token, b.expires_in ?? 21_600);
  return json({ ok: true, expires_at: expiresAt });
}

export async function handleMlToken(req: Request, env: MlEnv) {
  if (!bearerIs(req, env.ML_SYNC_SECRET)) return json({ ok: false, error: "No autorizado" }, 401);
  try {
    const { token, expiresAt } = await mlAccessToken(env);
    return json({ ok: true, access_token: token, expires_at: expiresAt });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 502);
  }
}

/**
 * Prueba sin Mercado Libre. Body:
 *   { order: {...}, issue_license?: true }   orden inventada; sin issue_license no escribe nada.
 *   { question: { id, item_id, text, status } } pregunta inventada; nunca responde.
 */
export async function handleMlTest(req: Request, env: MlEnv, createLicense: CreateLicense) {
  if (!bearerIs(req, env.LICENSE_ADMIN_SECRET)) return json({ ok: false, error: "No autorizado" }, 401);
  const body = (await req.json().catch(() => ({}))) as {
    order?: MlOrder;
    question?: MlQuestion;
    issue_license?: boolean;
  };
  const testEnv: MlEnv = { ...env, ML_AUTO_ORDERS: "1", ML_AUTO_ANSWERS: "1" };
  if (body.order) {
    const order = { ...body.order, id: `TEST-${body.order.id}` };
    const out = await processOrder({ env: testEnv, createLicense, token: null, test: true }, order, !body.issue_license);
    return json({ ok: true, result: out });
  }
  if (body.question) {
    const out = await processQuestion(testEnv, null, body.question, true);
    return json({ ok: true, result: out });
  }
  return json({ ok: false, error: "Falta order o question" }, 400);
}

export async function handleMlLog(req: Request, env: MlEnv) {
  if (!bearerIs(req, env.LICENSE_ADMIN_SECRET)) return json({ ok: false, error: "No autorizado" }, 401);
  const [orders, questions, events] = await Promise.all([
    env.DB.prepare(
      `SELECT order_id, item_id, slug, plan, buyer_nick, status, detail, license_key, message_status, test, created_at, updated_at
       FROM ml_orders ORDER BY created_at DESC LIMIT 50`,
    ).all(),
    env.DB.prepare(
      `SELECT question_id, item_id, text, status, topics, answer, detail, created_at
       FROM ml_questions ORDER BY created_at DESC LIMIT 50`,
    ).all(),
    env.DB.prepare(`SELECT topic, resource, result, created_at FROM ml_events ORDER BY id DESC LIMIT 50`).all(),
  ]);
  return json({
    ok: true,
    auto_orders: env.ML_AUTO_ORDERS === "1",
    auto_answers: env.ML_AUTO_ANSWERS === "1",
    orders: orders.results ?? [],
    questions: questions.results ?? [],
    events: events.results ?? [],
  });
}
