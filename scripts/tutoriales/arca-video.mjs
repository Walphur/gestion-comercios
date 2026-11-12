/**
 * Video tutorial «Conectar ARCA» (docs/marketing/videos/arca.mp4 + portada).
 *
 * Usa las capturas reales de tests/results/arca-video (scripts/tutoriales/arca-capturas.mjs).
 * Las pantallas de ARCA van dibujadas y simplificadas: no se graba la Clave Fiscal de nadie.
 * ffmpeg: FFMPEG_PATH o `npm i ffmpeg-static --prefix tests/results/ffmpeg`.
 *
 * Uso: node scripts/tutoriales/arca-video.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SHOTS = path.join(ROOT, "tests", "results", "arca-video");
const FRAMES = path.join(SHOTS, "frames");
const OUT_VIDEO = path.join(ROOT, "docs", "marketing", "videos", "arca.mp4");
const OUT_POSTER_SITE = path.join(ROOT, "docs", "marketing", "videos", "posters", "arca.jpg");
const OUT_POSTER_APP = path.join(ROOT, "public", "videos", "posters", "arca.jpg");
const FFMPEG = process.env.FFMPEG_PATH
  || [path.join(ROOT, "tests/results/ffmpeg/node_modules/ffmpeg-static/ffmpeg.exe"), "ffmpeg"].find((p) => p === "ffmpeg" || fs.existsSync(p));
const FPS = 30;
const W = 1920;
const H = 1080;

const shot = (name) => pathToFileURL(path.join(SHOTS, `${name}.png`)).href;
const logo = pathToFileURL(path.join(ROOT, "public", "branding", "walqo-icon-192.png")).href;

/* Cada escena: duración en segundos y HTML. data-in = segundo en que aparece el elemento.
 * Cursor: puntos [segundo, x%, y%, click?] relativos al escenario. */
const scenes = [
  {
    dur: 5,
    html: `
      <div class="center">
        <img class="logo" src="${logo}" data-in="0" />
        <h1 data-in="0.3">Cómo conectar <em>ARCA</em> con WalQo</h1>
        <p class="lede" data-in="0.8">Factura electrónica en 5 pasos</p>
        <div class="chips" data-in="1.4"><span>Tu CUIT</span><span>Clave Fiscal nivel 3</span><span>15 a 20 minutos</span></div>
      </div>`,
  },
  {
    dur: 6,
    html: `
      <div class="center">
        <h2 data-in="0">Antes de empezar</h2>
        <ul class="needs">
          <li data-in="0.5"><b>1</b>Clave Fiscal de ARCA con nivel 3</li>
          <li data-in="1.1"><b>2</b>Estar en el Monotributo o ser Responsable Inscripto</li>
          <li data-in="1.7"><b>3</b>WalQo Completo o Pro, en la PC del local</li>
        </ul>
      </div>`,
  },
  {
    dur: 7,
    html: stepScene(1, "En WalQo", "Entrá a <b>Configuración → Facturación</b> y cargá tu <b>CUIT</b>, sin guiones.", [["02-cuit", 0]], { zoom: [1, 1.18, 50, 55] }),
  },
  {
    dur: 8,
    html: stepScene(1, "En WalQo", "Tocá <b>«Generar pedido de certificado»</b>. WalQo guarda un archivo <b>.csr</b> en tu carpeta Descargas.", [["03-boton-generar", 0], ["04-pedido-guardado", 4]], { zoom: [1, 1.12, 50, 50] }),
  },
  {
    dur: 11,
    html: arcaScene(2, "Subí el pedido a ARCA",
      "En <b>arca.gob.ar</b> entrá con tu Clave Fiscal y abrí <b>«Administración de Certificados Digitales»</b>. Tocá <b>«Agregar alias»</b>, escribí <b>walqo</b> y subí el archivo de Descargas. Después tocá <b>«Ver»</b> y descargá el certificado.",
      "Administración de Certificados Digitales",
      `
        <div class="form" data-in="0.6">
          <label>Alias</label><div class="input typed" data-type="walqo" data-in="1.4"></div>
          <label>Archivo</label><div class="input file" data-in="2.6">pedido-certificado-arca-20304050607.csr</div>
          <div class="btn" data-in="3.4" id="b-agregar">Agregar alias</div>
        </div>
        <table class="tbl" data-in="5.2">
          <tr><th>Alias</th><th>Estado</th><th></th></tr>
          <tr><td>walqo</td><td><span class="ok">Válido</span></td><td><span class="btn sm" id="b-ver">Ver</span></td></tr>
        </table>
        <div class="file-chip" data-in="7.8">⬇ Descargado: <b>walqo.crt</b></div>
        <p class="hint" data-in="8.6">¿No ves el servicio? Sumalo en «Administrador de Relaciones» → «Adherir servicio».</p>`,
      [[0, 80, 90], [3.6, 38, 63, true], [6.4, 61, 79, true], [7.2, 62, 80], [11, 70, 92]]),
  },
  {
    dur: 10,
    html: arcaScene(3, "Dale permiso para facturar",
      "Abrí <b>«Administrador de Relaciones de Clave Fiscal»</b> → <b>«Nueva relación»</b>. Elegí <b>ARCA → Web Services → Facturación Electrónica</b>, y como representante el computador fiscal <b>walqo</b>. Confirmá.",
      "Administrador de Relaciones de Clave Fiscal",
      `
        <div class="form" data-in="0.6">
          <label>Servicio</label><div class="input" data-in="1.2">ARCA › Web Services › <b>Facturación Electrónica</b></div>
          <label>Representante</label><div class="input" data-in="3.0">Computador fiscal: <b>walqo</b></div>
          <div class="btn" data-in="4.6" id="b-confirmar">Confirmar</div>
        </div>
        <div class="file-chip ok-chip" data-in="6.2">✓ Relación creada</div>`,
      [[0, 85, 88], [1.4, 60, 38, true], [3.2, 60, 52, true], [4.9, 38, 66, true], [10, 70, 92]]),
  },
  {
    dur: 10,
    html: arcaScene(4, "Creá el punto de venta",
      "En <b>«Administración de puntos de venta y domicilios»</b> agregá uno nuevo de tipo <b>«Factura Electrónica - Monotributo - Web Services»</b> (Responsable Inscripto: <b>«RECE para aplicativo y Web Services»</b>). Anotá el número.",
      "Administración de puntos de venta y domicilios",
      `
        <div class="form" data-in="0.6">
          <label>Número</label><div class="input typed" data-type="2" data-in="1.2"></div>
          <label>Sistema</label><div class="input" data-in="2.4">Factura Electrónica - Monotributo - <b>Web Services</b></div>
          <label>Domicilio</label><div class="input" data-in="3.4">El del local</div>
          <div class="btn" data-in="4.6" id="b-aceptar">Aceptar</div>
        </div>
        <div class="file-chip ok-chip" data-in="6.0">✓ Punto de venta <b>0002</b> habilitado</div>`,
      [[0, 85, 88], [1.4, 60, 37, true], [2.6, 60, 49, true], [4.9, 38, 72, true], [10, 70, 92]]),
  },
  {
    dur: 9,
    html: stepScene(5, "En WalQo", "Poné ese <b>punto de venta</b>, elegí <b>Producción</b> y subí el certificado con <b>«Elegir»</b>. La clave ya la tiene WalQo.", [["05-punto-de-venta", 0], ["06-subir-certificado", 4.5]], { zoom: [1, 1.1, 50, 50] }),
  },
  {
    dur: 9,
    html: stepScene(5, "En WalQo", "Tocá <b>«Guardar configuración»</b>. Después, más arriba, tocá <b>«Probar conexión»</b>. Si dice <b>Conectado</b>, ya está.", [["07-guardar-y-probar", 0], ["08-probar-conexion", 4.5]], { zoom: [1, 1.1, 50, 55] }),
  },
  {
    dur: 6,
    html: `
      <div class="center">
        <img class="logo" src="${logo}" data-in="0" />
        <h1 data-in="0.3">¡Listo! <em>Ya facturás</em> desde WalQo</h1>
        <p class="lede" data-in="0.9">Prendé «Facturación automática» y cada venta sale con su factura.</p>
        <div class="chips" data-in="1.6"><span>¿Te trabás? WhatsApp 266 458-0915</span><span>walqo.pro/guias</span></div>
      </div>`,
  },
];

function stepScene(n, where, text, images, { zoom }) {
  const imgs = images
    .map(([name, at], i) => `<img class="shot" src="${shot(name)}" data-in="${at}" ${i < images.length - 1 ? `data-out="${images[i + 1][1]}"` : ""} />`)
    .join("");
  return `
    <div class="split">
      <div class="side">
        <span class="step" data-in="0">Paso ${n}</span>
        <span class="where walqo" data-in="0.1">${where}</span>
        <p class="text" data-in="0.4">${text}</p>
      </div>
      <div class="frame" data-zoom="${zoom.join(",")}">${imgs}</div>
    </div>`;
}

function arcaScene(n, title, text, page, body, cursor) {
  return `
    <div class="split">
      <div class="side">
        <span class="step" data-in="0">Paso ${n}</span>
        <span class="where arca" data-in="0.1">En ARCA</span>
        <h3 data-in="0.2">${title}</h3>
        <p class="text" data-in="0.5">${text}</p>
      </div>
      <div class="frame arca-frame" data-in="0">
        <div class="arca-top"><span class="arca-logo">ARCA</span><span>Servicios con Clave Fiscal</span></div>
        <div class="arca-body">
          <h4>${page}</h4>
          ${body}
        </div>
        <span class="mock">Pantalla de ARCA simplificada</span>
        <div class="cursor" data-path='${JSON.stringify(cursor)}'></div>
      </div>
    </div>`;
}

const html = `<!DOCTYPE html>
<html lang="es-AR"><head><meta charset="utf-8" />
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=block" />
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { font-family: Satoshi, "Segoe UI", system-ui, sans-serif; color: #f4f6fb; background:
    radial-gradient(900px 600px at 8% 0%, rgba(47,107,255,0.35), transparent 70%),
    radial-gradient(800px 600px at 100% 100%, rgba(138,77,255,0.25), transparent 70%), #05060a; }
  .scene { position: absolute; inset: 0; opacity: 0; padding: 80px 96px; }
  .center { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 26px; }
  .logo { width: 132px; height: 132px; border-radius: 30px; }
  h1 { font-size: 92px; font-weight: 900; letter-spacing: -0.03em; line-height: 1.02; max-width: 1500px; }
  h1 em, h3 em { font-style: normal; color: #7eb0ff; }
  h2 { font-size: 76px; font-weight: 900; letter-spacing: -0.03em; }
  .lede { font-size: 40px; color: #b4bccc; font-weight: 500; }
  .chips { display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
  .chips span { padding: 14px 26px; border-radius: 999px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); font-size: 30px; font-weight: 700; }
  .needs { list-style: none; padding: 0; display: grid; gap: 22px; margin-top: 20px; text-align: left; }
  .needs li { display: flex; align-items: center; gap: 26px; font-size: 42px; font-weight: 700; padding: 24px 34px; border-radius: 24px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); }
  .needs b { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; background: linear-gradient(135deg,#2f6bff,#8a4dff); flex: none; }
  .split { height: 100%; display: grid; grid-template-columns: minmax(0, 560px) minmax(0, 1fr); gap: 64px; align-items: center; }
  .side { display: flex; flex-direction: column; align-items: flex-start; gap: 18px; }
  .step { font-size: 30px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: #7eb0ff; }
  .where { padding: 10px 22px; border-radius: 999px; font-size: 28px; font-weight: 900; }
  .where.walqo { background: #2f6bff; }
  .where.arca { background: #f4f6fb; color: #0b3d75; }
  h3 { font-size: 54px; font-weight: 900; letter-spacing: -0.02em; line-height: 1.05; }
  .text { font-size: 36px; line-height: 1.38; color: #dfe5f2; font-weight: 500; }
  .text b { color: #fff; font-weight: 900; }
  .frame { position: relative; height: 760px; border-radius: 26px; overflow: hidden; border: 1px solid rgba(255,255,255,0.16);
    box-shadow: 0 40px 100px rgba(0,0,0,0.55), 0 0 80px rgba(47,107,255,0.2); background: #fff; }
  .frame .shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; }
  .arca-frame { background: #eef1f5; color: #1d2733; }
  .arca-top { height: 76px; background: #0b3d75; color: #fff; display: flex; align-items: center; gap: 22px; padding: 0 34px; font-size: 24px; font-weight: 700; }
  .arca-logo { font-size: 34px; font-weight: 900; letter-spacing: 0.06em; }
  .arca-body { padding: 36px 48px; }
  .arca-body h4 { font-size: 34px; font-weight: 900; color: #0b3d75; margin-bottom: 26px; }
  .form { display: grid; grid-template-columns: 200px minmax(0,1fr); gap: 16px 22px; align-items: center; background: #fff; padding: 28px; border-radius: 16px; border: 1px solid #d6dde6; }
  .form label { font-size: 24px; font-weight: 700; color: #4a5568; }
  .input { min-height: 56px; display: flex; align-items: center; padding: 0 18px; border: 2px solid #c3ccd8; border-radius: 10px; font-size: 25px; background: #fff; }
  .input.file { color: #0b3d75; font-weight: 700; }
  .btn { grid-column: 2; justify-self: start; padding: 14px 30px; border-radius: 10px; background: #0b62c4; color: #fff; font-size: 25px; font-weight: 900; }
  .btn.sm { padding: 8px 20px; font-size: 22px; display: inline-block; }
  .tbl { margin-top: 26px; width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; font-size: 25px; }
  .tbl th, .tbl td { padding: 16px 22px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  .tbl th { background: #f1f5f9; color: #4a5568; font-size: 21px; }
  .ok { color: #15803d; font-weight: 900; }
  .file-chip { margin-top: 24px; display: inline-block; padding: 14px 24px; border-radius: 12px; background: #0b3d75; color: #fff; font-size: 26px; font-weight: 700; }
  .ok-chip { background: #15803d; }
  .hint { margin-top: 18px; font-size: 22px; color: #4a5568; font-weight: 600; }
  .mock { position: absolute; right: 24px; top: 24px; font-size: 18px; color: #fff; font-weight: 700; background: rgba(255,255,255,0.16); padding: 4px 12px; border-radius: 8px; }
  .cursor { position: absolute; width: 34px; height: 34px; margin: -4px 0 0 -4px; pointer-events: none; z-index: 5;
    background: no-repeat center/contain url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M3 2l7 19 2.6-7.4L20 11z' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/></svg>"); }
  .ripple { position: absolute; width: 70px; height: 70px; margin: -35px 0 0 -35px; border-radius: 50%; border: 4px solid rgba(37,99,235,.9); background: rgba(37,99,235,.25); z-index: 4; }
  .progress { position: absolute; left: 0; bottom: 0; height: 8px; background: linear-gradient(90deg,#2f6bff,#8a4dff); }
</style></head>
<body>
${scenes.map((s, i) => `<section class="scene" id="s${i}">${s.html}</section>`).join("\n")}
<div class="progress" id="progress"></div>
<script>
  const scenes = ${JSON.stringify(scenes.map((s) => s.dur))};
  const starts = []; let acc = 0; for (const d of scenes) { starts.push(acc); acc += d; }
  window.TOTAL = acc;
  const ease = (p) => p < 0 ? 0 : p > 1 ? 1 : 1 - Math.pow(1 - p, 3);
  window.renderAt = (t) => {
    scenes.forEach((dur, i) => {
      const el = document.getElementById("s" + i);
      const local = t - starts[i];
      const vis = local >= 0 && local < dur;
      el.style.display = vis ? "block" : "none";
      if (!vis) return;
      el.style.opacity = Math.min(ease(local / 0.45), ease((dur - local) / 0.35));
      for (const n of el.querySelectorAll("[data-in]")) {
        const p = ease((local - Number(n.dataset.in)) / 0.55);
        const out = n.dataset.out ? 1 - ease((local - Number(n.dataset.out)) / 0.5) : 1;
        n.style.opacity = Math.min(p, out);
        if (!n.classList.contains("shot") && !n.classList.contains("frame")) n.style.transform = "translateY(" + (1 - p) * 26 + "px)";
        if (n.dataset.type) {
          const chars = Math.floor(Math.max(0, local - Number(n.dataset.in) - 0.2) * 9);
          n.textContent = n.dataset.type.slice(0, chars);
        }
      }
      for (const f of el.querySelectorAll("[data-zoom]")) {
        const [a, b, ox, oy] = f.dataset.zoom.split(",").map(Number);
        const s = a + (b - a) * ease(local / dur);
        for (const img of f.querySelectorAll(".shot")) { img.style.transformOrigin = ox + "% " + oy + "%"; img.style.transform = "scale(" + s + ")"; }
      }
      for (const c of el.querySelectorAll(".cursor")) {
        const pts = JSON.parse(c.dataset.path);
        let k = 0; while (k < pts.length - 2 && local > pts[k + 1][0]) k++;
        const [t0, x0, y0] = pts[k]; const [t1, x1, y1] = pts[k + 1];
        const p = ease((local - t0) / Math.max(0.01, (t1 - t0) * 0.7));
        c.style.left = (x0 + (x1 - x0) * p) + "%"; c.style.top = (y0 + (y1 - y0) * p) + "%";
        c.parentElement.querySelectorAll(".ripple").forEach((r) => r.remove());
        for (const [ct, cx, cy, click] of pts) {
          const d = local - (ct + 0.15);
          if (click && d >= 0 && d < 0.6) {
            const r = document.createElement("div"); r.className = "ripple";
            r.style.left = cx + "%"; r.style.top = cy + "%"; r.style.transform = "scale(" + (0.6 + d * 1.6) + ")"; r.style.opacity = String(1 - d / 0.6);
            c.parentElement.appendChild(r);
          }
        }
      }
    });
    document.getElementById("progress").style.width = (t / acc * 100) + "%";
  };
</script>
</body></html>`;

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const htmlPath = path.join(SHOTS, "video.html");
fs.writeFileSync(htmlPath, html, "utf8");

const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const total = await page.evaluate(() => window.TOTAL);
  const frames = Math.round(total * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.renderAt(t), i / FPS);
    await page.screenshot({ path: path.join(FRAMES, `${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
    if (i % 300 === 0) console.log(`cuadro ${i}/${frames}`);
  }
  await page.evaluate(() => window.renderAt(2.5));
  await page.screenshot({ path: OUT_POSTER_SITE, type: "jpeg", quality: 86 });
} finally {
  await browser.close();
}
fs.copyFileSync(OUT_POSTER_SITE, OUT_POSTER_APP);

const r = spawnSync(FFMPEG, [
  "-hide_banner", "-loglevel", "error", "-y",
  "-framerate", String(FPS), "-i", path.join(FRAMES, "%05d.jpg"),
  "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  OUT_VIDEO,
], { stdio: "inherit" });
if (r.status !== 0) throw new Error("ffmpeg falló");
console.log(`OK ${path.relative(ROOT, OUT_VIDEO)} (${(fs.statSync(OUT_VIDEO).size / 1e6).toFixed(1)} MB)`);
