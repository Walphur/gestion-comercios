#!/usr/bin/env node
/**
 * Publicaciones de Mercado Libre por rubro: publicaciones.md, publicaciones.json e imágenes
 * 1200×1200 en marketing/mercadolibre/<rubro>/.
 * Uso: node scripts/build-mercadolibre.mjs [--solo-textos] [slug]
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { LISTINGS, attributesFor, formatPrice, priceWithFee, ML_FEE_ESTIMATE } from "./mercadolibre/listings.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "marketing", "mercadolibre");
const args = process.argv.slice(2);
const onlyText = args.includes("--solo-textos");
const onlySlug = args.find((a) => !a.startsWith("--"));

const SRC = {
  docs: path.join(ROOT, "docs", "assets", "shots"),
  cap: path.join(OUT, "capturas"),
};
const fileUrl = (p) => pathToFileURL(p).href;

function resolveShot(ref) {
  const spec = typeof ref === "string" ? { src: ref } : ref;
  const [kind, rel] = spec.src.split(":");
  const abs = path.join(SRC[kind], rel);
  if (!fs.existsSync(abs)) throw new Error(`Falta la captura ${spec.src}`);
  return { url: fileUrl(abs), cropTop: spec.cropTop ?? 0, cropBottom: spec.cropBottom ?? 0 };
}

/* ---------------- validación ---------------- */

const problems = [];
for (const l of LISTINGS) {
  if (l.title.length > 60) problems.push(`${l.slug}: título de ${l.title.length} caracteres`);
  if (/[—–]/.test(l.description)) problems.push(`${l.slug}: guion largo en la descripción`);
  if (/https?:|www\.|\.pro\b|\.com\b/i.test(l.description)) problems.push(`${l.slug}: link en la descripción`);
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(l.description + l.title)) problems.push(`${l.slug}: emoji`);
  if (/<[a-z]/i.test(l.description)) problems.push(`${l.slug}: HTML en la descripción`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

/* ---------------- imágenes ---------------- */

const WORDMARK = fileUrl(path.join(ROOT, "docs", "branding", "walqo-wordmark.png"));

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1200px; height: 1200px; }
body {
  position: relative; overflow: hidden;
  font-family: Satoshi, "Segoe UI", system-ui, sans-serif; color: #0b1220;
  background:
    radial-gradient(700px 420px at 12% 0%, rgba(75,139,255,0.13), transparent 70%),
    radial-gradient(640px 420px at 100% 100%, rgba(139,92,246,0.10), transparent 70%),
    #f7f9fd;
}
.top { position: absolute; left: 72px; right: 72px; top: 60px; }
.brand { height: 50px; display: block; }
h1 { margin-top: 34px; font-size: 60px; line-height: 1.04; font-weight: 900; letter-spacing: -0.025em; max-width: 1056px; }
h1.small { font-size: 54px; }
p.sub { margin-top: 18px; font-size: 29px; line-height: 1.3; color: #46526a; font-weight: 500; max-width: 1000px; }
.extra .top { top: 70px; }
.extra h1 { margin-top: 0; font-size: 56px; }
.footer-brand { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); height: 34px; opacity: 0.9; }

.laptop { position: absolute; left: 50%; transform: translateX(-50%); }
.laptop .lid {
  background: #0f1729; border-radius: 26px 26px 10px 10px; padding: 22px 22px 26px;
  box-shadow: 0 40px 80px -30px rgba(15,23,41,0.45), 0 0 0 2px #273249 inset;
}
.laptop .screen { border-radius: 6px; overflow: hidden; background: #fff; aspect-ratio: 16 / 10; }
.laptop .screen img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top left; }
.laptop .base {
  position: relative; height: 26px; margin: 0 -70px;
  background: linear-gradient(#dfe4ee, #b9c1d0); border-radius: 2px 2px 22px 22px;
  box-shadow: 0 24px 40px -18px rgba(15,23,41,0.35);
}
.laptop .base::before {
  content: ""; position: absolute; left: 50%; top: 0; transform: translateX(-50%);
  width: 180px; height: 10px; background: #a9b2c3; border-radius: 0 0 12px 12px;
}

.phone {
  position: absolute; background: #0f1729; border-radius: 46px; padding: 34px 12px 18px;
  box-shadow: 0 40px 70px -24px rgba(15,23,41,0.5), 0 0 0 2px #273249 inset;
}
.phone .screen { border-radius: 22px 22px 32px 32px; overflow: hidden; background: #fff; }
.phone .screen img { display: block; width: 100%; }
.phone .notch {
  position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  width: 64px; height: 7px; background: #2c3852; border-radius: 4px;
}
`;

/** data-follow: distancia en px debajo del bloque de títulos (se ubica al renderizar). */
function laptopHtml(shot, { width, follow }) {
  const s = resolveShot(shot);
  return `<div class="laptop" data-follow="${follow}" style="width:${width}px">
    <div class="lid"><div class="screen"><img src="${s.url}" alt="" /></div></div>
    <div class="base"></div>
  </div>`;
}

function phoneHtml(shot, { width, left, follow, maxScreenH }) {
  const s = resolveShot(shot);
  const inner = width - 24;
  const scale = inner / 780;
  const screenH = Math.min(maxScreenH, Math.floor((1688 - s.cropTop - s.cropBottom) * scale));
  return `<div class="phone" data-follow="${follow}" style="width:${width}px; left:${left}px">
    <div class="notch"></div>
    <div class="screen" style="height:${screenH}px">
      <img src="${s.url}" alt="" style="margin-top:${-Math.round(s.cropTop * scale)}px" />
    </div>
  </div>`;
}

function coverHtml(l) {
  const c = l.cover;
  const long = c.headline.length > 40;
  const body = c.phone
    ? laptopHtml(c.laptop, { width: 1000, follow: 56 }) +
      phoneHtml(c.phone, { width: 300, left: 862, follow: 110, maxScreenH: 600 })
    : laptopHtml(c.laptop, { width: 1080, follow: 56 });
  return `<!DOCTYPE html><html lang="es-AR"><head><meta charset="utf-8" />
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=block" />
<style>${CSS}
${c.phone ? ".laptop { left: 62px; transform: none; }" : ""}
</style></head><body>
  <div class="top">
    <img class="brand" src="${WORDMARK}" alt="WalQo" />
    <h1 class="${long ? "small" : ""}">${c.headline}</h1>
    <p class="sub">${c.sub}</p>
  </div>
  ${body}
</body></html>`;
}

function extraHtml(x) {
  let body;
  if (x.phones) {
    const w = 360;
    const gap = 70;
    const left0 = (1200 - (w * 2 + gap)) / 2;
    body = x.phones
      .map((p, i) => phoneHtml(p, { width: w, left: left0 + i * (w + gap), follow: i ? 90 : 50, maxScreenH: 760 }))
      .join("");
  } else {
    body = laptopHtml(x.laptop, { width: 1060, follow: 100 });
  }
  return `<!DOCTYPE html><html lang="es-AR"><head><meta charset="utf-8" />
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=block" />
<style>${CSS}</style></head><body class="extra">
  <div class="top">
    <h1>${x.headline}</h1>
    <p class="sub">${x.sub}</p>
  </div>
  ${body}
  <img class="footer-brand" src="${WORDMARK}" alt="WalQo" />
</body></html>`;
}

function slugify(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function picturesFor(l) {
  return [
    `${l.slug}/01-portada.jpg`,
    ...l.extras.map((x, i) => `${l.slug}/${String(i + 2).padStart(2, "0")}-${slugify(x.headline)}.jpg`),
  ];
}

async function renderImages() {
  const tmp = path.join(OUT, ".tmp");
  fs.mkdirSync(tmp, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
    for (const l of LISTINGS) {
      if (onlySlug && l.slug !== onlySlug) continue;
      const dir = path.join(OUT, l.slug);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const pics = picturesFor(l);
      const pages = [coverHtml(l), ...l.extras.map(extraHtml)];
      for (const [i, html] of pages.entries()) {
        const htmlPath = path.join(tmp, `${l.slug}-${i}.html`);
        fs.writeFileSync(htmlPath, html, "utf8");
        await page.goto(fileUrl(htmlPath), { waitUntil: "networkidle" });
        await page.evaluate(async () => {
          await document.fonts.ready;
          const end = document.querySelector(".top").getBoundingClientRect().bottom;
          for (const el of document.querySelectorAll("[data-follow]")) {
            el.style.top = `${Math.round(end + Number(el.dataset.follow))}px`;
          }
        });
        await page.screenshot({ path: path.join(OUT, pics[i]), type: "jpeg", quality: 90 });
        console.log("OK", pics[i]);
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------------- textos ---------------- */

function toJson() {
  return {
    generated_for: "API de Mercado Libre (POST /items). category_id: completar con GET /sites/MLA/domain_discovery/search?q=<título>; los atributos sin id se mapean con GET /categories/<id>/attributes.",
    ml_fee_estimate: ML_FEE_ESTIMATE,
    items: LISTINGS.map((l) => ({
      slug: l.slug,
      rubro: l.rubro,
      title: l.title,
      category_hint: l.category_hint,
      category_id: null,
      price: l.price,
      price_if_fee_passed: priceWithFee(l.price),
      currency_id: "ARS",
      available_quantity: 50,
      buying_mode: "buy_it_now",
      condition: "new",
      listing_type_id: "gold_special",
      plan: l.plan,
      period: l.period,
      plan_note: l.plan_note ?? null,
      price_alternatives: l.alternatives,
      shipping: { mode: "not_specified", local_pick_up: false, free_shipping: false, note: "Producto digital: se entrega por la mensajería de Mercado Libre." },
      description: { plain_text: l.description },
      attributes: attributesFor(l),
      pictures: picturesFor(l).map((p) => ({ path: `marketing/mercadolibre/${p}` })),
      faq: l.faq.map(([q, a]) => ({ question: q, answer: a })),
    })),
  };
}

function toMarkdown() {
  const lines = [];
  lines.push("# Publicaciones de WalQo en Mercado Libre");
  lines.push("");
  lines.push("Una publicación por rubro, lista para copiar y pegar. Las imágenes están en la carpeta de cada rubro (01-portada.jpg es la principal). Los textos salen de `scripts/mercadolibre/listings.mjs`; si cambiás algo ahí, corré `node scripts/build-mercadolibre.mjs` y se regeneran este archivo, el JSON y las imágenes.");
  lines.push("");
  lines.push("## Resumen");
  lines.push("");
  lines.push("| Rubro | Título | Plan | Precio a publicar |");
  lines.push("|---|---|---|---|");
  for (const l of LISTINGS) lines.push(`| ${l.rubro} | ${l.title} | ${l.plan} | ${formatPrice(l.price)} · ${l.period} |`);
  lines.push("");
  lines.push("## Cómo conviene publicar");
  lines.push("");
  lines.push("- **Publicar el pago de 3 meses** en vez del mensual. Mercado Libre no cobra suscripciones: cada compra es un pago único. Con el trimestral, una sola venta cubre 90 días, la comisión se paga una vez y no una por mes, y el precio ya tiene el 10% menos que ofrece WalQo. Quien quiere probar primero tiene los 7 días gratis.");
  lines.push("- Si querés, sumá después una segunda publicación por rubro con 1 mes ($35.000 Completo / $60.000 Pro) para el que no quiere poner tanto de entrada, y una anual ($350.000 / $600.000) para el que ya lo usa.");
  lines.push("- **Tipo de publicación: Clásica** (`gold_special`). La Premium cobra más comisión a cambio de cuotas sin interés; para un software que se puede probar gratis, la Clásica alcanza.");
  lines.push(`- **Comisión:** en Computación la Clásica ronda el ${Math.round(ML_FEE_ESTIMATE * 100)}% (más un costo fijo en los productos baratos, como la Permanente de $12.000). Confirmalo en la calculadora de costos de Mercado Libre al publicar. Hay dos caminos: publicar al precio de lista y absorber la comisión, o trasladarla. La columna "Precio trasladando comisión" es el precio para cobrar lo mismo neto.`);
  lines.push("- **Entrega:** producto digital, sin envío. En el formulario elegí que no tiene envío por Mercado Envíos (acordar la entrega) y entregá por la mensajería de la venta.");
  lines.push("- **Reglas de Mercado Libre:** sin teléfonos, mails, links ni redes en la publicación, las imágenes ni las respuestas. Antes de la compra no invites a seguir la charla por WhatsApp. Después de la compra, la mensajería de la venta sirve para mandar el instalador y la clave.");
  lines.push("");
  lines.push("| Plan | Precio de lista | Precio trasladando comisión (~15%) |");
  lines.push("|---|---|---|");
  for (const [label, n] of [
    ["Completo 1 mes", 35_000],
    ["Completo 3 meses", 94_500],
    ["Completo 12 meses", 350_000],
    ["Pro 1 mes", 60_000],
    ["Pro 3 meses", 162_000],
    ["Pro 12 meses", 600_000],
    ["Permanente (pago único)", 12_000],
  ]) lines.push(`| ${label} | ${formatPrice(n)} | ${formatPrice(priceWithFee(n))} |`);
  lines.push("");

  for (const l of LISTINGS) {
    const pics = picturesFor(l);
    lines.push("---");
    lines.push("");
    lines.push(`## ${l.rubro}`);
    lines.push("");
    lines.push(`**Título** (${l.title.length}/60): \`${l.title}\``);
    lines.push("");
    lines.push(`**Categoría sugerida:** ${l.category_hint}`);
    lines.push("");
    lines.push(`**Tipo de entrega:** digital, licencia de software (sin envío físico).`);
    lines.push("");
    lines.push(`**Plan y precio:** ${l.plan}, ${l.period}: **${formatPrice(l.price)}**. Trasladando la comisión: ${formatPrice(priceWithFee(l.price))}.`);
    if (l.alternatives.length) {
      lines.push(`Otras opciones para publicaciones aparte: ${l.alternatives.map((a) => `${a.period} ${formatPrice(a.price)}`).join(" · ")}.`);
    }
    if (l.plan_note) lines.push(`Nota: ${l.plan_note}`);
    lines.push("");
    lines.push("**Descripción** (copiar tal cual):");
    lines.push("");
    lines.push("```text");
    lines.push(l.description);
    lines.push("```");
    lines.push("");
    lines.push("**Ficha técnica sugerida:**");
    lines.push("");
    for (const a of attributesFor(l)) lines.push(`- ${a.name}: ${a.value_name}`);
    lines.push("");
    lines.push("**Preguntas frecuentes** (para responder rápido en Preguntas):");
    lines.push("");
    for (const [q, a] of l.faq) lines.push(`- **${q}** ${a}`);
    lines.push("");
    lines.push("**Imágenes** (en este orden):");
    lines.push("");
    for (const p of pics) lines.push(`- \`${p}\``);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("## Para publicarlas solas por la API de Mercado Libre");
  lines.push("");
  lines.push("1. Crear una aplicación en developers.mercadolibre.com.ar con la cuenta vendedora (Mis aplicaciones > Crear). Ahí salen el **Client ID** (App ID) y el **Client Secret**.");
  lines.push("2. Cargar una **Redirect URI** con https (por ejemplo una página propia de walqo.pro) y pedir los permisos de publicar y de mensajes/preguntas.");
  lines.push("3. Autorizar la cuenta una vez con OAuth: se abre el link de autorización, se acepta y Mercado Libre devuelve un código que se cambia por un access token (dura 6 horas) y un refresh token para renovarlo solo.");
  lines.push("4. Con eso un script puede: buscar la categoría (`/sites/MLA/domain_discovery/search`), leer los atributos obligatorios (`/categories/<id>/attributes`), subir las imágenes (`/pictures/items/upload`), crear cada publicación (`POST /items`) y cargar la descripción (`POST /items/<id>/description`). `publicaciones.json` ya tiene título, precio, descripción, atributos y fotos para eso.");
  lines.push("5. Después también se puede automatizar: cambiar precios cuando cambie la lista, pausar o activar, avisar de cada venta (notificaciones), mandar el mensaje post-venta con el instalador y la clave, y sugerir respuestas a preguntas frecuentes.");
  lines.push("");
  return lines.join("\n");
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "publicaciones.json"), JSON.stringify(toJson(), null, 2) + "\n", "utf8");
fs.writeFileSync(path.join(OUT, "publicaciones.md"), toMarkdown() + "\n", "utf8");
console.log("OK publicaciones.md y publicaciones.json");
for (const l of LISTINGS) console.log(`${String(l.title.length).padStart(2)}  ${l.title}`);
if (!onlyText) await renderImages();
