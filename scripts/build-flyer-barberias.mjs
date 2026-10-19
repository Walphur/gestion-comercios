import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOCS = path.join(ROOT, "docs");
const OUT = path.join(ROOT, "marketing", "barberias", "folleto-barberias.jpg");
const file = (p) => pathToFileURL(path.join(DOCS, p)).href;

const W = 1080;
const H = 1350;

const features = [
  ["Turnos online", "El cliente reserva desde el celular con tu link. Elige corte, día, horario y barbero. Sin bajar ninguna app."],
  ["Agenda por barbero", "Cada servicio con su duración. Los horarios no se pisan."],
  ["Cobrás desde el turno", "Tocás «Cobrar» y el corte pasa a la caja. La cera o el shampoo van en la misma venta."],
  ["Comisiones", "Cuánto le toca a cada barbero, por día, semana o mes."],
];

const html = `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=block" />
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; }
  body {
    position: relative;
    overflow: hidden;
    font-family: Satoshi, "Segoe UI", system-ui, sans-serif;
    color: #f4f6fb;
    background:
      radial-gradient(620px 420px at 12% 4%, rgba(47,107,255,0.38), transparent 70%),
      radial-gradient(560px 420px at 96% 30%, rgba(138,77,255,0.26), transparent 70%),
      #05060a;
    padding: 64px 68px 0;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { width: 52px; height: 52px; }
  .brand span { font-size: 42px; font-weight: 900; letter-spacing: -0.02em; }
  .brand b { color: #4b86ff; font-weight: 900; }
  .tag { margin-left: auto; padding: 8px 18px; border-radius: 999px; font-size: 20px; font-weight: 700;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); color: #dfe5f2; }
  h1 { margin-top: 40px; font-size: 76px; line-height: 1.0; font-weight: 900; letter-spacing: -0.03em; }
  h1 em { font-style: normal; color: #7eb0ff; }
  .lede { margin-top: 18px; font-size: 28px; color: #b4bccc; font-weight: 500; line-height: 1.3; }
  .grid { margin-top: 38px; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 16px; }
  .card { padding: 22px 24px; border-radius: 20px; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.12); }
  .card h2 { font-size: 27px; font-weight: 900; letter-spacing: -0.01em; display: flex; align-items: center; gap: 10px; }
  .card h2 i { width: 12px; height: 12px; border-radius: 4px; background: #2f6bff; display: inline-block; }
  .card p { margin-top: 8px; font-size: 20px; line-height: 1.35; color: #c3cad8; font-weight: 500; }
  .shot { position: absolute; left: 68px; right: 68px; top: 830px; height: 560px; border-radius: 18px 18px 0 0; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.14); border-bottom: 0; box-shadow: 0 -10px 60px rgba(47,107,255,0.25); }
  .shot img { display: block; width: 100%; margin-top: -138px; }
  .fade { position: absolute; inset: auto 0 0 0; height: 250px;
    background: linear-gradient(rgba(5,6,10,0), rgba(5,6,10,0.94) 55%, #05060a); }
  .cta { position: absolute; left: 68px; right: 68px; bottom: 54px; display: flex; align-items: flex-end; gap: 24px; }
  .cta .main { flex: 1; min-width: 0; }
  .trial { display: inline-block; padding: 12px 26px; border-radius: 999px; background: #2f6bff; color: #fff;
    font-size: 30px; font-weight: 900; letter-spacing: -0.01em; }
  .price { margin-top: 14px; font-size: 21px; color: #b4bccc; font-weight: 500; line-height: 1.4; }
  .contact { text-align: right; }
  .contact .wa { font-size: 34px; font-weight: 900; color: #fff; letter-spacing: -0.01em; }
  .contact .wa small { display: block; font-size: 19px; font-weight: 700; color: #34d399; letter-spacing: 0; }
  .contact .web { margin-top: 6px; font-size: 21px; color: #9fb3d9; font-weight: 700; }
</style>
</head>
<body>
  <div class="brand">
    <img src="${file("branding/walqo-mark.png")}" alt="" /><span>Wal<b>Q</b>o</span>
    <span class="tag">Peluquerías y barberías</span>
  </div>
  <h1>Turnos, caja y <em>comisiones</em> de tu barbería</h1>
  <p class="lede">Todo en la PC del local. Sin cuaderno y sin contestar mensajes para dar turnos.</p>
  <div class="grid">
    ${features.map(([t, p]) => `<div class="card"><h2><i></i>${t}</h2><p>${p}</p></div>`).join("")}
  </div>
  <div class="shot"><img src="${file("marketing/shots/agenda.png")}" alt="" /></div>
  <div class="fade"></div>
  <div class="cta">
    <div class="main">
      <span class="trial">Probalo 7 días gratis</span>
      <p class="price">Hasta 2 barberos: $35.000 por mes. Más de 2: $60.000.<br />Pagando el año, 12 meses por 10.<br />Necesitás una PC con Windows 10 u 11.</p>
    </div>
    <div class="contact">
      <div class="wa"><small>WhatsApp</small>266 458-0915</div>
      <div class="web">walqo.pro</div>
    </div>
  </div>
</body>
</html>`;

const dir = await mkdtemp(path.join(tmpdir(), "walqo-flyer-"));
const pagePath = path.join(dir, "flyer.html");
await writeFile(pagePath, html, "utf8");

const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(pagePath).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, type: "jpeg", quality: 88 });
  console.log(`OK ${path.relative(ROOT, OUT)}`);
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
