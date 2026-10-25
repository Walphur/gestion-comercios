/**
 * Arma los Clips de Mercado Libre con los cuadros que deja record-videos.mjs.
 * Vertical 1080x1920, H.264 + AAC, 30 fps, música sintetizada acá mismo (sin derechos de terceros).
 *
 * Uso: node scripts/mercadolibre/make-clips.mjs [slug ...]
 * ffmpeg: FFMPEG_PATH, o ffmpeg-static instalado aparte (tests/results está en .gitignore):
 *   npm i ffmpeg-static --prefix tests/results/ffmpeg
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FRAMES_ROOT = path.resolve("tests/results/ml-clips-frames");
const OUT = path.resolve("marketing/mercadolibre/videos");
const DESKTOP = path.join(os.homedir(), "Desktop", "WalQo Mercado Libre", "videos");
const SHEETS = path.resolve("tests/results/clips");
const MAX_SECONDS = 55;
const MIN_SECONDS = 12;

const FFMPEG = process.env.FFMPEG_PATH
  || [path.resolve("tests/results/ffmpeg/node_modules/ffmpeg-static/ffmpeg.exe"), "ffmpeg"].find((p) => p === "ffmpeg" || fs.existsSync(p));

function ff(args) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg falló: " + args.join(" "));
}

/* ---------- música: pad + arpegio + bajo, en Do mayor, 120 bpm ---------- */

function writeMusic(file, seconds) {
  const rate = 44100;
  const n = Math.ceil(seconds * rate);
  const chords = [
    [261.63, 329.63, 392.0],
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
  ];
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const TAU = Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const bar = Math.floor(t / 2) % 4;
    const m = t % 2;
    const ch = chords[bar];
    const padEnv = (1 - Math.exp(-5 * m)) * (0.55 + 0.45 * Math.exp(-0.9 * m));
    let pad = 0;
    for (const f of ch) pad += Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2.003 * t);
    pad *= 0.045 * padEnv;
    const step = Math.floor(m / 0.25);
    const sm = m % 0.25;
    const order = [0, 1, 2, 1, 0, 2, 1, 2];
    const af = ch[order[step]] * 2;
    const pluck = 0.09 * Math.sin(TAU * af * t) * Math.exp(-9 * sm) * (1 - Math.exp(-200 * sm));
    const bass = 0.11 * Math.sin(TAU * (ch[0] / 2) * t) * Math.exp(-1.6 * (t % 0.5)) * (1 - Math.exp(-80 * (t % 0.5)));
    const kickT = t % 0.5;
    const kick = 0.18 * Math.sin(TAU * (50 + 90 * Math.exp(-30 * kickT)) * kickT) * Math.exp(-18 * kickT);
    left[i] = pad + pluck * 0.8 + bass + kick;
    right[i] = pad + pluck * 1.0 + bass + kick;
  }
  const d1 = Math.floor(0.19 * rate), d2 = Math.floor(0.27 * rate);
  for (let i = 0; i < n; i++) {
    if (i >= d1) left[i] += 0.28 * right[i - d1];
    if (i >= d2) right[i] += 0.28 * left[i - d2];
  }
  const fade = 1.5 * rate;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / (0.6 * rate), (n - i) / fade) * 0.7;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Math.tanh(left[i] * 1.2) * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Math.tanh(right[i] * 1.2) * g)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

/* ---------- armado ---------- */

function build(slug) {
  const dir = path.join(FRAMES_ROOT, slug);
  const tl = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
  const frames = tl.frames;
  if (!frames.length) throw new Error("sin cuadros: " + slug);
  const cuts = tl.cuts || [];
  const kept = (a, b) => cuts.reduce((ms, [c0, c1]) => ms - Math.max(0, Math.min(b, c1) - Math.max(a, c0)), b - a);
  const lines = [];
  let raw = 0;
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].t : tl.end;
    const ms = kept(frames[i].t, next);
    if (ms < 1) continue;
    const dur = ms / 1000;
    raw += dur;
    lines.push(`file '${path.join(dir, frames[i].file).replace(/\\/g, "/")}'`, `duration ${dur.toFixed(4)}`);
  }
  lines.push(lines.at(-2));
  const list = path.join(dir, "list.txt");
  fs.writeFileSync(list, lines.join("\n"));

  const speed = raw > MAX_SECONDS ? raw / MAX_SECONDS : 1;
  const final = raw / speed;
  if (final < MIN_SECONDS) throw new Error(`${slug}: ${final.toFixed(1)} s es muy corto`);

  const music = path.join(dir, "music.wav");
  writeMusic(music, final + 0.5);

  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `${slug}.mp4`);
  const vf = [
    speed > 1 ? `setpts=PTS/${speed.toFixed(4)}` : null,
    "fps=30",
    "scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos",
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=white",
    "format=yuv420p",
  ].filter(Boolean).join(",");
  ff([
    "-f", "concat", "-safe", "0", "-i", list, "-i", music,
    "-vf", vf, "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-profile:v", "high", "-level", "4.1",
    "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
    "-t", final.toFixed(2), "-movflags", "+faststart", out,
  ]);

  fs.mkdirSync(DESKTOP, { recursive: true });
  fs.copyFileSync(out, path.join(DESKTOP, `${slug}.mp4`));

  fs.mkdirSync(SHEETS, { recursive: true });
  const every = Math.max(2, final / 12);
  ff(["-i", out, "-vf", `fps=1/${every.toFixed(2)},scale=270:-1,tile=6x2:padding=6:color=gray`, "-frames:v", "1", path.join(SHEETS, `${slug}-hoja.jpg`)]);
  ff(["-ss", (final * 0.35).toFixed(2), "-i", out, "-frames:v", "1", "-q:v", "3", path.join(SHEETS, `${slug}-cuadro.jpg`)]);

  const mb = fs.statSync(out).size / 1e6;
  console.log(`${slug}.mp4  ${final.toFixed(1)} s  ${mb.toFixed(1)} MB${speed > 1 ? `  (x${speed.toFixed(2)})` : ""}`);
}

const slugs = process.argv.slice(2);
const list = slugs.length ? slugs : fs.readdirSync(FRAMES_ROOT).filter((d) => fs.existsSync(path.join(FRAMES_ROOT, d, "timeline.json")));
for (const s of list) {
  try { build(s); } catch (e) { console.log("ERROR", s, e.message); }
}
