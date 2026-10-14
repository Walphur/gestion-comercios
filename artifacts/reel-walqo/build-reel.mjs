import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
const { EdgeTTS } = require("node-edge-tts");

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = import.meta.dirname;
const WORK = path.join(OUT, "work");
const SHOTS = path.join(ROOT, "docs", "marketing", "shots");
const LOGO = path.join(ROOT, "docs", "branding", "walqo-mark.png");
const FONT_B = "C:/Windows/Fonts/segoeuib.ttf";
const FONT_R = "C:/Windows/Fonts/segoeui.ttf";
const W = 1080;
const H = 1920;
const FPS = 30;
const GAP = 0.22;
const TARGET = 17.4;

const LINES = [
  { scene: "impact", text: "Tu negocio, más simple." },
  { scene: "rubros", text: "Kioscos, almacenes, ferreterías, indumentaria y más." },
  { scene: "gestion", text: "Ventas, stock y caja en un solo lugar." },
  { scene: "conexion", text: "Conectá las computadoras del local." },
  { scene: "cierre", text: "Conocé WalQo en walqo.pro." },
];

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("close", (code) => {
      if (code === 0) resolve(err);
      else reject(new Error(err.slice(-2500)));
    });
  });
}

function durationOf(log) {
  const m = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function probe(file) {
  const log = await run(["-hide_banner", "-i", file, "-f", "null", "-"]);
  return durationOf(log);
}

function font(file) {
  return file.replace(":", "\\:");
}

function dt({ textFile, size, y, bold, color = "white", start = 0, x, enable }) {
  const xExpr = x ?? "(w-text_w)/2";
  const alpha = start > 0 ? `:alpha='if(lt(t,${start}),0,if(lt(t,${start + 0.35}),(t-${start})/0.35,1))'` : "";
  const gate = enable ? `:enable='${enable}'` : "";
  const quoted = textFile.replace(/\\/g, "/").replace(":", "\\:");
  return `drawtext=fontfile='${font(bold ? FONT_B : FONT_R)}':textfile='${quoted}':fontsize=${size}:fontcolor=${color}:x=${xExpr}:y=${y}:borderw=0${alpha}${gate}`;
}

async function textFile(name, text) {
  const file = path.join(WORK, name);
  await writeFile(file, text, "utf8");
  return file.replace(/\\/g, "/");
}

function escPath(file) {
  return file.replace(/\\/g, "/").replace(/:/g, "\\:");
}

async function main() {
  await rm(WORK, { recursive: true, force: true });
  await mkdir(WORK, { recursive: true });

  console.log("Locución…");
  const cues = [];
  let cursor = 0.2;
  const pieces = [];
  for (let i = 0; i < LINES.length; i++) {
    const file = path.join(WORK, `line-${i}.mp3`);
    const tts = new EdgeTTS({
      voice: "es-AR-TomasNeural",
      lang: "es-AR",
      rate: "+6%",
      pitch: "-2Hz",
      volume: "+0%",
      timeout: 30000,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    });
    await tts.ttsPromise(LINES[i].text, file);
    const dur = await probe(file);
    if (!dur) throw new Error("La locución no generó audio en la línea " + i);
    cues.push({ start: cursor, end: cursor + dur, text: LINES[i].text, scene: LINES[i].scene, dur });
    pieces.push({ file, dur });
    cursor += dur + (i === LINES.length - 1 ? 0 : GAP);
  }
  let hold = TARGET - cursor;
  if (hold < 0.45) hold = 0.45;
  if (cursor + hold > 19.6) hold = Math.max(0.3, 19.6 - cursor);
  const total = cursor + hold;
  if (total < 15 || total > 20) {
    throw new Error("Duración fuera de 15–20 s: " + total.toFixed(2));
  }
  console.log("Duración de voz", cursor.toFixed(2), "video", total.toFixed(2));

  const srt = cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${wrap(c.text)}\n`)
    .join("\n");
  await writeFile(path.join(OUT, "walqo-subtitulos.srt"), srt, "utf8");

  const voiceList = path.join(WORK, "voice.txt");
  const voiceFiles = [];
  for (let i = 0; i < pieces.length; i++) {
    voiceFiles.push(`file '${pieces[i].file.replace(/\\/g, "/")}'`);
      if (i < pieces.length - 1) {
      const sil = path.join(WORK, `sil-${i}.wav`);
      await run([
        "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
        "-t", String(GAP), "-c:a", "pcm_s16le", sil,
      ]);
      voiceFiles.push(`file '${sil.replace(/\\/g, "/")}'`);
    }
  }
  await writeFile(voiceList, voiceFiles.join("\n"), "utf8");
  const voiceWav = path.join(OUT, "walqo-voz.wav");
  await run([
    "-y", "-f", "concat", "-safe", "0", "-i", voiceList,
    "-af", "apad=pad_dur=" + hold.toFixed(3) + ",loudnorm=I=-16:TP=-1.5:LRA=9",
    "-ar", "48000", "-ac", "2", voiceWav,
  ]);

  console.log("Fondo y música…");
  const bg = path.join(WORK, "bg.png");
  await run(["-y", "-f", "lavfi", "-i", `color=c=0x070B14:s=${W}x${H}:d=1`, "-frames:v", "1", bg]);
  const glow = path.join(WORK, "glow.png");
  await run([
    "-y", "-f", "lavfi", "-i", "color=c=0x2F6BFF:s=900x900:d=1",
    "-vf", "format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='180*exp(-((X-450)*(X-450)+(Y-450)*(Y-450))/70000)'",
    "-frames:v", "1", glow,
  ]);

  const music = path.join(WORK, "music.wav");
  await run([
    "-y",
    "-f", "lavfi", "-t", total.toFixed(3), "-i", "sine=frequency=92:sample_rate=48000",
    "-f", "lavfi", "-t", total.toFixed(3), "-i", "sine=frequency=138:sample_rate=48000",
    "-f", "lavfi", "-t", total.toFixed(3), "-i", "sine=frequency=184:sample_rate=48000",
    "-filter_complex",
    "[0:a]volume=0.22[a];[1:a]volume=0.10[b];[2:a]volume=0.06[c];[a][b][c]amix=inputs=3:normalize=0,lowpass=f=420,tremolo=f=0.12:d=0.35,afade=t=in:st=0:d=0.4,afade=t=out:st=" + Math.max(0.2, total - 0.8).toFixed(3) + ":d=0.7,volume=0.55",
    "-c:a", "pcm_s16le", music,
  ]);

  const sceneDur = Object.fromEntries(LINES.map((l) => [l.scene, 0]));
  cues.forEach((c, i) => {
    sceneDur[c.scene] += c.dur + (i < cues.length - 1 ? GAP : 0);
  });
  sceneDur.cierre += hold;

  const renders = [];
  renders.push(await renderImpact(sceneDur.impact));
  renders.push(await renderRubros(sceneDur.rubros));
  renders.push(await renderShots(sceneDur.gestion, [
    { file: "pos.png", focus: 0.22, title: "Ventas, stock y caja", sub: "en un solo lugar" },
    { file: "productos.png", focus: 0.42, title: "Ventas, stock y caja", sub: "en un solo lugar" },
    { file: "stock.png", focus: 0.4, title: "Ventas, stock y caja", sub: "en un solo lugar" },
  ]));
  renders.push(await renderConnect(sceneDur.conexion));
  renders.push(await renderClose(sceneDur.cierre));

  console.log("Uniendo escenas…");
  const inputs = [];
  renders.forEach((file) => {
    inputs.push("-i", file);
  });
  const labels = renders.map((_, i) => `[${i}:v]`).join("");
  const videoOnly = path.join(WORK, "video.mp4");
  const burned = [];
  for (let i = 0; i < cues.length; i++) {
    const lines = wrap(cues[i].text).split("\n");
    for (let li = 0; li < lines.length; li++) {
      const file = await textFile(`cap-${i}-${li}.txt`, lines[li]);
      burned.push(dt({
        textFile: file,
        size: 34,
        bold: false,
        y: 1768 + li * 44,
        enable: `between(t,${cues[i].start.toFixed(2)},${cues[i].end.toFixed(2)})`,
      }));
    }
  }
  await run([
    "-y", ...inputs,
    "-filter_complex",
    `${labels}concat=n=${renders.length}:v=1:a=0[vx];[vx]${burned.join(",")},fade=t=in:st=0:d=0.25,fade=t=out:st=${(total - 0.35).toFixed(3)}:d=0.35,format=yuv420p[vout]`,
    "-map", "[vout]",
    "-r", String(FPS),
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18",
    "-t", total.toFixed(3),
    videoOnly,
  ]);

  const finalFile = path.join(OUT, "walqo-reel.mp4");
  await run([
    "-y", "-i", videoOnly, "-i", voiceWav, "-i", music,
    "-filter_complex",
    "[1:a]volume=1[v];[2:a]volume=0.16[m];[v][m]amix=inputs=2:duration=first:normalize=0:dropout_transition=0[aout]",
    "-map", "0:v", "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart",
    "-t", total.toFixed(3),
    finalFile,
  ]);

  const info = await run(["-hide_banner", "-i", finalFile, "-f", "null", "-"]);
  console.log(info.split("\n").filter((l) => /Duration|Stream #/.test(l)).join("\n"));
  console.log("Listo", finalFile);
}

function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const milli = ms % 1000;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)},${String(milli).padStart(3, "0")}`;
}

function wrap(text) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > 34 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

async function baseInputs(duration) {
  return [
    "-loop", "1", "-t", duration.toFixed(3), "-i", path.join(WORK, "bg.png"),
    "-loop", "1", "-t", duration.toFixed(3), "-i", path.join(WORK, "glow.png"),
  ];
}

function baseChain() {
  return "[0:v]scale=1080:1920,setsar=1,fps=30[bg];[1:v]scale=980:980,format=rgba[gl];[bg][gl]overlay=(W-w)/2:180:format=auto[base];";
}

async function renderImpact(duration) {
  const out = path.join(WORK, "scene-impact.mp4");
  const t1 = await textFile("t-impact.txt", "Tu negocio, más simple");
  const t2 = await textFile("t-brand.txt", "WalQo");
  console.log("Escena impacto", duration.toFixed(2));
  await run([
    "-y",
    ...(await baseInputs(duration)),
    "-loop", "1", "-t", duration.toFixed(3), "-i", path.join(SHOTS, "pos.png"),
    "-loop", "1", "-t", duration.toFixed(3), "-i", LOGO,
    "-filter_complex",
    baseChain() +
      "[2:v]scale=1000:-2,format=rgba,fade=t=in:st=0.15:d=0.45:alpha=1[ui];" +
      "[3:v]scale=220:220,format=rgba,colorkey=0x000000:0.22:0.08,fade=t=in:st=0.1:d=0.45:alpha=1[logo];" +
      "[base][logo]overlay=(W-w)/2:150:format=auto[b1];" +
      "[b1][ui]overlay=(W-w)/2:700:format=auto," +
      dt({ textFile: t2, size: 60, y: 400, bold: true, start: 0.25 }) + "," +
      dt({ textFile: t1, size: 44, y: 1420, bold: true, start: 0.4 }),
    "-r", "30", "-t", duration.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
    out,
  ]);
  return out;
}

async function renderRubros(duration) {
  const out = path.join(WORK, "scene-rubros.mp4");
  const title = await textFile("t-rubros.txt", "Un sistema para muchos rubros");
  const names = ["Kiosco", "Almacén", "Ferretería", "Indumentaria", "Farmacia", "Verdulería", "Panadería", "Librería"];
  const files = [];
  for (let i = 0; i < names.length; i++) files.push(await textFile(`rubro-${i}.txt`, names[i]));
  let draw = "";
  const cw = 430;
  const ch = 108;
  const gx = 28;
  const gy = 24;
  const x0 = Math.round((1080 - (cw * 2 + gx)) / 2);
  const y0 = 560;
  names.forEach((_, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = x0 + col * (cw + gx);
    const y = y0 + row * (ch + gy);
    draw += `drawbox=x=${x}:y=${y}:w=${cw}:h=${ch}:color=0x121A2B:t=fill,`;
    draw += `drawbox=x=${x}:y=${y}:w=${cw}:h=${ch}:color=0x6B93FF@0.85:t=2,`;
    draw += dt({
      textFile: files[i],
      size: 36,
      bold: true,
      y: y + 32,
      x: `${x}+(${cw}-text_w)/2`,
      start: 0.15 + i * 0.08,
    }) + ",";
  });
  console.log("Escena rubros", duration.toFixed(2));
  await run([
    "-y",
    ...(await baseInputs(duration)),
    "-filter_complex",
    baseChain() +
      "[base]" + draw +
      dt({ textFile: title, size: 44, y: 430, bold: true, start: 0.1 }).replace(/^drawtext/, "drawtext"),
    "-r", "30", "-t", duration.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
    out,
  ]);
  return out;
}

async function renderShots(duration, shots) {
  const out = path.join(WORK, `scene-${shots[0].title.slice(0, 8).replace(/\W/g, "")}-${shots.length}.mp4`);
  const title = await textFile("title-" + shots.length + "-" + duration.toFixed(0) + ".txt", shots[0].title);
  const sub = shots[0].sub ? await textFile("sub-" + shots.length + "-" + duration.toFixed(0) + ".txt", shots[0].sub) : "";
  const slice = duration / shots.length;
  const args = ["-y", ...(await baseInputs(duration))];
  shots.forEach((s) => {
    args.push("-loop", "1", "-t", duration.toFixed(3), "-i", path.join(SHOTS, s.file));
  });
  let chain = baseChain();
  shots.forEach((s, i) => {
    const start = i * slice;
    const end = start + slice;
    const focus = s.focus;
    const fadeOut = i < shots.length - 1
      ? `,fade=t=out:st=${Math.max(start, end - 0.22).toFixed(3)}:d=0.22:alpha=1`
      : "";
    chain += `[${i + 2}:v]scale=1040:-2,format=rgba,fade=t=in:st=${start.toFixed(3)}:d=0.22:alpha=1${fadeOut}[sh${i}];`;
  });
  chain += "[base]";
  shots.forEach((_, i) => {
    chain += `[sh${i}]overlay=(W-w)/2:430:format=auto`;
    chain += i === shots.length - 1 ? "[framed];" : "[tmp" + i + "];[tmp" + i + "]";
  });
  chain += "[framed]" + dt({ textFile: title, size: 46, y: 180, bold: true });
  if (sub) chain += "," + dt({ textFile: sub, size: 36, y: 250, bold: false, color: "0xC9D6F5" });
  console.log("Escena capturas", shots.map((s) => s.file).join(", "), duration.toFixed(2));
  await run([
    ...args,
    "-filter_complex", chain,
    "-r", "30", "-t", duration.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
    out,
  ]);
  return out;
}

async function renderConnect(duration) {
  const out = path.join(WORK, "scene-conexion.mp4");
  const title = await textFile("t-con.txt", "Conectá tu forma de trabajar");
  const a = await textFile("t-pc1.txt", "Computadora del mostrador");
  const b = await textFile("t-pc2.txt", "Otra computadora del local");
  const c = await textFile("t-lan.txt", "Sincronizadas en la misma red");
  console.log("Escena conexión", duration.toFixed(2));
  await run([
    "-y",
    ...(await baseInputs(duration)),
    "-loop", "1", "-t", duration.toFixed(3), "-i", path.join(SHOTS, "pos.png"),
    "-filter_complex",
    baseChain() +
      "[2:v]scale=920:-2[thumb];" +
      "[base][thumb]overlay=(W-w)/2:360:format=auto," +
      "drawbox=x=120:y=1120:w=840:h=130:color=0x121A2B:t=fill," +
      "drawbox=x=120:y=1120:w=840:h=130:color=0x6B93FF@0.9:t=2," +
      "drawbox=x=538:y=1260:w=4:h=36:color=0x6B93FF:t=fill," +
      "drawbox=x=120:y=1306:w=840:h=160:color=0x121A2B:t=fill," +
      "drawbox=x=120:y=1306:w=840:h=160:color=0xA78BFA@0.9:t=2," +
      dt({ textFile: title, size: 40, y: 200, bold: true }) + "," +
      dt({ textFile: a, size: 30, y: 1155, bold: true }) + "," +
      dt({ textFile: b, size: 30, y: 1340, bold: true }) + "," +
      dt({ textFile: c, size: 26, y: 1395, bold: false, color: "0xC9D6F5" }),
    "-r", "30", "-t", duration.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
    out,
  ]);
  return out;
}

async function renderClose(duration) {
  const out = path.join(WORK, "scene-cierre.mp4");
  const t1 = await textFile("t-close.txt", "Dale otra forma a tu negocio");
  const t2 = await textFile("t-cta.txt", "Conocé WalQo en walqo.pro");
  const t3 = await textFile("t-logo-word.txt", "WalQo");
  console.log("Escena cierre", duration.toFixed(2));
  await run([
    "-y",
    ...(await baseInputs(duration)),
    "-loop", "1", "-t", duration.toFixed(3), "-i", LOGO,
    "-filter_complex",
    baseChain() +
      "[2:v]scale=260:260,format=rgba,colorkey=0x000000:0.22:0.08,fade=t=in:st=0.1:d=0.45:alpha=1[logo];" +
      "[base][logo]overlay=(W-w)/2:420:format=auto," +
      dt({ textFile: t3, size: 72, y: 720, bold: true, start: 0.2 }) + "," +
      dt({ textFile: t1, size: 40, y: 860, bold: true, start: 0.35 }) + "," +
      dt({ textFile: t2, size: 32, y: 980, bold: false, color: "0x9DB4FF", start: 0.5 }),
    "-r", "30", "-t", duration.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
    out,
  ]);
  return out;
}

main().catch((err) => {
  console.error(err.stderr || err.message || err);
  process.exit(1);
});
