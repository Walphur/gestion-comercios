/**
 * Publica en Mercado Libre las publicaciones de marketing/mercadolibre/publicaciones.json.
 *
 *   node scripts/mercadolibre/publish.mjs --validate        valida sin publicar
 *   node scripts/mercadolibre/publish.mjs --publish         publica las que falten
 *   node scripts/mercadolibre/publish.mjs --publish kiosco-almacen
 *   node scripts/mercadolibre/publish.mjs --update-pictures kiosco-almacen   reemplaza las fotos
 *   node scripts/mercadolibre/publish.mjs --update-title ropa-indumentaria   cambia el título
 *   node scripts/mercadolibre/publish.mjs --republish consultorio-clinica  publica una nueva y guarda la vieja como <slug>-replaced
 *   node scripts/mercadolibre/publish.mjs --status          estado de lo publicado y moderaciones
 *
 * Credenciales y tokens: %LOCALAPPDATA%\WalQo\mercadolibre\credentials.json (fuera del repo).
 * Lo ya publicado queda en marketing/mercadolibre/publicadas.json y no se vuelve a publicar.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { LISTINGS } from "./listings.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const API = "https://api.mercadolibre.com";
const CRED_PATH = path.join(process.env.LOCALAPPDATA, "WalQo", "mercadolibre", "credentials.json");
const PUBLISHED_PATH = path.join(ROOT, "marketing", "mercadolibre", "publicadas.json");
const CATEGORY_ID = "MLA1728";

const args = process.argv.slice(2);
const republish = args.includes("--republish");
const mode = args.includes("--publish") || republish ? "publish" : "validate";
const only = args.filter((a) => !a.startsWith("--"));

async function readJson(p, fallback) {
  if (!existsSync(p)) return fallback;
  return JSON.parse((await readFile(p, "utf8")).replace(/^\uFEFF/, ""));
}

async function getToken() {
  const cred = await readJson(CRED_PATH, null);
  if (!cred?.access_token) throw new Error("Falta conectar la cuenta de Mercado Libre.");
  const expiresAt = Date.parse(cred.expires_at ?? 0);
  if (Date.now() < expiresAt - 5 * 60_000) return cred.access_token;

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
  const t = await res.json();
  if (!res.ok) throw new Error(`No se pudo renovar el acceso: ${t.message ?? res.status}`);
  cred.access_token = t.access_token;
  cred.refresh_token = t.refresh_token ?? cred.refresh_token;
  cred.expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await writeFile(CRED_PATH, JSON.stringify(cred, null, 2), "utf8");
  return cred.access_token;
}

async function api(token, method, url, body) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, data };
}

async function uploadPicture(token, relPath) {
  const buf = await readFile(path.join(ROOT, relPath));
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "image/jpeg" }), path.basename(relPath));
  const res = await fetch(`${API}/pictures/items/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Foto ${relPath}: ${data.message ?? res.status}`);
  return data.id;
}

function buildItem(item, version, pictures) {
  const permanente = item.plan === "WalQo Permanente";
  const model = LISTINGS.find((l) => l.slug === item.slug)?.ml_model ?? item.plan;
  const attributes = [
    { id: "DEVELOPER", value_name: "WalQo" },
    { id: "SOFTWARE_NAME", value_name: model },
    { id: "VERSION", value_name: version },
    { id: "BRAND", value_name: "WalQo" },
    { id: "MODEL", value_name: model },
    { id: "FORMAT", value_id: "2132699" },
    { id: "COMPATIBLE_OS_NAMES", value_id: "4804541" },
    { id: "COMPATIBLE_OS_VERSIONS", value_name: "10, 11" },
    { id: "INCLUDES_INSTALLATION_GUIDE", value_id: "242085" },
    { id: "ITEM_CONDITION", value_id: "2230284" },
    { id: "EMPTY_GTIN_REASON", value_id: "17055160" },
    { id: "SELLER_SKU", value_name: `WALQO-${item.slug}`.toUpperCase() },
  ];
  if (!permanente) attributes.push({ id: "LICENSE_TIME", value_name: "1 meses" });

  return {
    family_name: item.title,
    category_id: CATEGORY_ID,
    price: item.price,
    currency_id: item.currency_id,
    available_quantity: item.available_quantity,
    buying_mode: item.buying_mode,
    condition: item.condition,
    listing_type_id: item.listing_type_id,
    pictures,
    attributes,
    shipping: { mode: "not_specified", local_pick_up: false, free_shipping: false },
  };
}

function errorText(data) {
  const all = [data?.cause ?? []].flat();
  const causes = all
    .filter((c) => c.type !== "warning")
    .map((c) => `  - ${c.code}: ${c.message}`);
  const warnings = all
    .filter((c) => c.type === "warning")
    .map((c) => `  (aviso) ${c.code}: ${c.message}`);
  const text = [data?.message ?? data?.error, ...causes, ...warnings].filter(Boolean).join("\n");
  return args.includes("--verbose") ? `${text}\n${JSON.stringify(data, null, 2)}` : text;
}

async function printStatus(token, published) {
  const ids = new Map(Object.entries(published).map(([slug, p]) => [p.id, slug]));
  for (const [slug, { id }] of Object.entries(published)) {
    const { data } = await api(token, "GET", `/items/${id}?attributes=status,sub_status,pictures,category_id,title`);
    const sub = data?.sub_status?.length ? ` (${data.sub_status.join(", ")})` : "";
    const cat = data?.category_id === CATEGORY_ID ? "" : `  categoría: ${data?.category_id}`;
    console.log(`${slug.padEnd(30)} ${id}  ${data?.status}${sub}  fotos: ${data?.pictures?.length ?? "?"}${cat}`);
    if (args.includes("--verbose")) console.log(`  ${data?.title}`);
  }
  const cred = await readJson(CRED_PATH, null);
  const { data } = await api(token, "GET", `/moderations/infractions/${cred.user_id}`);
  const list = data?.infractions ?? data?.results ?? (Array.isArray(data) ? data : []);
  for (const x of list) {
    const slug = ids.get(x.element_id ?? x.item_id) ?? x.element_id ?? x.item_id;
    console.log(`! ${slug} ${x.date_created ?? ""} ${x.reason ?? ""} ${x.remedy ?? ""}`.trim());
    if (args.includes("--verbose")) console.log(JSON.stringify(x, null, 2));
  }
  if (!list.length) console.log("Sin infracciones.");
}

async function main() {
  const { items } = await readJson(path.join(ROOT, "marketing/mercadolibre/publicaciones.json"));
  const { version } = await readJson(path.join(ROOT, "package.json"));
  const published = await readJson(PUBLISHED_PATH, {});
  const token = await getToken();
  if (args.includes("--status")) return printStatus(token, published);

  const todo = items.filter((i) => (only.length ? only.includes(i.slug) : true));
  let failed = 0;

  if (republish && only.length !== 1) throw new Error("--republish va con un solo rubro.");

  for (const item of todo) {
    if (published[item.slug] && !republish) {
      if (args.includes("--update-title")) {
        const { id } = published[item.slug];
        let r = await api(token, "PUT", `/items/${id}`, { title: item.title });
        if (!r.ok) r = await api(token, "PUT", `/items/${id}`, { family_name: item.title });
        if (r.ok) console.log(`OK ${item.slug}: título «${r.data.title}» (${r.data.status})`);
        else {
          failed++;
          console.log(`X ${item.slug}: título (${r.status})\n${errorText(r.data)}`);
        }
        continue;
      }
      if (!args.includes("--update-pictures")) {
        console.log(`= ${item.slug}: ya publicada (${published[item.slug].permalink})`);
        continue;
      }
      const { id } = published[item.slug];
      const pics = await Promise.all(item.pictures.map(async (p) => ({ id: await uploadPicture(token, p.path) })));
      const r = await api(token, "PUT", `/items/${id}`, { pictures: pics });
      if (r.ok) console.log(`OK ${item.slug}: fotos actualizadas (${r.data.status})`);
      else {
        failed++;
        console.log(`X ${item.slug}: fotos (${r.status})\n${errorText(r.data)}`);
      }
      continue;
    }

    const pictures =
      mode === "publish"
        ? await Promise.all(item.pictures.map(async (p) => ({ id: await uploadPicture(token, p.path) })))
        : [{ source: "https://walqo.pro/assets/shots/kiosco/caja-venta.jpg" }];
    const body = buildItem(item, version, pictures);

    if (mode === "validate") {
      const r = await api(token, "POST", "/items/validate", body);
      if (r.ok) console.log(`OK ${item.slug}`);
      else {
        failed++;
        console.log(`X ${item.slug} (${r.status})\n${errorText(r.data)}`);
      }
      continue;
    }

    const r = await api(token, "POST", "/items", body);
    if (!r.ok) {
      failed++;
      console.log(`X ${item.slug} (${r.status})\n${errorText(r.data)}`);
      continue;
    }
    const id = r.data.id;
    const d = await api(token, "POST", `/items/${id}/description`, { plain_text: item.description.plain_text });
    if (!d.ok) console.log(`  (aviso) ${item.slug}: no se cargó la descripción: ${errorText(d.data)}`);

    if (republish && published[item.slug]) {
      published[`${item.slug}-replaced`] = { ...published[item.slug], replaced_by: id };
    }
    published[item.slug] = {
      id,
      permalink: r.data.permalink,
      price: item.price,
      status: r.data.status,
      published_at: new Date().toISOString(),
    };
    await writeFile(PUBLISHED_PATH, JSON.stringify(published, null, 2) + "\n", "utf8");
    console.log(`OK ${item.slug}: ${id} ${r.data.status} ${r.data.permalink}`);
  }

  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
