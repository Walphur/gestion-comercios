import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOCS = path.join(ROOT, "docs");
const OUT = path.join(DOCS, "marketing", "og", "walqo-og.jpg");
const file = (p) => pathToFileURL(path.join(DOCS, p)).href;

const html = `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=block" />
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; }
  body {
    position: relative;
    overflow: hidden;
    font-family: Satoshi, "Segoe UI", system-ui, sans-serif;
    color: #f4f6fb;
    background:
      radial-gradient(600px 340px at 18% 8%, rgba(47,107,255,0.35), transparent 70%),
      radial-gradient(560px 360px at 88% 20%, rgba(138,77,255,0.28), transparent 70%),
      #05060a;
  }
  .content {
    position: absolute;
    inset: 0 0 auto 0;
    padding-top: 54px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand img { width: 64px; height: 64px; }
  .brand span { font-size: 52px; font-weight: 900; letter-spacing: -0.02em; }
  .brand b { color: #4b86ff; font-weight: 900; }
  h1 {
    margin-top: 26px;
    font-size: 60px;
    line-height: 1.05;
    font-weight: 900;
    letter-spacing: -0.025em;
  }
  h1 em { font-style: normal; color: #7eb0ff; }
  p { margin-top: 16px; font-size: 27px; color: #b4bccc; font-weight: 500; }
  .pills { margin-top: 26px; display: flex; gap: 12px; }
  .pill {
    padding: 10px 20px;
    border-radius: 999px;
    font-size: 22px;
    font-weight: 700;
    border: 1px solid rgba(255,255,255,0.16);
    background: rgba(255,255,255,0.06);
    color: #dfe5f2;
  }
  .pill.main { background: #2f6bff; border-color: #2f6bff; color: #fff; }
  .shot {
    position: absolute;
    left: 50%;
    top: 404px;
    width: 940px;
    transform: translateX(-50%);
    border-radius: 18px 18px 0 0;
    border: 1px solid rgba(255,255,255,0.14);
    border-bottom: 0;
    box-shadow: 0 -10px 60px rgba(47,107,255,0.25);
    overflow: hidden;
  }
  .shot img { display: block; width: 100%; }
  .fade {
    position: absolute;
    inset: auto 0 0 0;
    height: 120px;
    background: linear-gradient(transparent, #05060a);
  }
</style>
</head>
<body>
  <div class="content">
    <div class="brand"><img src="${file("branding/walqo-mark.png")}" alt="" /><span>Wal<b>Q</b>o</span></div>
    <h1>Punto de venta <em>para tu comercio</em></h1>
    <p>Ventas, stock y caja en la PC del local. Funciona sin internet.</p>
    <div class="pills">
      <span class="pill main">Probalo gratis</span>
      <span class="pill">Windows 10 y 11</span>
      <span class="pill">walqo.pro</span>
    </div>
  </div>
  <div class="shot"><img src="${file("marketing/shots/pos.png")}" alt="" /></div>
  <div class="fade"></div>
</body>
</html>`;

const dir = await mkdtemp(path.join(tmpdir(), "walqo-og-"));
const page_path = path.join(dir, "og.html");
await writeFile(page_path, html, "utf8");

const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(page_path).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, type: "jpeg", quality: 88 });
  console.log(`OK ${path.relative(ROOT, OUT)}`);
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
