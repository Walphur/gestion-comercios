import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpeg = require("ffmpeg-static");
const { EdgeTTS } = require("node-edge-tts");

const OUT = import.meta.dirname;
const WORK = path.join(OUT, "work-v2");
const CAPTURES = path.join(OUT, "captures");
const LOGO = path.resolve(OUT, "../../docs/branding/walqo-mark.png");
const FONT_B = "C:/Windows/Fonts/segoeuib.ttf";
const FONT_R = "C:/Windows/Fonts/segoeui.ttf";
const PREVIEW = process.env.PREVIEW === "1";
const GAP = 0.24;
const FADE = 0.18;
const MAX_W = 920;
const MAX_H = 1180;
const RADIUS = 22;

const SCENES = [
  {
    id: "inicio",
    voice: "Todo tu comercio, en un solo lugar.",
    title: ["Todo tu comercio,", "en un solo lugar"],
    shots: [
      { file: "inicio.png" },
      { file: "inicio.png", crop: "600:430:88:150", label: "Ventas, caja y stock" },
    ],
  },
  {
    id: "ventas",
    voice: "Ventas y caja bajo control.",
    title: ["Ventas y caja", "bajo control"],
    shots: [
      { file: "ventas.png", label: "Historial de ventas" },
      { file: "caja.png", label: "Turno del día" },
    ],
  },
  {
    id: "stock",
    voice: "Productos y stock actualizados.",
    title: ["Productos y stock", "actualizados"],
    shots: [
      { file: "productos.png", label: "Catálogo" },
      { file: "stock.png", label: "Alertas y movimientos" },
    ],
  },
  {
    id: "rubros",
    voice: "Adaptado a distintos rubros.",
    title: ["Adaptado a", "distintos rubros"],
    shots: [{ file: "rubros.png" }],
  },
  {
    id: "conexiones",
    voice: "Podés conectar el celular, Tienda Nube y Mercado Pago.",
    title: ["Conectá tus", "herramientas"],
    shots: [
      { file: "celular.png", label: "App del celular" },
      { file: "tiendanube.png", label: "Tienda Nube" },
      { file: "mercadopago.png", label: "Mercado Pago" },
    ],
  },
  {
    id: "cierre",
    voice: "Conocé WalQo en walqo.pro.",
    title: ["Conocé WalQo", "walqo.pro"],
    shots: [],
  },
];

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("close", (code) => (code === 0 ? resolve(err) : reject(new Error(err.slice(-2500)))));
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
  return file.replace(/\\/g, "/").replace(":", "\\:");
}

function dt(file, { size, y, bold = true, color = "white", start = 0, end = 0 }) {
  let alpha = "";
  if (start > 0) alpha = `:alpha='if(lt(t,${start}),0,if(lt(t,${(start + 0.22).toFixed(2)}),(t-${start})/0.22,1))'`;
  let enable = "";
  if (end > 0) enable = `:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
  return `drawtext=fontfile='${font(bold ? FONT_B : FONT_R)}':textfile='${file}':fontsize=${size}:fontcolor=${color}:borderw=3:bordercolor=0x070B14@0.85:x=(w-text_w)/2:y=${y}${alpha}${enable}`;
}

function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, "0")}`;
}

async function graph(name, body) {
  const file = path.join(WORK, name);
  await writeFile(file, body, "utf8");
  return file;
}

async function frameShot(src, dest) {
  const script = await graph(
    `frame-${path.basename(dest)}.txt`,
    [
      "[0:v]scale=" + MAX_W + ":" + MAX_H + ":force_original_aspect_ratio=decrease:flags=lanczos,",
      "pad=iw+4:ih+4:(ow-iw)/2:(oh-ih)/2:color=0x8FB4FF,format=rgba,",
      "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(max(abs(X-W/2)-(W/2-" + RADIUS + "),0),max(abs(Y-H/2)-(H/2-" + RADIUS + "),0))," + RADIUS + "),255,0)'[img];",
      "[img]split[a][b];",
      "[b]colorchannelmixer=rr=0:gg=0:bb=0.45:aa=0.5,gblur=sigma=14,pad=iw+56:ih+56:22:34:color=black@0[sh];",
      "[a]pad=iw+56:ih+56:22:20:color=black@0[fg];",
      "[sh][fg]overlay=0:8",
    ].join(""),
  );
  await run(["-y", "-i", src, "-filter_complex_script", script, "-frames:v", "1", "-pix_fmt", "rgba", dest]);
}

async function blurPlate(src, dest) {
  await run([
    "-y", "-i", src,
    "-vf", "scale=1280:2200:force_original_aspect_ratio=increase,crop=1280:2200,gblur=sigma=18,eq=brightness=0.16:contrast=1.08:saturation=1.25,vignette=PI/5",
    "-frames:v", "1", dest,
  ]);
}

async function prepareSources() {
  const cajaSrc = path.join(CAPTURES, "caja.png");
  const cajaOut = path.join(WORK, "caja-safe.png");
  const mask = await graph(
    "mask-caja.txt",
    "[0:v]split[a][b];[b]crop=830:40:120:778,gblur=sigma=18[m];[a][m]overlay=120:778",
  );
  await run(["-y", "-i", cajaSrc, "-filter_complex_script", mask, "-frames:v", "1", cajaOut]);

  const zoom = path.join(WORK, "inicio-zoom.png");
  await run(["-y", "-i", path.join(CAPTURES, "inicio.png"), "-vf", "crop=600:430:88:150", "-frames:v", "1", zoom]);
  return { "caja.png": cajaOut, "inicio-zoom.png": zoom };
}

function shotSource(shot, prepared) {
  if (shot.crop) return prepared["inicio-zoom.png"];
  if (shot.file === "caja.png") return prepared["caja.png"];
  return path.join(CAPTURES, shot.file);
}

async function stillOf(bg, fg, titles, dest) {
  const parts = [
    "[0:v]crop=1080:1920:(iw-1080)/2:(ih-1920)/2,format=yuv420p[bg];",
    "[bg][1:v]overlay=(W-w)/2:236",
  ];
  const draws = [];
  if (titles[0]) draws.push(dt(titles[0], { size: 52, y: 58 }));
  if (titles[1]) draws.push(dt(titles[1], { size: 44, y: 124, color: "0xC5D4FF" }));
  if (titles[2]) draws.push(dt(titles[2], { size: 28, y: 196, bold: false, color: "0x9DB4FF" }));
  const script = await graph(`still-${path.basename(dest)}.txt`, parts.join("") + (draws.length ? "," + draws.join(",") : ""));
  await run(["-y", "-i", bg, "-i", fg, "-filter_complex_script", script, "-frames:v", "1", dest]);
}

function motionGraph(duration) {
  const t = Math.max(duration, 0.4).toFixed(3);
  return [
    `[0:v]crop=1080:1920:x='90+trunc(22*sin(2*PI*t/${t}))':y='130+trunc(12*sin(2*PI*t/${t}))',fps=30,format=yuv420p[bg];`,
    "[1:v]format=rgba,fade=t=in:st=0:d=0.32:alpha=1[fg];",
    "[bg][fg]overlay=x='(W-w)/2':y='236+trunc(36*(1-min(1\\,t/0.45)))',format=yuv420p,setsar=1[vout]",
  ].join("");
}

async function encodeClip(name, duration, bg, fg) {
  const out = path.join(WORK, `${name}.mp4`);
  const script = await graph(`${name}-motion.txt`, motionGraph(duration));
  await run([
    "-y",
    "-loop", "1", "-t", duration.toFixed(3), "-i", bg,
    "-loop", "1", "-t", duration.toFixed(3), "-i", fg,
    "-filter_complex_script", script,
    "-map", "[vout]",
    "-r", "30", "-t", duration.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17",
    out,
  ]);
  return out;
}

async function decorate(src, duration, titleFiles, labels, dest) {
  const draws = [
    "drawbox=x=390:y=186:w='min(300,max(8,t*420))':h=4:color=0x6B93FF:t=fill",
    dt(titleFiles[0], { size: 52, y: 58, start: 0.06 }),
    dt(titleFiles[1], { size: 44, y: 124, start: 0.12, color: "0xC5D4FF" }),
  ];
  for (const label of labels) {
    draws.push(dt(label.file, { size: 28, y: 204, bold: false, color: "0x9DB4FF", start: label.start, end: label.end }));
  }
  const script = await graph(`decor-${path.basename(dest)}.txt`, `[0:v]${draws.join(",")},setsar=1[vout]`);
  await run([
    "-y", "-i", src,
    "-filter_complex_script", script,
    "-map", "[vout]", "-r", "30", "-t", duration.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17",
    dest,
  ]);
  return dest;
}

async function joinClips(clips, each, total, out) {
  if (clips.length === 1) return clips[0];
  let chain = "";
  let last = "0:v";
  let offset = 0;
  for (let i = 1; i < clips.length; i++) {
    offset += each;
    const label = i === clips.length - 1 ? "vout" : "x" + i;
    chain += `[${last}][${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[${label}];`;
    last = label;
  }
  const script = await graph(`join-${path.basename(out)}.txt`, chain);
  await run([
    "-y", ...clips.flatMap((f) => ["-i", f]),
    "-filter_complex_script", script,
    "-map", "[vout]", "-r", "30", "-t", total.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17",
    out,
  ]);
  return out;
}

async function cierreClip(duration, bg, titleFiles) {
  const out = path.join(WORK, "cierre.mp4");
  const t = duration.toFixed(3);
  const script = await graph(
    "cierre.txt",
    [
      `[0:v]crop=1080:1920:x='90+20*sin(2*PI*t/${t})':y='140+12*sin(2*PI*t/${t})',fps=30,format=yuv420p[bg];`,
      "[1:v]scale=240:240,format=rgba,colorkey=0x000000:0.2:0.08,fade=t=in:st=0.05:d=0.35:alpha=1[logo];",
      "[bg][logo]overlay=(W-w)/2:560[base];",
      "[base]" + [
        dt(titleFiles[0], { size: 58, y: 860, start: 0.15 }),
        dt(titleFiles[1], { size: 48, y: 950, start: 0.28, color: "0x9DB4FF" }),
        "setsar=1",
      ].join(","),
    ].join(""),
  );
  await run([
    "-y",
    "-loop", "1", "-t", t, "-i", bg,
    "-loop", "1", "-t", t, "-i", LOGO,
    "-filter_complex_script", script,
    "-r", "30", "-t", t,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17",
    out,
  ]);
  return out;
}

async function main() {
  await rm(WORK, { recursive: true, force: true });
  await mkdir(WORK, { recursive: true });
  console.log("Armando capturas…");
  const prepared = await prepareSources();

  const plates = new Map();
  async function plateFor(src) {
    if (plates.has(src)) return plates.get(src);
    const fg = path.join(WORK, `fg-${plates.size}.png`);
    const bg = path.join(WORK, `bg-${plates.size}.png`);
    console.log("Marco", path.basename(src));
    await frameShot(src, fg);
    await blurPlate(src, bg);
    const pack = { fg, bg };
    plates.set(src, pack);
    return pack;
  }

  if (PREVIEW) {
    const dir = path.join(WORK, "stills");
    await mkdir(dir, { recursive: true });
    for (const scene of SCENES) {
      const t1 = await textFile(`${scene.id}-a.txt`, scene.title[0]);
      const t2 = await textFile(`${scene.id}-b.txt`, scene.title[1]);
      if (scene.id === "cierre") {
        const src = path.join(CAPTURES, "inicio.png");
        const { bg } = await plateFor(src);
        const dest = path.join(dir, "cierre.jpg");
        const script = await graph(
          "still-cierre.txt",
          "[0:v]crop=1080:1920:(iw-1080)/2:(ih-1920)/2,format=yuv420p[bg];[1:v]scale=240:240,format=rgba,colorkey=0x000000:0.2:0.08[logo];[bg][logo]overlay=(W-w)/2:560," +
            dt(t1, { size: 58, y: 860 }) + "," + dt(t2, { size: 48, y: 950, color: "0x9DB4FF" }),
        );
        await run(["-y", "-i", bg, "-i", LOGO, "-filter_complex_script", script, "-frames:v", "1", dest]);
        continue;
      }
      for (let i = 0; i < scene.shots.length; i++) {
        const shot = scene.shots[i];
        const src = shotSource(shot, prepared);
        const { fg, bg } = await plateFor(src);
        const label = shot.label ? await textFile(`${scene.id}-l${i}.txt`, shot.label) : "";
        await stillOf(bg, fg, [t1, t2, label], path.join(dir, `${scene.id}-${i}.jpg`));
      }
    }
    console.log("Stills en", path.join(WORK, "stills"));
    return;
  }

  console.log("Locución…");
  const cues = [];
  const pieces = [];
  let cursor = 0;
  for (let i = 0; i < SCENES.length; i++) {
    const file = path.join(WORK, `line-${i}.mp3`);
    const tts = new EdgeTTS({
      voice: "es-AR-TomasNeural",
      lang: "es-AR",
      rate: "-4%",
      pitch: "-1Hz",
      timeout: 30000,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    });
    await tts.ttsPromise(SCENES[i].voice, file);
    const dur = await probe(file);
    if (!dur) throw new Error("Sin audio en " + SCENES[i].id);
    cues.push({ ...SCENES[i], start: cursor, end: cursor + dur, dur });
    pieces.push({ file, dur });
    cursor += dur + (i < SCENES.length - 1 ? GAP : 0);
  }

  let hold = 0.8;
  if (cursor + hold < 22) hold = 22 - cursor;
  if (cursor + hold > 35) hold = Math.max(0.8, 35 - cursor);
  const total = cursor + hold;
  console.log("Voz hasta", cursor.toFixed(2), "video", total.toFixed(2));

  const srt = cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.voice}\n`).join("\n");
  await writeFile(path.join(OUT, "walqo-subtitulos-v2.srt"), srt, "utf8");

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
  const voiceWav = path.join(OUT, "walqo-voz-v2.wav");
  await run([
    "-y", "-f", "concat", "-safe", "0", "-i", path.join(WORK, "voice.txt"),
    "-af", `apad=pad_dur=${hold.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=9`,
    "-ar", "48000", "-ac", "2", voiceWav,
  ]);

  const sceneFiles = [];
  for (const cue of cues) {
    const sceneDur = cue.id === "cierre" ? cue.dur + hold : cue.dur + GAP;
    const t1 = await textFile(`${cue.id}-a.txt`, cue.title[0]);
    const t2 = await textFile(`${cue.id}-b.txt`, cue.title[1]);
    console.log("Escena", cue.id, sceneDur.toFixed(2));
    if (cue.id === "cierre") {
      const src = path.join(CAPTURES, "inicio.png");
      const { bg } = await plateFor(src);
      sceneFiles.push(await cierreClip(sceneDur, bg, [t1, t2]));
      continue;
    }
    const n = cue.shots.length;
    const each = sceneDur / n;
    const clips = [];
    for (let i = 0; i < n; i++) {
      const shot = cue.shots[i];
      const src = shotSource(shot, prepared);
      const { fg, bg } = await plateFor(src);
      const clipDur = each + (i < n - 1 ? FADE : 0);
      clips.push(await encodeClip(`${cue.id}-${i}`, clipDur, bg, fg));
    }
    const joined = await joinClips(clips, each, sceneDur, path.join(WORK, `${cue.id}-raw.mp4`));
    const labels = [];
    for (let i = 0; i < n; i++) {
      const shot = cue.shots[i];
      if (!shot.label) continue;
      labels.push({
        file: await textFile(`${cue.id}-l${i}.txt`, shot.label),
        start: i * each + 0.08,
        end: (i + 1) * each,
      });
    }
    sceneFiles.push(await decorate(joined, sceneDur, [t1, t2], labels, path.join(WORK, `${cue.id}.mp4`)));
  }

  const video = path.join(WORK, "video.mp4");
  const normalized = sceneFiles.map((_, i) => `[${i}:v]setsar=1[v${i}]`).join(";");
  const labels = sceneFiles.map((_, i) => `[v${i}]`).join("");
  const concatScript = await graph(
    "concat.txt",
    `${normalized};${labels}concat=n=${sceneFiles.length}:v=1:a=0,fade=t=in:st=0:d=0.2,fade=t=out:st=${(total - 0.35).toFixed(3)}:d=0.35,format=yuv420p,setsar=1[vout]`,
  );
  await run([
    "-y", ...sceneFiles.flatMap((f) => ["-i", f]),
    "-filter_complex_script", concatScript,
    "-map", "[vout]", "-r", "30", "-t", total.toFixed(3),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17",
    video,
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

  const finalFile = path.join(OUT, "walqo-reel-vertical-v2.mp4");
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
