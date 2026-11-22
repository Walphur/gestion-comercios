/**
 * Videos de venta WalQo — rubro restaurante / gastronomía.
 *
 * 1) Compila clips cortos con capturas reales (docs/assets/shots + ML) + subtítulos.
 * 2) Graba la carta demo en walqo.pro/demo-restaurante (Playwright).
 *
 * Uso: node scripts/marketing/restaurante-videos.mjs
 * Salida: docs/marketing/videos/restaurante/*.mp4
 * ffmpeg: PATH o tests/results/ffmpeg/node_modules/ffmpeg-static/ffmpeg.exe
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = path.join(ROOT, "docs", "marketing", "videos", "restaurante");
const TMP = path.join(ROOT, "tests", "results", "restaurante-video");
const SHOTS = path.join(ROOT, "docs", "assets", "shots", "gastronomia");
const ML = path.join(ROOT, "marketing", "mercadolibre", "capturas", "gastronomia");
const FFMPEG = process.env.FFMPEG_PATH
  || [path.join(ROOT, "tests/results/ffmpeg/node_modules/ffmpeg-static/ffmpeg.exe"), "ffmpeg"]
    .find((p) => p === "ffmpeg" || fs.existsSync(p));

const W = 1280;
const H = 720;
const FPS = 30;
const FONT = process.env.WALQO_VIDEO_FONT
  || (process.platform === "win32" && fs.existsSync("C:/Windows/Fonts/segoeui.ttf")
    ? "C\\:/Windows/Fonts/segoeui.ttf"
    : null);

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

function ff(args, label = "ffmpeg") {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error(`${label} falló`);
}

function escDraw(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

/** Ken Burns + caption bar from a sequence of stills. */
function buildSlideshow(outName, scenes) {
  const listPath = path.join(TMP, `${outName}.txt`);
  const parts = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!fs.existsSync(s.file)) throw new Error("falta captura: " + s.file);
    const frame = path.join(TMP, `${outName}-f${i}.mp4`);
    const zoom = s.zoom ?? "min(zoom+0.0008,1.08)";
    const caption = escDraw(s.caption);
    const sub = s.sub ? escDraw(s.sub) : "";
    const vf = [
      `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:#0f172a`,
      `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(s.dur * FPS)}:s=${W}x${H}:fps=${FPS}`,
      `drawbox=x=0:y=ih-110:w=iw:h=110:color=black@0.72:t=fill`,
      FONT
        ? `drawtext=fontfile=${FONT}:text='${caption}':fontsize=36:fontcolor=white:x=36:y=h-88`
        : `drawtext=font='Segoe UI':text='${caption}':fontsize=36:fontcolor=white:x=36:y=h-88`,
    ];
    if (sub) {
      vf.push(FONT
        ? `drawtext=fontfile=${FONT}:text='${sub}':fontsize=24:fontcolor=#cbd5e1:x=36:y=h-46`
        : `drawtext=font='Segoe UI':text='${sub}':fontsize=24:fontcolor=#cbd5e1:x=36:y=h-46`);
    }
    ff([
      "-loop", "1", "-i", s.file,
      "-vf", vf.join(","),
      "-t", String(s.dur),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS),
      frame,
    ], outName + "-scene" + i);
    parts.push(frame);
  }
  const concat = parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
  fs.writeFileSync(listPath, concat);
  const out = path.join(OUT, `${outName}.mp4`);
  ff([
    "-f", "concat", "-safe", "0", "-i", listPath,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    out,
  ], outName);
  console.log("OK", path.relative(ROOT, out));
  return out;
}

function shot(...parts) {
  for (const base of [SHOTS, ML]) {
    const p = path.join(base, ...parts);
    if (fs.existsSync(p)) return p;
  }
  return path.join(SHOTS, ...parts);
}

async function recordCartaDemo() {
  const raw = path.join(TMP, "carta-raw.webm");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 420, height: 860 },
    deviceScaleFactor: 2,
    recordVideo: { dir: TMP, size: { width: 420, height: 860 } },
  });
  const page = await context.newPage();
  await page.goto("https://walqo.pro/demo-restaurante/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("text=Bodegón", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1800);

  // Pedir desde la mesa
  const add = page.getByRole("button", { name: "Agregar" }).first();
  if (await add.isVisible().catch(() => false)) {
    await add.click();
    await page.waitForTimeout(900);
    const confirm = page.getByRole("button", { name: /Agregar|Confirmar|Listo|Al horno|Frita/i }).last();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click().catch(() => {});
      await page.waitForTimeout(700);
    }
  }
  const add2 = page.getByRole("button", { name: "Agregar" }).nth(4);
  if (await add2.isVisible().catch(() => false)) {
    await add2.click();
    await page.waitForTimeout(800);
    const confirm2 = page.getByRole("button", { name: /Agregar|Confirmar|Listo/i }).last();
    if (await confirm2.isVisible().catch(() => false)) await confirm2.click().catch(() => {});
    await page.waitForTimeout(700);
  }

  const miMesa = page.getByRole("button", { name: "Mi mesa" });
  if (await miMesa.isVisible().catch(() => false)) {
    await miMesa.click();
    await page.waitForTimeout(2200);
  }
  const pedir = page.getByRole("button", { name: /Enviar|Pedir|Confirmar pedido|Mandar/i }).first();
  if (await pedir.isVisible().catch(() => false)) {
    await pedir.click().catch(() => {});
    await page.waitForTimeout(1800);
  }
  await page.waitForTimeout(1200);
  await context.close();
  await browser.close();

  const vids = fs.readdirSync(TMP).filter((f) => f.endsWith(".webm")).map((f) => path.join(TMP, f));
  vids.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!vids.length) throw new Error("Playwright no dejó video de carta");
  const src = vids[0];
  fs.copyFileSync(src, raw);

  const out = path.join(OUT, "04-carta-digital-qr.mp4");
  // Phone frame on dark canvas 1280x720 with caption
  ff([
    "-i", raw,
    "-vf", [
      `scale=360:740:force_original_aspect_ratio=decrease`,
      `pad=1280:720:(ow-iw)/2:(oh-ih)/2:#0b1220`,
      `drawbox=x=0:y=ih-96:w=iw:h=96:color=black@0.75:t=fill`,
      `drawtext=font='Segoe UI':text='${escDraw("Carta por QR: el cliente pide desde la mesa")}':fontsize=32:fontcolor=white:x=36:y=h-62`,
    ].join(","),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-an",
    out,
  ], "carta");
  console.log("OK", path.relative(ROOT, out));
  return out;
}

console.log("ffmpeg:", FFMPEG);
console.log("→ clips desde capturas reales");

buildSlideshow("01-mesas-abrir-pedido", [
  {
    file: shot("app-mesas.jpg"),
    dur: 5.5,
    caption: "Mesas / salón",
    sub: "Ves qué mesas están libres, ocupadas o pidieron la cuenta",
  },
  {
    file: shot("app-mesa-cuenta.jpg"),
    dur: 7,
    caption: "Abrís la mesa y cargás el pedido",
    sub: "Comanda por ronda: entradas, platos y bebidas",
  },
  {
    file: shot("app-mesa-cuenta.jpg"),
    dur: 5,
    caption: "Enviar a cocina",
    sub: "Sale la comanda; la cuenta queda abierta en la mesa",
    zoom: "min(zoom+0.0012,1.12)",
  },
]);

buildSlideshow("02-cocina-comandas", [
  {
    file: shot("movil-mozo-mesas.jpg"),
    dur: 5,
    caption: "Mozos desde el celular",
    sub: "El mozo ve el salón y toma la mesa",
  },
  {
    file: shot("movil-mozo-comanda.jpg"),
    dur: 7,
    caption: "Comanda directa a cocina",
    sub: "Con el nombre del mozo; llega al KDS / ticket",
  },
  {
    file: shot("movil-mozo-mesa.jpg"),
    dur: 5.5,
    caption: "Estado de cada comanda",
    sub: "Pendiente, en cocina o lista para servir",
  },
]);

buildSlideshow("03-cobrar-cerrar-mesa", [
  {
    file: shot("app-mesa-cuenta.jpg"),
    dur: 5,
    caption: "La mesa pide la cuenta",
    sub: "Pre-cuenta lista; cobrás desde la misma pantalla",
  },
  {
    file: shot("app-caja.jpg"),
    dur: 5.5,
    caption: "Pasa a la caja",
    sub: "Mostrador, para llevar o delivery con la misma carta",
  },
  {
    file: shot("app-cobrar.jpg"),
    dur: 6.5,
    caption: "Cobrá y cerrá la mesa",
    sub: "Efectivo, débito, crédito, transferencia o QR · propina",
  },
  {
    file: shot("app-inicio.jpg"),
    dur: 4.5,
    caption: "El día del local en una pantalla",
    sub: "Ventas, caja y control sin planillas",
  },
]);

console.log("→ grabando demo carta walqo.pro/demo-restaurante");
try {
  await recordCartaDemo();
} catch (e) {
  console.warn("Carta en vivo falló, fallback slideshow:", e.message);
  buildSlideshow("04-carta-digital-qr", [
    {
      file: shot("movil-carta-mesa.jpg"),
      dur: 5.5,
      caption: "QR en la mesa",
      sub: "El cliente abre la carta en el celular",
    },
    {
      file: shot("movil-carta-pedido.jpg"),
      dur: 6,
      caption: "Pide sin esperar al mozo",
      sub: "Elegí platos, variantes y mandá a cocina",
    },
    {
      file: shot("movil-carta-mi-mesa.jpg"),
      dur: 5.5,
      caption: "Mi mesa",
      sub: "Ve lo pedido, llama al mozo o pide la cuenta",
    },
  ]);
}

// Overview: prefer already-copied ML clip; if missing, rebuild from stills
const overview = path.join(OUT, "00-resumen-salon.mp4");
if (!fs.existsSync(overview)) {
  buildSlideshow("00-resumen-salon", [
    { file: shot("app-mesas.jpg"), dur: 4, caption: "WalQo en un restaurante", sub: "Mesas, cocina, caja y carta por QR" },
    { file: shot("app-mesa-cuenta.jpg"), dur: 4, caption: "Cuenta por mesa", sub: "Comandas por ronda" },
    { file: shot("app-caja.jpg"), dur: 4, caption: "Cobro en caja", sub: "Con propina y varios medios" },
    { file: shot("movil-carta-mesa.jpg"), dur: 4, caption: "Carta digital", sub: "El cliente pide desde el celular" },
  ]);
}

fs.writeFileSync(
  path.join(OUT, "WHATSAPP.txt"),
  `Mirá cómo queda WalQo en un restaurante 🍽️

Te mando clips cortos (pantallas reales):

1️⃣ Resumen del salón (~40 s)
→ 00-resumen-salon.mp4

2️⃣ Abrir mesa y cargar pedido
→ 01-mesas-abrir-pedido.mp4

3️⃣ Cocina / comandas (mozo + ticket)
→ 02-cocina-comandas.mp4

4️⃣ Cobrar y cerrar la mesa
→ 03-cobrar-cerrar-mesa.mp4

5️⃣ Carta por QR (lo que ve el cliente)
→ 04-carta-digital-qr.mp4
Demo en vivo: https://walqo.pro/demo-restaurante/

Con WalQo Completo: mesas, cocina, mozos desde el celular y carta/QR.
Si querés, te lo muestro en una llamada de 10 minutos.
`,
  "utf8",
);

console.log("Listo en", path.relative(ROOT, OUT));
