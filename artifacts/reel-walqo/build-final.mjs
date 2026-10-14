import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
const { EdgeTTS } = require("node-edge-tts");

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = import.meta.dirname;
const WORK = path.join(OUT, "work-final");
const SHOTS = path.join(ROOT, "docs", "marketing", "shots");
const LOGO = path.join(ROOT, "docs", "branding", "walqo-mark.png");
const FONT_B = "C:/Windows/Fonts/segoeuib.ttf";
const FONT_R = "C:/Windows/Fonts/segoeui.ttf";
const GAP = 0.28;

const LINES = [
  { scene: "hook", text: "¿Tenés un comercio? Simplificá tu día." },
  { scene: "rubros", text: "Un sistema para kioscos, almacenes, ferreterías, indumentaria y más." },
  { scene: "producto", text: "Con WalQo, gestioná ventas, productos, stock y caja desde un solo lugar." },
  { scene: "conexion", text: "Conectá las computadoras del local y simplificá tu trabajo." },
  { scene: "beneficio", text: "Más control. Menos complicaciones." },
  { scene: "cierre", text: "Tu negocio, más simple. Probá WalQo gratis en walqo.pro." },
];

const RUBROS = ["Kiosco", "Almacén", "Ferretería", "Indumentaria", "Farmacia", "Verdulería"];

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("close", (code) => (code === 0 ? resolve(err) : reject(new Error(err.slice(-2200)))));
  });
}

function durationOf(log) {
  const m = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function probe(file) {
  return durationOf(await run(["-hide_banner", "-i", file, "-f", "null", "-"]));
}

function font(file) {
  return file.replace(":", "\\:");
}

async function textFile(name, text) {
  const file = path.join(WORK, name);
  await writeFile(file, text, "utf8");
  return file.replace(/\\/g, "/");
}

function dt(file, { size, y, bold = true, color = "white", start = 0, end = 0, x }) {
  const quoted = file.replace(/\\/g, "/").replace(":", "\\:");
  const xExpr = x ?? "(w-text_w)/2";
  let alpha = "";
  if (start > 0) alpha = `:alpha='if(lt(t,${start}),0,if(lt(t,${(start + 0.22).toFixed(2)}),(t-${start})/0.22,1))'`;
  let enable = "";
  if (end > 0) enable = `:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
  return `drawtext=fontfile='${font(bold ? FONT_B : FONT_R)}':textfile='${quoted}':fontsize=${size}:fontcolor=${color}:x=${xExpr}:y=${y}${alpha}${enable}`;
}

function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, "0")}`;
}

function wrap(text) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > 32 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

function shotFilter(inputIndex, crop, duration, outH) {
  const travel = `(iw-1080)*${(0.12 + 0.18).toFixed(2)}`;
  return `[${inputIndex}:v]crop=${crop},scale=-2:${outH + 80},crop=1080:${outH}:'(iw-1080)*0.08+${travel}*t/${duration.toFixed(3)}':20,fps=30,format=yuv420p`;
}

async function encodeScene(name, duration, inputs, filter) {
  const out = path.join(WORK, `${name}.mp4`);
  console.log("Escena", name, duration.toFixed(2));
  await run([
    "-y",
    ...inputs.flatMap((file) => ["-loop", "1", "-t", duration.toFixed(3), "-i", file]),
    "-filter_complex", filter,
    "-r", "30",
    "-t", duration.toFixed(3),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-crf", "17",
    out,
  ]);
  return out;
}

async function main() {
  await rm(WORK, { recursive: true, force: true });
  await mkdir(WORK, { recursive: true });

  console.log("Locución…");
  const cues = [];
  const pieces = [];
  let cursor = 0;
  for (let i = 0; i < LINES.length; i++) {
    const file = path.join(WORK, `line-${i}.mp3`);
    const tts = new EdgeTTS({
      voice: "es-AR-TomasNeural",
      lang: "es-AR",
      rate: "-4%",
      pitch: "-1Hz",
      timeout: 30000,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    });
    await tts.ttsPromise(LINES[i].text, file);
    const dur = await probe(file);
    if (!dur) throw new Error("Sin audio en la línea " + i);
    cues.push({ ...LINES[i], start: cursor, end: cursor + dur, dur });
    pieces.push({ file, dur });
    cursor += dur + (i < LINES.length - 1 ? GAP : 0);
  }

  let hold = 0;
  if (cursor < 26) hold = 26 - cursor;
  if (cursor + hold > 34.5) hold = Math.max(0.6, 34.5 - cursor);
  const total = cursor + hold;
  console.log("Voz hasta", cursor.toFixed(2), "video", total.toFixed(2));
  if (total < 25 || total > 35) console.log("Aviso: duración fuera de 25–35:", total.toFixed(2));

  const srtBody = cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${wrap(c.text)}\n`).join("\n");
  const srtPath = path.join(OUT, "walqo-subtitulos-final.srt");
  await writeFile(srtPath, srtBody, "utf8");

  const list = [];
  for (let i = 0; i < pieces.length; i++) {
    list.push(`file '${pieces[i].file.replace(/\\/g, "/")}'`);
    if (i < pieces.length - 1) {
      const sil = path.join(WORK, `sil-${i}.wav`);
      await run(["-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(GAP), "-c:a", "pcm_s16le", sil]);
      list.push(`file '${sil.replace(/\\/g, "/")}'`);
    }
  }
  await writeFile(path.join(WORK, "voice.txt"), list.join("\n"), "utf8");
  const voiceWav = path.join(OUT, "walqo-voz-final.wav");
  await run([
    "-y", "-f", "concat", "-safe", "0", "-i", path.join(WORK, "voice.txt"),
    "-af", `apad=pad_dur=${hold.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=9`,
    "-ar", "48000", "-ac", "2", voiceWav,
  ]);

  const bg = path.join(WORK, "bg.png");
  await run(["-y", "-f", "lavfi", "-i", "color=c=0x070B14:s=1080x1920:d=1", "-frames:v", "1", bg]);

  const dur = Object.fromEntries(cues.map((c) => [c.scene, c.dur + GAP]));
  dur.cierre = cues.at(-1).dur + hold;

  const hookTitle = await textFile("hook-a.txt", "¿Tenés un comercio?");
  const hookSub = await textFile("hook-b.txt", "Simplificá tu día");
  const rubroTitle = await textFile("rubro-title.txt", "Un sistema para muchos rubros");
  const prodTitle = await textFile("prod-title.txt", "Ventas, stock y caja");
  const prodSub = await textFile("prod-sub.txt", "en un solo lugar");
  const conTitle = await textFile("con-title.txt", "Conectá tus equipos");
  const conSub = await textFile("con-sub.txt", "Simplificá tu trabajo");
  const pc1 = await textFile("pc1.txt", "Computadora del mostrador");
  const pc2 = await textFile("pc2.txt", "Otra computadora del local");
  const lan = await textFile("lan.txt", "Sincronizadas en la misma red");
  const benTitle = await textFile("ben-title.txt", "Más control.");
  const benSub = await textFile("ben-sub.txt", "Menos complicaciones");
  const close1 = await textFile("close1.txt", "Tu negocio, más simple");
  const close2 = await textFile("close2.txt", "Probá gratis");
  const close3 = await textFile("close3.txt", "walqo.pro");
  const brand = await textFile("brand.txt", "WalQo");
  const rubroFiles = [];
  for (let i = 0; i < RUBROS.length; i++) rubroFiles.push(await textFile(`rubro-${i}.txt`, RUBROS[i]));

  const bars = "drawbox=x=0:y=0:w=1080:h=250:color=0x070B14@0.82:t=fill,drawbox=x=0:y=1660:w=1080:h=260:color=0x070B14@0.88:t=fill";

  const hook = await encodeScene("hook", dur.hook, [bg, LOGO, path.join(SHOTS, "pos.png")], [
    "[0:v]scale=1080:1920,fps=30[bg];",
    "[2:v]crop=1700:760:500:150,scale=1040:-2,fps=30[ui];",
    "[1:v]scale=200:200,format=rgba,colorkey=0x000000:0.2:0.08,fade=t=in:st=0:d=0.35:alpha=1[logo];",
    "[bg][ui]overlay=(W-w)/2:700[b];",
    "[b][logo]overlay=(W-w)/2:250[c];",
    "[c]drawbox=x=0:y=1660:w=1080:h=260:color=0x070B14@0.9:t=fill,",
    dt(hookTitle, { size: 52, y: 80, start: 0.08 }) + ",",
    dt(hookSub, { size: 42, y: 155, start: 0.18, color: "0x9DB4FF" }),
  ].join(""));

  const slice = dur.rubros / RUBROS.length;
  let rubroDraw = "";
  RUBROS.forEach((_, i) => {
    const a = i * slice;
    const b = (i + 1) * slice;
    rubroDraw += dt(rubroFiles[i], { size: 78, y: 860, start: a, end: b }) + ",";
  });
  const rubros = await encodeScene("rubros", dur.rubros, [bg], [
    "[0:v]scale=1080:1920,fps=30,",
    "drawbox=x=390:y=760:w=300:h=8:color=0x2F6BFF:t=fill,",
    rubroDraw,
    dt(rubroTitle, { size: 42, y: 200, start: 0.08 }),
  ].join(""));

  const parts = [
    { file: "pos.png", crop: "1700:760:500:150", wide: true },
    { file: "productos.png", crop: "2100:980:520:160", wide: true },
    { file: "pos.png", crop: "700:1480:2160:70", wide: false },
  ];
  const each = dur.producto / parts.length;
  const prodClips = [];
  for (let i = 0; i < parts.length; i++) {
    const clip = path.join(WORK, `prod-${i}.mp4`);
    const d = each + (i < parts.length - 1 ? 0.16 : 0);
    await run([
      "-y", "-loop", "1", "-t", d.toFixed(3), "-i", path.join(SHOTS, parts[i].file),
      "-loop", "1", "-t", d.toFixed(3), "-i", bg,
      "-filter_complex",
      `[0:v]crop=${parts[i].crop},${parts[i].wide ? "scale=1040:-2" : "scale=-2:1240"},fps=30[ui];` +
        `[1:v]scale=1080:1920,fps=30[bg];[bg][ui]overlay=(W-w)/2:${parts[i].wide ? 430 : 300},${bars},` +
        dt(prodTitle, { size: 46, y: 80, start: 0.05 }) + "," +
        dt(prodSub, { size: 34, y: 148, start: 0.12, bold: false, color: "0xC9D6F5" }),
      "-r", "30", "-t", d.toFixed(3), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", clip,
    ]);
    prodClips.push(clip);
  }
  const producto = path.join(WORK, "producto.mp4");
  let xf = "";
  let last = "0:v";
  let offset = 0;
  for (let i = 1; i < prodClips.length; i++) {
    offset += each;
    const label = i === prodClips.length - 1 ? "vout" : "p" + i;
    xf += `[${last}][${i}:v]xfade=transition=slideleft:duration=0.16:offset=${offset.toFixed(3)}[${label}];`;
    last = label;
  }
  await run([
    "-y", ...prodClips.flatMap((f) => ["-i", f]),
    "-filter_complex", xf,
    "-map", "[vout]", "-r", "30", "-t", dur.producto.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", producto,
  ]);

  const conexion = await encodeScene("conexion", dur.conexion, [bg, path.join(SHOTS, "pos.png")], [
    "[0:v]scale=1080:1920,fps=30[bg];",
    "[1:v]crop=1700:760:500:150,scale=1000:-2,fps=30[ui];",
    "[bg][ui]overlay=(W-w)/2:300,",
    "drawbox=x=80:y=1180:w=920:h=120:color=0x121A2B:t=fill,",
    "drawbox=x=80:y=1180:w=920:h=120:color=0x6B93FF:t=3,",
    "drawbox=x=534:y=1300:w=8:h='min(150,max(8,t*90))':color=0x6B93FF:t=fill,",
    "drawbox=x=80:y=1450:w=920:h=150:color=0x121A2B:t=fill,",
    "drawbox=x=80:y=1450:w=920:h=150:color=0xA78BFA:t=3,",
    dt(conTitle, { size: 46, y: 90, start: 0.05 }) + ",",
    dt(conSub, { size: 32, y: 155, start: 0.15, bold: false, color: "0xC9D6F5" }) + ",",
    dt(pc1, { size: 30, y: 1215 }) + ",",
    dt(pc2, { size: 30, y: 1485 }) + ",",
    dt(lan, { size: 26, y: 1535, bold: false, color: "0xC9D6F5" }),
  ].join(""));

  const beneficio = await encodeScene("beneficio", dur.beneficio, [bg, path.join(SHOTS, "stock.png")], [
    "[0:v]scale=1080:1920,fps=30[bg];",
    "[1:v]crop=2200:1100:480:190,scale=1040:-2,fps=30[ui];",
    "[bg][ui]overlay=(W-w)/2:460,",
    bars + ",",
    dt(benTitle, { size: 58, y: 80, start: 0.05 }) + ",",
    dt(benSub, { size: 40, y: 155, start: 0.12, color: "0x9DB4FF" }),
  ].join(""));

  const cierre = await encodeScene("cierre", dur.cierre, [bg, LOGO], [
    "[0:v]scale=1080:1920,fps=30[bg];",
    "[1:v]scale=280:280,format=rgba,colorkey=0x000000:0.2:0.08,fade=t=in:st=0.05:d=0.4:alpha=1[logo];",
    "[bg][logo]overlay=(W-w)/2:520,",
    dt(brand, { size: 72, y: 840, start: 0.2 }) + ",",
    dt(close1, { size: 46, y: 980, start: 0.3 }) + ",",
    dt(close2, { size: 40, y: 1080, start: 0.45, color: "0x9DB4FF" }) + ",",
    dt(close3, { size: 48, y: 1180, start: 0.55 }),
  ].join(""));

  const scenes = [hook, rubros, producto, conexion, beneficio, cierre];
  const video = path.join(WORK, "video.mp4");
  const labels = scenes.map((_, i) => `[${i}:v]`).join("");
  const subDraw = [];
  for (let i = 0; i < cues.length; i++) {
    const lines = wrap(cues[i].text).split("\n").slice(0, 3);
    const files = [];
    for (let k = 0; k < lines.length; k++) files.push(await textFile(`sub-${i}-${k}.txt`, lines[k]));
    const y0 = 1848 - lines.length * 46;
    lines.forEach((_, k) => {
      subDraw.push(dt(files[k], {
        size: 34,
        y: y0 + k * 46,
        bold: true,
        start: cues[i].start,
        end: cues[i].end,
      }));
    });
  }
  await run([
    "-y", ...scenes.flatMap((f) => ["-i", f]),
    "-filter_complex",
    `${labels}concat=n=${scenes.length}:v=1:a=0[vx];[vx]${subDraw.join(",")},fade=t=in:st=0:d=0.25,fade=t=out:st=${(total - 0.35).toFixed(3)}:d=0.35,format=yuv420p[vout]`,
    "-map", "[vout]", "-r", "30", "-t", total.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", video,
  ]);

  const music = path.join(WORK, "music.wav");
  await run([
    "-y",
    "-f", "lavfi", "-t", total.toFixed(3), "-i", "sine=frequency=92:sample_rate=48000",
    "-f", "lavfi", "-t", total.toFixed(3), "-i", "sine=frequency=138:sample_rate=48000",
    "-f", "lavfi", "-t", total.toFixed(3), "-i", "sine=frequency=196:sample_rate=48000",
    "-filter_complex",
    "[0:a]volume=0.2[a];[1:a]volume=0.09[b];[2:a]volume=0.05[c];[a][b][c]amix=inputs=3:normalize=0,lowpass=f=380,tremolo=f=0.1:d=0.3,afade=t=in:d=0.6,afade=t=out:st=" + (total - 1.2).toFixed(3) + ":d=1.2,volume=0.5",
    music,
  ]);

  const finalFile = path.join(OUT, "walqo-reel-final.mp4");
  await run([
    "-y", "-i", video, "-i", voiceWav, "-i", music,
    "-filter_complex", "[1:a]volume=1[v];[2:a]volume=0.13[m];[v][m]amix=inputs=2:duration=first:normalize=0:dropout_transition=0[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart", "-t", total.toFixed(3),
    finalFile,
  ]);

  const info = await run(["-hide_banner", "-i", finalFile, "-f", "null", "-"]);
  console.log(info.split("\n").filter((l) => /Duration:|Stream #0:0|Stream #0:1/.test(l) && !l.includes("->")).join("\n"));
  console.log("Listo", finalFile);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
