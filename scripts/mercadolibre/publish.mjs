/**
 * Publica en Mercado Libre las publicaciones de marketing/mercadolibre/publicaciones.json.
 *
 *   node scripts/mercadolibre/publish.mjs --validate        valida sin publicar
 *   node scripts/mercadolibre/publish.mjs --publish         publica las que falten
 *   node scripts/mercadolibre/publish.mjs --publish kiosco-almacen
 *   node scripts/mercadolibre/publish.mjs --update-pictures kiosco-almacen   reemplaza las fotos
 *   node scripts/mercadolibre/publish.mjs --update-title ropa-indumentaria   cambia el título
 *   node scripts/mercadolibre/publish.mjs --republish consultorio-clinica  publica una nueva y guarda la vieja como <slug>-replaced
 *     --live-pictures: la nueva usa las fotos que ML ya aprobó en la vieja (no sube las locales)
 *     --close-old: cierra la vieja después de publicar la nueva
 *   node scripts/mercadolibre/publish.mjs --status          estado de lo publicado y moderaciones
 *
 * Credenciales y tokens: %LOCALAPPDATA%\WalQo\mercadolibre\credentials.json (fuera del repo).
 * Lo ya publicado queda en marketing/mercadolibre/publicadas.json y no se vuelve a publicar.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LISTINGS } from "./listings.mjs";
import { API, CRED_PATH, api, getToken, readJson } from "./auth.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PUBLISHED_PATH = path.join(ROOT, "marketing", "mercadolibre", "publicadas.json");
const CATEGORY_ID = "MLA1728";

const args = process.argv.slice(2);
const republish = args.includes("--republish");
const mode = args.includes("--publish") || republish ? "publish" : "validate";
const only = args.filter((a) => !a.startsWith("--"));

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

    let pictures =
      mode === "publish" && !(republish && args.includes("--live-pictures"))
        ? await Promise.all(item.pictures.map(async (p) => ({ id: await uploadPicture(token, p.path) })))
        : [{ source: "https://walqo.pro/assets/shots/kiosco/caja-venta.jpg" }];
    if (mode === "publish" && republish && args.includes("--live-pictures")) {
      const old = await api(token, "GET", `/items/${published[item.slug].id}?attributes=pictures`);
      pictures = (old.data?.pictures ?? []).map((p) => ({ id: p.id }));
      if (!pictures.length) throw new Error(`${item.slug}: la publicación vieja no tiene fotos`);
    }
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
      const old = published[item.slug];
      published[`${item.slug}-replaced`] = { ...old, replaced_by: id };
      if (args.includes("--close-old")) {
        const c = await api(token, "PUT", `/items/${old.id}`, { status: "closed" });
        published[`${item.slug}-replaced`].status = c.ok ? "closed" : old.status;
        console.log(c.ok ? `  vieja ${old.id} cerrada` : `  (aviso) no se pudo cerrar ${old.id}: ${errorText(c.data)}`);
      }
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
