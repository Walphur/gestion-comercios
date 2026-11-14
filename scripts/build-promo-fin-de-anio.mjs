/**
 * Piezas de la Promo Fin de Año (marketing/promo/*.jpg): posteo, historia, «Recomendá y ganá» y plan anual.
 * Precios de src/config/pricing.ts; fechas de src/config/trialPromo.ts.
 *
 * Uso: node scripts/build-promo-fin-de-anio.mjs
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOCS = path.join(ROOT, "docs");
const OUT_DIR = path.join(ROOT, "marketing", "promo");
const file = (p) => pathToFileURL(path.join(DOCS, p)).href;
const WHATSAPP = "266 458-0915";

const css = (w, h) => `
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${w}px; height: ${h}px; }
  body { position: relative; overflow: hidden; padding: 64px 68px 0;
    font-family: Satoshi, "Segoe UI", system-ui, sans-serif; color: #f4f6fb;
    background:
      radial-gradient(620px 420px at 12% 4%, rgba(47,107,255,0.38), transparent 70%),
      radial-gradient(560px 420px at 96% 30%, rgba(138,77,255,0.26), transparent 70%),
      #05060a; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { width: 52px; height: 52px; border-radius: 12px; }
  .brand span { font-size: 42px; font-weight: 900; letter-spacing: -0.02em; }
  .brand b { color: #4b86ff; font-weight: 900; }
  .tag { margin-left: auto; padding: 8px 18px; border-radius: 999px; font-size: 22px; font-weight: 900;
    background: linear-gradient(135deg,#2f6bff,#8a4dff); color: #fff; }
  h1 { margin-top: 44px; font-size: 84px; line-height: 0.98; font-weight: 900; letter-spacing: -0.035em; }
  h1 em { font-style: normal; color: #7eb0ff; }
  .lede { margin-top: 20px; font-size: 30px; color: #b4bccc; font-weight: 500; line-height: 1.3; }
  .deal { margin-top: 34px; display: grid; gap: 16px; }
  .deal div { display: flex; align-items: center; gap: 22px; padding: 22px 26px; border-radius: 22px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); }
  .deal b { flex: none; width: 88px; height: 88px; border-radius: 22px; display: grid; place-items: center;
    font-size: 34px; font-weight: 900; background: linear-gradient(135deg,#2f6bff,#8a4dff); }
  .deal p { font-size: 30px; font-weight: 700; line-height: 1.2; }
  .deal small { display: block; margin-top: 4px; font-size: 21px; color: #b4bccc; font-weight: 500; }
  .old { text-decoration: line-through; color: #8a93a6; font-weight: 500; }
  .shot { position: absolute; left: 68px; right: 68px; border-radius: 18px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 20px 60px rgba(47,107,255,0.25); }
  .shot img { display: block; width: 100%; }
  .shot::after { content: ""; position: absolute; inset: auto 0 0 0; height: 90px;
    background: linear-gradient(rgba(5,6,10,0), rgba(5,6,10,0.85)); }
  .cta { position: absolute; left: 68px; right: 68px; bottom: 54px; display: flex; align-items: flex-end; gap: 24px; }
  .cta .main { flex: 1; min-width: 0; }
  .until { display: inline-block; padding: 12px 26px; border-radius: 999px; background: #2f6bff; color: #fff;
    font-size: 30px; font-weight: 900; }
  .fine { margin-top: 14px; font-size: 20px; color: #b4bccc; font-weight: 500; line-height: 1.4; }
  .contact { text-align: right; flex: none; }
  .contact .wa { font-size: 34px; font-weight: 900; color: #fff; }
  .contact .wa small { display: block; font-size: 19px; font-weight: 700; color: #34d399; }
  .contact .web { margin-top: 6px; font-size: 21px; color: #9fb3d9; font-weight: 700; }
`;

const page = (w, h, body, extra = "") => `<!DOCTYPE html>
<html lang="es-AR"><head><meta charset="utf-8" />
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=block" />
<style>${css(w, h)}${extra}</style></head><body>${body}</body></html>`;

const brand = (tag) => `
  <div class="brand"><img src="${file("branding/walqo-mark.png")}" alt="" /><span>Wal<b>Q</b>o</span>
  <span class="tag">${tag}</span></div>`;

const contact = `
  <div class="contact"><div class="wa"><small>WhatsApp</small>${WHATSAPP}</div><div class="web">walqo.pro</div></div>`;

const DEAL = `
  <div class="deal">
    <div><b>30</b><p>30 días gratis con todo<small>Cargá tus productos y vendé de verdad, sin pagar nada.</small></p></div>
    <div><b>½</b><p>El primer mes a mitad de precio<small>WalQo Completo <span class="old">$35.000</span> <strong style="color:#fff">$17.500</strong> · Pro <span class="old">$60.000</span> <strong style="color:#fff">$30.000</strong></small></p></div>
  </div>`;

const images = [
  {
    name: "promo-fin-de-anio",
    w: 1080,
    h: 1350,
    html: page(1080, 1350, `
      ${brand("Promo Fin de Año")}
      <h1>Cerrá el año con tu negocio <em>ordenado</em></h1>
      <p class="lede">Caja, stock, fiado, factura electrónica y Mercado Pago en un solo sistema.</p>
      ${DEAL}
      <div class="shot" style="top:845px;height:250px"><img src="${file("assets/shots/kiosco/app-cobrar.jpg")}" alt="" /></div>
      <div class="cta">
        <div class="main"><span class="until">Hasta el 31/12</span>
          <p class="fine">Para comercios que empiezan la prueba hasta el 31 de diciembre.</p></div>
        ${contact}
      </div>`),
  },
  {
    name: "promo-fin-de-anio-historia",
    w: 1080,
    h: 1920,
    html: page(1080, 1920, `
      ${brand("Promo Fin de Año")}
      <h1 style="margin-top:90px;font-size:104px">Probá WalQo <em>30 días gratis</em></h1>
      <p class="lede" style="font-size:36px">Y si te quedás, el primer mes te sale la mitad.</p>
      ${DEAL}
      <div class="shot" style="top:900px;height:700px"><img src="${file("assets/shots/kiosco/app-inicio.jpg")}" alt="" /></div>
      <div class="cta" style="bottom:90px">
        <div class="main"><span class="until">Hasta el 31/12</span>
          <p class="fine">Kioscos, almacenes, verdulerías, ropa, ferreterías y más.</p></div>
        ${contact}
      </div>`, ".deal p{font-size:34px}.deal small{font-size:24px}"),
  },
  {
    name: "recomenda-y-gana",
    w: 1080,
    h: 1350,
    html: page(1080, 1350, `
      ${brand("Para clientes de WalQo")}
      <h1>Recomendá WalQo y ganá <em>1 mes gratis</em></h1>
      <p class="lede">Por cada comercio que se suscribe con tu código, tu próximo mes no lo pagás. Sin tope.</p>
      <div class="deal">
        <div><b>1</b><p>Buscá tu código<small>En WalQo: Ayuda → «Recomendá y ganá 1 mes».</small></p></div>
        <div><b>2</b><p>Compartilo por WhatsApp<small>Con un toque se arma el mensaje con tu código.</small></p></div>
        <div><b>3</b><p>Ganás tu mes<small>Cuando el otro comercio paga su primer mes, te lo sumamos.</small></p></div>
      </div>
      <div class="cta">
        <div class="main"><span class="until">3 recomendados = 3 meses gratis</span></div>
        ${contact}
      </div>`),
  },
  {
    name: "plan-anual",
    w: 1080,
    h: 1350,
    html: page(1080, 1350, `
      ${brand("Plan anual")}
      <h1>Pagás 10 meses y usás <em>12</em></h1>
      <p class="lede">Pagando el año de una vez tenés 2 meses gratis y te olvidás de los aumentos hasta el año que viene.</p>
      <div class="deal">
        <div><b>⭐</b><p>WalQo Completo: $350.000 por año<small>En vez de <span class="old">$420.000</span>. Sale $29.167 por mes.</small></p></div>
        <div><b>🚀</b><p>WalQo Pro: $600.000 por año<small>En vez de <span class="old">$720.000</span>. Sale $50.000 por mes.</small></p></div>
        <div><b>3</b><p>Pagando 3 meses: 10% menos<small>Completo $94.500 · Pro $162.000.</small></p></div>
      </div>
      <div class="shot" style="top:1010px;height:150px"><img src="${file("assets/shots/kiosco/app-caja.jpg")}" alt="" /></div>
      <div class="cta">
        <div class="main"><p class="fine" style="margin:0">Precio de hoy congelado por todo el año.</p></div>
        ${contact}
      </div>`),
  },
];

await mkdir(OUT_DIR, { recursive: true });
const dir = await mkdtemp(path.join(tmpdir(), "walqo-promo-"));
const browser = await chromium.launch({ channel: "msedge" });
try {
  for (const img of images) {
    const tab = await browser.newPage({ viewport: { width: img.w, height: img.h }, deviceScaleFactor: 1.5 });
    const htmlPath = path.join(dir, `${img.name}.html`);
    await writeFile(htmlPath, img.html, "utf8");
    await tab.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await tab.evaluate(() => document.fonts.ready);
    const out = path.join(OUT_DIR, `${img.name}.jpg`);
    await tab.screenshot({ path: out, type: "jpeg", quality: 88 });
    await tab.close();
    console.log(`OK ${path.relative(ROOT, out)}`);
  }
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
