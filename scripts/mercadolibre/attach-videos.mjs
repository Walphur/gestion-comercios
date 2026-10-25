/**
 * Videos de las publicaciones de Mercado Libre.
 *
 * Por defecto NO toca las publicaciones: arma marketing/mercadolibre/videos/subir.json con,
 * por rubro, el archivo de video y el enlace directo a «Videos > Crear video» de la
 * Central de vendedores (el camino para cuentas de Argentina).
 * Si el token guardado sigue vigente, lee user_product_id con GET /items (solo lectura,
 * sin renovar el token).
 *
 *   node scripts/mercadolibre/attach-videos.mjs
 *
 * --upload --yes: sube cada mp4 como Clip por API. El endpoint documentado es el de
 * Global Selling (POST /marketplace/items/{id}/clips/upload); para vendedores locales de MLA
 * no hay documentación oficial y puede rechazarlo. Correr solo si Juan lo pide.
 *   node scripts/mercadolibre/attach-videos.mjs --upload --yes [slug ...]
 *
 * --youtube <json>: carga video_id de YouTube ({ "slug": "ID" }). ML desactivó YouTube en
 * publicaciones nuevas en septiembre de 2024; queda solo por si lo vuelven a aceptar.
 *
 * Credenciales: %LOCALAPPDATA%\WalQo\mercadolibre\credentials.json (fuera del repo, nunca se imprimen).
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const API = "https://api.mercadolibre.com";
const CRED_PATH = path.join(process.env.LOCALAPPDATA ?? "", "WalQo", "mercadolibre", "credentials.json");
const PUBLISHED = path.join(ROOT, "marketing", "mercadolibre", "publicadas.json");
const VIDEOS = path.join(ROOT, "marketing", "mercadolibre", "videos");
const DESKTOP_VIDEOS = path.join(process.env.USERPROFILE ?? "", "Desktop", "WalQo Mercado Libre", "videos");

const args = process.argv.slice(2);
const UPLOAD = args.includes("--upload");
const YES = args.includes("--yes");
const ytIdx = args.indexOf("--youtube");
const YOUTUBE = ytIdx >= 0 ? args[ytIdx + 1] : null;
const only = args.filter((a, i) => !a.startsWith("--") && (ytIdx < 0 || i !== ytIdx + 1));

async function readJson(p, fallback) {
  if (!existsSync(p)) return fallback;
  return JSON.parse((await readFile(p, "utf8")).replace(/^\uFEFF/, ""));
}

async function tokenIfValid() {
  const cred = await readJson(CRED_PATH, null);
  if (!cred?.access_token) return null;
  const expiresAt = Date.parse(cred.expires_at ?? 0);
  if (Date.now() < expiresAt - 5 * 60_000) return cred.access_token;
  if (!cred.refresh_token || !cred.client_secret) return null;
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
    }),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  cred.access_token = t.access_token;
  cred.refresh_token = t.refresh_token ?? cred.refresh_token;
  cred.expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await writeFile(CRED_PATH, JSON.stringify(cred, null, 2), "utf8");
  return cred.access_token;
}

function videoFile(slug) {
  for (const dir of [VIDEOS, DESKTOP_VIDEOS]) {
    const f = path.join(dir, `${slug}.mp4`);
    if (existsSync(f)) return f;
  }
  return null;
}

function creatorUrl(itemId, userProductId) {
  const q = new URLSearchParams();
  if (userProductId) q.set("user_product_id", userProductId);
  q.set("item_id", itemId);
  q.set("item_syi", itemId);
  return `https://vendedores.mercadolibre.com.ar/video/creator/upload?${q}`;
}

async function readItems(token, ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const res = await fetch(`${API}/items?ids=${chunk.join(",")}&attributes=id,user_product_id,status,title`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return out;
    for (const row of await res.json()) if (row?.body?.id) out[row.body.id] = row.body;
  }
  return out;
}

async function uploadClip(token, itemId, file) {
  const form = new FormData();
  form.append("file", new Blob([await readFile(file)], { type: "video/mp4" }), path.basename(file));
  form.append("sites", JSON.stringify([{ site_id: "MLA", logistic_type: "remote" }]));
  const res = await fetch(`${API}/marketplace/items/${itemId}/clips/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 400) };
}

async function setYoutube(token, itemId, ytId) {
  const res = await fetch(`${API}/items/${itemId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ video_id: ytId }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 400) };
}

const published = await readJson(PUBLISHED, {});
const slugs = Object.keys(published).filter((s) => !s.endsWith("-bloqueada") && (!only.length || only.includes(s)));
const token = await tokenIfValid();
const items = token ? await readItems(token, slugs.map((s) => published[s].id)) : {};

const rows = slugs.map((slug) => {
  const p = published[slug];
  const it = items[p.id] ?? {};
  const file = videoFile(slug);
  return {
    slug,
    item_id: p.id,
    user_product_id: it.user_product_id ?? null,
    status: it.status ?? p.status,
    file: file ? path.relative(ROOT, file).startsWith("..") ? file : path.relative(ROOT, file) : null,
    upload_url: creatorUrl(p.id, it.user_product_id),
    permalink: p.permalink,
  };
});

if (!UPLOAD && !YOUTUBE) {
  await writeFile(path.join(VIDEOS, "subir.json"), JSON.stringify(rows, null, 2) + "\n", "utf8");
  for (const r of rows) console.log(`${r.slug.padEnd(30)} ${r.file ? "video listo" : "SIN VIDEO  "}  ${r.upload_url}`);
  console.log(token ? "" : "\n(token vencido o ausente: los enlaces van sin user_product_id; la pantalla de ML igual deja elegir la publicación)");
  process.exit(0);
}

if (!YES) {
  console.log("Falta --yes. Esto modifica publicaciones activas; correr solo si Juan lo pide.");
  process.exit(1);
}
if (!token) {
  console.log("El token guardado venció. Renovalo con el flujo de publish.mjs antes de subir.");
  process.exit(1);
}

const yt = YOUTUBE ? await readJson(path.resolve(YOUTUBE), {}) : null;
for (const r of rows) {
  if (yt) {
    if (!yt[r.slug]) continue;
    const res = await setYoutube(token, r.item_id, yt[r.slug]);
    console.log(r.slug, res.ok ? "video_id cargado" : `error ${res.status}: ${res.body}`);
    continue;
  }
  if (!r.file) { console.log(r.slug, "sin video"); continue; }
  const res = await uploadClip(token, r.item_id, path.resolve(ROOT, r.file));
  console.log(r.slug, res.ok ? `clip enviado a moderación: ${res.body}` : `error ${res.status}: ${res.body}`);
}
