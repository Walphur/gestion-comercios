/**
 * Capturas de la pantalla de ARCA para el video tutorial (tests/results/arca-video/).
 *
 * Requiere la app e2e abierta con depuración remota en el 9222 (ver scripts/mercadolibre/record-videos.mjs).
 * Resetea la base de esa instancia. El pedido de prueba que se guarda en Descargas se borra al final.
 *
 * Uso: node scripts/tutoriales/arca-capturas.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ORIGIN = process.env.WALQO_ORIGIN || "http://localhost:1420";
const CDP = process.env.WALQO_CDP || "http://127.0.0.1:9222";
const OUT = path.resolve("tests/results/arca-video");
const VIEW = { width: 1440, height: 900, deviceScaleFactor: 1.3334, mobile: false };
const CUIT = "20304050607";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP(CDP);
const context = browser.contexts()[0];
let page;

async function livePage() {
  for (let i = 0; i < 120; i++) {
    const p = context.pages().find((x) => x.url().startsWith(ORIGIN) && !x.url().startsWith("blob:"));
    if (p && !p.isClosed()) {
      p.setDefaultTimeout(10000);
      return p;
    }
    await sleep(500);
  }
  throw new Error(`sin página de la app en ${CDP}`);
}
async function bridge() {
  await page.waitForFunction(() => !!window.__GESTION_E2E__, undefined, { timeout: 90_000 });
}
async function invoke(cmd, a = {}) {
  await bridge();
  return page.evaluate(({ cmd, a }) => window.__GESTION_E2E__.invoke(cmd, a), { cmd, a });
}
async function reload() {
  await page.goto(`${ORIGIN}/?s=${Date.now()}#/login`).catch(() => {});
  page = await livePage();
  await bridge();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", VIEW);
}

/** Marca un elemento con un aro azul para la captura. */
async function mark(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.evaluate((el) => {
    el.dataset.arcaMark = "1";
    el.style.outline = "4px solid #2f6bff";
    el.style.outlineOffset = "4px";
    el.style.borderRadius = el.style.borderRadius || "12px";
    el.style.boxShadow = "0 0 0 10px rgba(47,107,255,.18)";
  });
}
async function unmark() {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-arca-mark]")) {
      el.style.outline = "";
      el.style.boxShadow = "";
      delete el.dataset.arcaMark;
    }
  });
}
async function shot(name, locatorToCenter) {
  if (locatorToCenter) {
    await locatorToCenter.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await sleep(400);
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("OK", name);
}

page = await livePage();
await reload();
await sleep(8000);
await page.evaluate(async () => { await window.__GESTION_E2E__.warmDb(); });
await invoke("e2e_ensure_baseline_template");
await page.evaluate(async () => { await window.__GESTION_E2E__.closeDb(); window.__GESTION_E2E__.clearStorage(); });
await invoke("e2e_reset_environment");
await reload();
await page.evaluate(async () => {
  const s = await import("/src/db/settings.ts");
  await s.setSetting("rubro", "kiosco");
  await s.setSetting("business_name", "Almacén La Esquina");
  await s.setSetting("mp_promo_dismissed", "1");
});
await reload();

await page.locator("#login-pin").waitFor({ timeout: 60_000 });
await page.getByRole("button", { name: /Administrador/i }).first().click();
await page.locator("#login-pin").fill("1234");
await page.getByRole("button", { name: "Entrar" }).click();
await page.getByRole("complementary").waitFor({ timeout: 30_000 }).catch(() => {});
await sleep(1500);

await page.evaluate(() => { location.hash = "/admin?section=arca"; });
await sleep(2500);
await page.addStyleTag({ content: ".guide-thumb{display:none!important}" });
await page.evaluate(() => {
  const root = document.getElementById("root");
  const banners = [...root.querySelectorAll("div, section, aside")].filter((el) => {
    const t = el.textContent || "";
    return t.includes("Hay una versión nueva") && t.length < 220;
  });
  if (banners.length) banners[banners.length - 1].style.display = "none";
  for (const el of root.querySelectorAll("a, button")) {
    if (/^\s*Actualizar v\d/.test(el.textContent || "")) el.style.display = "none";
  }
});
const hide = page.getByRole("button", { name: "Ocultar los primeros pasos" });
if (await hide.isVisible().catch(() => false)) await hide.click();

const main = page.getByRole("main");
await main.evaluate((el) => el.scrollTo(0, 0)).catch(() => {});
await sleep(500);
await shot("01-pantalla-arca");

const cuit = page.getByPlaceholder("20304050607");
await cuit.fill(CUIT);
await mark(cuit);
await shot("02-cuit", cuit);
await unmark();

const generar = page.getByRole("button", { name: "Generar pedido de certificado" });
await mark(generar);
await shot("03-boton-generar", generar);
await unmark();

await generar.click();
const listo = page.getByText(/Guardado en Descargas/);
await listo.waitFor({ timeout: 120_000 });
await sleep(800);
await mark(listo);
await shot("04-pedido-guardado", listo);
await unmark();

const pv = page.getByPlaceholder("1", { exact: true });
await pv.fill("2");
await page.getByRole("button", { name: "Producción" }).first().click().catch(() => {});
await mark(pv);
await shot("05-punto-de-venta", pv);
await unmark();

const elegirCert = page.getByText("Certificado (.crt / .pem)").locator("xpath=ancestor::div[contains(@class,'justify-between')][1]");
await mark(elegirCert);
await shot("06-subir-certificado", elegirCert);
await unmark();

const guardar = page.getByRole("button", { name: "Guardar configuración" });
await mark(guardar);
await shot("07-guardar-y-probar", guardar);
await unmark();

const probar = page.getByRole("button", { name: "Probar conexión" });
await mark(probar);
await shot("08-probar-conexion", probar);
await unmark();

const descargas = path.join(os.homedir(), "Downloads", `pedido-certificado-arca-${CUIT}.csr`);
if (fs.existsSync(descargas)) {
  fs.copyFileSync(descargas, path.join(OUT, path.basename(descargas)));
  fs.rmSync(descargas);
}
await browser.close();
