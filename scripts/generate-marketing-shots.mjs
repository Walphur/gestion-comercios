#!/usr/bin/env node
/**
 * Genera capturas PNG de marketing desde los HTML mock.
 * Uso: node scripts/generate-marketing-shots.mjs
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const marketing = path.join(root, "docs", "marketing");

const jobs = [
  { html: "mock/pos.html", out: "shots/pos.png", width: 1440, height: 900, selector: ".mock-window" },
  { html: "mock/productos.html", out: "shots/productos.png", width: 1440, height: 900, selector: ".mock-window" },
  { html: "mock/stock.html", out: "shots/stock.png", width: 1440, height: 900, selector: ".mock-window" },
  { html: "portada-redes.html", out: "shots/portada-redes.png", width: 1080, height: 1080, selector: "#capture" },
  { html: "portada-mercadolibre.html", out: "shots/portada-ml.png", width: 1200, height: 1200, selector: "#capture" },
  { html: "logo-lockup.html", out: "branding/walqo-promo-lockup.png", width: 900, height: 420, selector: "#capture" },
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });

  for (const job of jobs) {
    const htmlPath = path.join(marketing, job.html);
    const outPath = path.join(marketing, job.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    await page.setViewportSize({ width: job.width, height: job.height });
    await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);

    const el = page.locator(job.selector);
    await el.screenshot({ path: outPath, type: "png" });
    console.log(`✓ ${job.out}`);
  }

  // Copia logo limpio a la raíz (reemplaza walqo completo.png mal exportado)
  const promoLogo = path.join(marketing, "branding", "walqo-promo-lockup.png");
  const rootLogo = path.join(root, "walqo completo.png");
  if (fs.existsSync(promoLogo)) {
    fs.copyFileSync(promoLogo, rootLogo);
    console.log("✓ walqo completo.png (actualizado)");
  }

  await browser.close();
  console.log("\nListo. Imágenes en docs/marketing/shots/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
