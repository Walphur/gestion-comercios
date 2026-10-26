/**
 * Graba la app real (instancia e2e aislada) en vertical para los Clips de Mercado Libre.
 *
 * Requiere la app e2e abierta con depuración remota en el puerto 9222:
 *   $env:GESTION_E2E="1"; $env:GESTION_LICENSE_DEV="1"
 *   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
 *   $env:CARGO_TARGET_DIR="src-tauri\target"
 *   npm run tauri dev -- --no-watch --config src-tauri/tauri.conf.e2e.json
 *
 * Otra instancia en paralelo: WALQO_CDP=http://127.0.0.1:9233 WALQO_ORIGIN=http://localhost:1431
 * (build con otro identifier, porque la app usa single-instance).
 *
 * Uso: node scripts/mercadolibre/record-videos.mjs [slug ...] [--probe]
 * Deja los cuadros en %TEMP%/walqo-ml-clips/<slug>/ (frames + timeline.json).
 * Después: node scripts/mercadolibre/make-clips.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ORIGIN = process.env.WALQO_ORIGIN || "http://localhost:1420";
const CDP = process.env.WALQO_CDP || "http://127.0.0.1:9222";
const OUT_ROOT = path.resolve("tests/results/ml-clips-frames");
const VIEW = { width: 900, height: 1600, deviceScaleFactor: 1.2, mobile: false };
const args = process.argv.slice(2);
const PROBE = args.includes("--probe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.connectOverCDP(CDP);
const context = browser.contexts()[0];
let page;
let emuSession;
let rec = null;

function pick() {
  return context.pages().find((p) => p.url().startsWith(ORIGIN) && !p.url().startsWith("blob:"));
}
async function livePage() {
  for (let i = 0; i < 120; i++) {
    const p = pick();
    if (p && !p.isClosed()) {
      p.setDefaultTimeout(8000);
      return p;
    }
    await sleep(500);
  }
  throw new Error(`sin página de la app en ${CDP}`);
}
async function bridge() {
  await page.waitForFunction(() => !!window.__GESTION_E2E__, undefined, { timeout: 60_000 });
}
async function invoke(cmd, a = {}) {
  await bridge();
  return page.evaluate(({ cmd, a }) => window.__GESTION_E2E__.invoke(cmd, a), { cmd, a });
}
async function emulate() {
  if (!emuSession) emuSession = await context.newCDPSession(page);
  await emuSession.send("Emulation.setDeviceMetricsOverride", VIEW);
}
async function reload() {
  await page.goto(`${ORIGIN}/?s=${Date.now()}#/login`).catch(() => {});
  page = await livePage();
  await bridge();
  await emulate();
}
async function login() {
  await page.locator("#login-pin").waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /Administrador/i }).first().click();
  await page.locator("#login-pin").fill("1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("complementary").waitFor({ timeout: 30_000 }).catch(() => {});
  await sleep(1500);
}
async function go(hash, wait = 1600) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await sleep(wait);
  await cleanup();
}
async function seed(fn, arg) {
  await page.evaluate(fn, arg);
}

/* ---------- prolijidad de pantalla ---------- */

async function cleanup() {
  const hide = page.getByRole("button", { name: "Ocultar los primeros pasos" });
  if (await hide.isVisible().catch(() => false)) {
    await hide.click().catch(() => {});
    await sleep(300);
  }
  const mp = page.getByRole("button", { name: "No mostrar más" });
  if (await mp.first().isVisible().catch(() => false)) {
    await mp.first().click().catch(() => {});
    await sleep(300);
  }
  await page.evaluate(() => {
    const hideUpdate = () => {
      const root = document.getElementById("root");
      if (!root) return;
      root.style.display = "";
      const matches = [...root.querySelectorAll("div, section, aside")].filter((el) => {
        const t = el.textContent || "";
        return t.includes("Hay una versión nueva") && t.includes("Descargar instalador") && t.length < 200;
      });
      if (matches.length) matches[matches.length - 1].style.display = "none";
      for (const el of root.querySelectorAll("a, button")) {
        if (/^\s*Actualizar v\d/.test(el.textContent || "")) el.style.display = "none";
      }
    };
    hideUpdate();
    if (!window.__mlHideUpdate) window.__mlHideUpdate = setInterval(hideUpdate, 250);
    // El diálogo nativo de impresión (comanda, ticket) congela la página mientras se graba.
    if (!window.__mlNoPrint) {
      window.__mlNoPrint = true;
      window.print = () => {};
      const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
      Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
        configurable: true,
        get() {
          const w = desc.get.call(this);
          try { if (w) w.print = () => {}; } catch { /* otro origen */ }
          return w;
        },
      });
    }
  }).catch(() => {});
}

async function caption(text) {
  if (process.env.ML_INSPECT && text) console.log("CAPTION", text);
  await page.evaluate((t) => {
    let el = document.getElementById("__ml_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__ml_caption";
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "13%", transform: "translateX(-50%)",
        zIndex: "2147483647", background: "rgba(15,23,42,.9)", color: "#fff",
        font: "700 27px/1.25 'Segoe UI', system-ui, sans-serif", padding: "14px 24px",
        borderRadius: "18px", maxWidth: "80%", width: "max-content", textAlign: "center",
        pointerEvents: "none", boxShadow: "0 10px 30px rgba(0,0,0,.28)", transition: "opacity .3s",
      });
      document.body.appendChild(el);
    }
    el.textContent = t || "";
    el.style.opacity = t ? "1" : "0";
  }, text).catch(() => {});
}

async function ripple(loc) {
  const b = await loc.boundingBox().catch(() => null);
  if (!b) return;
  await page.evaluate(({ x, y }) => {
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "fixed", left: `${x - 24}px`, top: `${y - 24}px`, width: "48px", height: "48px",
      borderRadius: "50%", background: "rgba(37,99,235,.28)", border: "3px solid rgba(37,99,235,.85)",
      zIndex: "2147483646", pointerEvents: "none", transition: "transform .5s ease-out, opacity .5s ease-out",
    });
    document.body.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = "scale(1.7)"; d.style.opacity = "0"; }));
    setTimeout(() => d.remove(), 700);
  }, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
  await sleep(280);
}

/** El viewport emulado es más alto que la ventana real: click() no logra scrollear hasta abajo. */
async function tap(loc) {
  await loc.waitFor({ state: "visible", timeout: 6000 });
  await ripple(loc);
  await loc.dispatchEvent("click");
}

async function typeSlow(loc, text, delay = 55) {
  await loc.focus({ timeout: 6000 }).catch(() => {});
  // fill("") sobre un campo vacío manda Supr, y en la caja Supr quita el último producto.
  if (await loc.inputValue().catch(() => "")) await loc.fill("");
  await loc.pressSequentially(text, { delay });
}

/* ---------- screencast ---------- */

class Recorder {
  constructor(slug) {
    this.dir = path.join(OUT_ROOT, slug);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.frames = [];
    this.cuts = [];
  }
  /** Saca del video la espera (p. ej. mientras se guarda la venta) sin tocar la app. */
  cutStart() {
    this.cutFrom = Date.now();
  }
  cutEnd() {
    if (this.cutFrom && Date.now() - this.cutFrom > 400) this.cuts.push([this.cutFrom, Date.now() - 250]);
    this.cutFrom = null;
  }
  async start() {
    this.cdp = await context.newCDPSession(page);
    this.cdp.on("Page.screencastFrame", (f) => {
      const file = `${String(this.frames.length).padStart(5, "0")}.jpg`;
      fs.writeFileSync(path.join(this.dir, file), Buffer.from(f.data, "base64"));
      this.frames.push({ file, t: Date.now() });
      this.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
    this.t0 = Date.now();
  }
  async stop() {
    const end = Date.now();
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    await this.cdp.detach().catch(() => {});
    fs.writeFileSync(path.join(this.dir, "timeline.json"), JSON.stringify({ t0: this.t0, end, cuts: this.cuts, frames: this.frames }, null, 1));
    console.log(`grabado ${path.basename(this.dir)}: ${this.frames.length} cuadros, ${((end - this.t0) / 1000).toFixed(1)} s`);
  }
}

/* ---------- datos inventados por rubro (corren dentro de la app) ---------- */

function ean13(body12) {
  const d = body12.split("").map(Number);
  const sum = d.reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0);
  return body12 + ((10 - (sum % 10)) % 10);
}
const scaleCode = (plu, grams) => ean13("20" + String(plu).padStart(5, "0") + String(grams).padStart(5, "0"));

const COMMON = async ({ rubro, name }) => {
  const settings = await import("/src/db/settings.ts");
  await settings.setSetting("rubro", rubro);
  await settings.setSetting("business_name", name);
  await settings.setSetting("pro_plan_enabled", "1");
  await settings.setSetting("scale_barcode_prefix", "20");
  await settings.setSetting("scale_barcode_mode", "weight");
  await settings.setSetting("mp_promo_dismissed", "1");
  const { getDb } = await import("/src/db/index.ts");
  const db = await getDb();
  for (const sql of ["DELETE FROM expenses", "DELETE FROM recurring_expenses", "UPDATE workshop_resources SET active = 0", "DELETE FROM appointments"]) {
    try { await db.execute(sql); } catch (e) { console.warn(sql, e); }
  }
};

const SEED_RETAIL = async ({ products, customers }) => {
  const cats = await import("/src/db/categories.ts");
  const prods = await import("/src/db/products.ts");
  const custs = await import("/src/db/customers.ts");
  const catIds = {};
  for (const [cat, name, barcode, cost, price, stock, min, unit, plu] of products) {
    if (!(cat in catIds)) catIds[cat] = await cats.createCategory(cat);
    await prods.createProduct({ name, barcode, cost, price, stock, min_stock: min, unit, tax_rate: 21, category_id: catIds[cat], scale_plu: plu ?? null });
  }
  for (const [name, debt] of customers) await custs.createCustomer({ name, credit_limit: 0, initial_debt: debt });
};

const KIOSCO_PRODUCTS = [
  ["Bebidas", "Coca-Cola 2.25 L", "7790895000782", 3000, 4200, 18, 6, "unidad"],
  ["Bebidas", "Coca-Cola 500 ml", "7790895000430", 1250, 1900, 30, 10, "unidad"],
  ["Bebidas", "Agua mineral 2 L", "7798062540017", 1400, 2100, 4, 6, "unidad"],
  ["Bebidas", "Cerveza Quilmes 1 L", "7792798007387", 2300, 3300, 24, 12, "unidad"],
  ["Golosinas", "Alfajor Guaymallén", "7790380022725", 420, 700, 40, 15, "unidad"],
  ["Golosinas", "Alfajor Jorgito", "7790060023455", 700, 1100, 9, 12, "unidad"],
  ["Golosinas", "Papas fritas 85 g", "7790310981245", 2200, 3200, 12, 6, "unidad"],
  ["Almacén", "Yerba Playadito 1 kg", "7790387000216", 4300, 5900, 14, 6, "unidad"],
  ["Almacén", "Fideos Matarazzo 500 g", "7790070318237", 1200, 1800, 22, 10, "unidad"],
  ["Almacén", "Leche La Serenísima 1 L", "7790742656018", 1150, 1650, 20, 12, "unidad"],
  ["Almacén", "Azúcar Ledesma 1 kg", "7792540250450", 1050, 1500, 18, 8, "unidad"],
  ["Almacén", "Pan lactal", "7790040613706", 2200, 3100, 2, 4, "unidad"],
  ["Fiambrería", "Jamón cocido", null, 9000, 14000, 6, 2, "kg", "11"],
  ["Fiambrería", "Queso de máquina", null, 8000, 12500, 5, 2, "kg", "12"],
  ["Carnicería", "Asado", null, 8200, 11900, 24, 8, "kg", "1"],
  ["Carnicería", "Carne picada común", null, 5200, 7900, 15, 5, "kg", "4"],
  ["Carnicería", "Pollo entero", null, 2600, 3900, 20, 6, "kg", "6"],
];
const FIADO = [["Marta Gómez", 18500], ["Carlos Ruiz", 7200], ["Luis (edificio de enfrente)", 32400], ["Graciela Funes", 0]];

const RETAIL = {
  supermercado: {
    rubro: "supermercado", name: "Súper Don Pedro",
    products: [
      ...KIOSCO_PRODUCTS,
      ["Limpieza", "Lavandina 1 L", "7790520011025", 900, 1400, 30, 10, "unidad"],
      ["Limpieza", "Detergente 750 ml", "7791290012345", 1500, 2300, 3, 8, "unidad"],
      ["Limpieza", "Papel higiénico x4", "7790250012340", 2400, 3600, 18, 8, "unidad"],
      ["Lácteos", "Yogur bebible 1 L", "7790742012345", 1800, 2700, 2, 6, "unidad"],
      ["Lácteos", "Manteca 200 g", "7790742054321", 2100, 3100, 10, 4, "unidad"],
      ["Verdulería", "Papa", null, 600, 1100, 80, 20, "kg", "21"],
      ["Verdulería", "Tomate", null, 1500, 2600, 25, 10, "kg", "22"],
    ],
    customers: FIADO,
  },
  verduleria: {
    rubro: "verduleria", name: "Verdulería Los Andes",
    products: [
      ["Verduras", "Tomate redondo", null, 1500, 2600, 40, 10, "kg", "1"],
      ["Verduras", "Papa negra", null, 600, 1100, 120, 30, "kg", "2"],
      ["Verduras", "Cebolla", null, 700, 1300, 60, 15, "kg", "3"],
      ["Verduras", "Zapallo anco", null, 800, 1500, 30, 8, "kg", "4"],
      ["Verduras", "Zanahoria", null, 700, 1200, 25, 8, "kg", "5"],
      ["Frutas", "Banana", null, 1300, 2200, 35, 10, "kg", "6"],
      ["Frutas", "Manzana roja", null, 1600, 2800, 28, 10, "kg", "7"],
      ["Frutas", "Naranja para jugo", null, 700, 1300, 50, 15, "kg", "8"],
      ["Frutas", "Frutilla", null, 4000, 6500, 4, 5, "kg", "9"],
      ["Hojas", "Lechuga criolla", "2000100000017", 900, 1500, 20, 6, "unidad"],
      ["Hojas", "Atado de acelga", "2000100000024", 800, 1400, 3, 6, "unidad"],
      ["Almacén", "Huevos maple x30", "2000100000031", 6500, 8900, 12, 4, "unidad"],
    ],
    customers: [["Doña Rosa", 9600], ["Comedor Los Peques", 21500], ["Jorge Paz", 0]],
  },
  "pet-shop": {
    rubro: "petshop", name: "Pet Shop Huellitas",
    products: [
      ["Alimento perro", "Alimento perro adulto 15 kg", "7798114000017", 38000, 52000, 8, 3, "unidad"],
      ["Alimento perro", "Alimento cachorro 3 kg", "7798114000024", 11000, 15500, 2, 4, "unidad"],
      ["Alimento perro", "Alimento perro suelto", null, 2600, 3900, 45, 10, "kg", "1"],
      ["Alimento gato", "Alimento gato adulto 7.5 kg", "7798114000031", 26000, 36000, 6, 3, "unidad"],
      ["Alimento gato", "Alimento gato suelto", null, 3400, 5200, 30, 8, "kg", "2"],
      ["Higiene", "Piedras sanitarias 4 kg", "7798114000048", 3500, 5400, 14, 5, "unidad"],
      ["Higiene", "Pipeta antipulgas mediana", "7798114000055", 5200, 8200, 10, 4, "unidad"],
      ["Accesorios", "Collar regulable", "7798114000062", 2500, 4900, 12, 4, "unidad"],
      ["Accesorios", "Pelota de goma", "7798114000079", 1100, 2400, 20, 5, "unidad"],
      ["Accesorios", "Cama mediana", "7798114000086", 15000, 26000, 3, 2, "unidad"],
    ],
    customers: [["Romina Suárez", 12300], ["Veterinaria del Centro", 46000], ["Pablo Díaz", 0]],
  },
  ferreteria: {
    rubro: "ferreteria", name: "Ferretería El Tornillo",
    products: [
      ["Tornillería", "Tornillo autoperforante 8x1\" (x100)", "7791234000011", 3800, 6200, 25, 8, "unidad"],
      ["Tornillería", "Tarugo Fischer 8 mm (x50)", "7791234000028", 2200, 3900, 30, 10, "unidad"],
      ["Tornillería", "Clavos 2\" por kilo", null, 3000, 4800, 18, 5, "kg", "1"],
      ["Electricidad", "Cable unipolar 2.5 mm (rollo 100 m)", "7791234000035", 42000, 61000, 6, 2, "unidad"],
      ["Electricidad", "Cinta aisladora", "7791234000042", 600, 1200, 40, 10, "unidad"],
      ["Electricidad", "Lámpara LED 12 W", "7791234000059", 1400, 2600, 3, 10, "unidad"],
      ["Pinturería", "Látex interior 4 L", "7791234000066", 17000, 26500, 9, 3, "unidad"],
      ["Pinturería", "Rodillo antigota 22 cm", "7791234000073", 3200, 5600, 7, 3, "unidad"],
      ["Herramientas", "Taladro percutor 650 W", "7791234000080", 48000, 72000, 4, 2, "unidad"],
      ["Herramientas", "Cinta métrica 5 m", "7791234000097", 3000, 5200, 2, 4, "unidad"],
      ["Plomería", "Teflón 3/4\"", "7791234000103", 450, 900, 50, 10, "unidad"],
    ],
    customers: [["Constructora Norte", 128000], ["Raúl (plomero)", 23500], ["Mónica Ibáñez", 0]],
  },
  "ropa-indumentaria": {
    rubro: "ropa", name: "Tienda Alma",
    products: [
      ["Remeras", "Remera básica negra M", "7790000100011", 6000, 14900, 12, 4, "unidad"],
      ["Remeras", "Remera básica blanca L", "7790000100028", 6000, 14900, 9, 4, "unidad"],
      ["Remeras", "Remera oversize gris M", "7790000100035", 7500, 18900, 3, 4, "unidad"],
      ["Pantalones", "Jean mom celeste 38", "7790000100042", 16000, 39900, 6, 2, "unidad"],
      ["Pantalones", "Jean recto azul 42", "7790000100059", 17000, 42900, 4, 2, "unidad"],
      ["Pantalones", "Jogger frisa negro S", "7790000100066", 11000, 27900, 8, 3, "unidad"],
      ["Abrigos", "Buzo canguro beige L", "7790000100073", 15000, 36900, 5, 2, "unidad"],
      ["Abrigos", "Campera rompeviento M", "7790000100080", 24000, 58900, 2, 2, "unidad"],
      ["Accesorios", "Medias pack x3", "7790000100097", 2500, 6900, 20, 6, "unidad"],
      ["Accesorios", "Gorra lisa", "7790000100103", 4000, 11900, 7, 3, "unidad"],
    ],
    customers: [["Camila Rossi", 39900], ["Lucas Fernández", 0], ["Brenda Molina", 14900]],
  },
  "general-permanente": {
    rubro: "general", name: "Comercio Central",
    products: [
      ...KIOSCO_PRODUCTS.filter((p) => p[7] === "unidad"),
      ["Librería", "Cuaderno A4 rayado", "7791111000014", 2500, 4200, 15, 5, "unidad"],
      ["Librería", "Birome azul", "7791111000021", 300, 700, 60, 20, "unidad"],
      ["Regalería", "Taza cerámica", "7791111000038", 3000, 6500, 6, 2, "unidad"],
      ["Bazar", "Pilas AA x4", "7791111000045", 2400, 4500, 3, 6, "unidad"],
    ],
    customers: FIADO,
  },
};

async function seedKiosco() {
  await seed(COMMON, { rubro: "kiosco", name: "Almacén La Esquina" });
  await seed(SEED_RETAIL, { products: KIOSCO_PRODUCTS, customers: FIADO });
}
function seedRetail(slug) {
  const cfg = RETAIL[slug];
  return async () => {
    await seed(COMMON, { rubro: cfg.rubro, name: cfg.name });
    await seed(SEED_RETAIL, { products: cfg.products, customers: cfg.customers });
  };
}

async function seedEstetica() {
  await seed(COMMON, { rubro: "estetica", name: "Estudio Lu" });
  await seed(async () => {
    const demo = await import("/src/db/demo.ts");
    await demo.seedDemoCatalog("estetica");
    const res = await import("/src/db/workshopResources.ts");
    const custs = await import("/src/db/customers.ts");
    const { getDb } = await import("/src/db/index.ts");
    const pros = {};
    for (const [n, s, p] of [["Lucía", 40, 10], ["Caro", 35, 10], ["Nico", 40, 15]]) {
      pros[n] = await res.createWorkshopResource({ name: n, commission_service_pct: s, commission_product_pct: p });
    }
    const people = ["Sofía Herrera", "Julieta Paz", "Martín Ledesma", "Valentina Ruiz", "Tomás Acosta", "Camila Ortiz", "Agustina Vera"];
    const ids = [];
    for (const n of people) ids.push(await custs.createCustomer({ name: n, credit_limit: 0 }));
    const db = await getDb();
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rows = [
      ["09:00", "09:45", "Corte y barba", "Nico", 2, "completed"],
      ["09:30", "11:00", "Coloración", "Lucía", 0, "in_progress"],
      ["10:00", "10:30", "Corte de pelo", "Caro", 1, "confirmed"],
      ["11:00", "11:30", "Lavado y peinado", "Caro", 3, "confirmed"],
      ["11:30", "12:00", "Corte de pelo", "Lucía", 5, "confirmed"],
      ["12:00", "12:30", "Corte y barba", "Nico", 4, "scheduled"],
      ["15:00", "15:45", "Corte y barba", "Nico", 6, "scheduled"],
      ["16:00", "17:30", "Coloración", "Lucía", 1, "scheduled"],
      ["16:30", "17:00", "Corte de pelo", "Caro", 0, "scheduled"],
    ];
    for (const [a, b, title, pro, c, st] of rows) {
      await db.execute(
        `INSERT INTO appointments (customer_id, title, resource_id, resource_name, starts_at, ends_at, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ids[c], title, pros[pro], pro, `${ymd} ${a}:00`, `${ymd} ${b}:00`, st],
      );
    }
  });
}

async function seedClinica() {
  await seed(COMMON, { rubro: "clinica", name: "Consultorio Sonrisas" });
  await seed(async () => {
    const prods = await import("/src/db/products.ts");
    const cats = await import("/src/db/categories.ts");
    const res = await import("/src/db/workshopResources.ts");
    const custs = await import("/src/db/customers.ts");
    const { getDb } = await import("/src/db/index.ts");
    const cat = await cats.createCategory("Odontología");
    const dra = await res.createWorkshopResource({ name: "Dra. Paula Ríos" });
    const dr = await res.createWorkshopResource({ name: "Dr. Martín Sosa" });
    const services = [
      ["Consulta odontológica", 25000, 30, [dra, dr]],
      ["Limpieza dental", 30000, 40, [dra]],
      ["Arreglo de caries", 45000, 45, [dra, dr]],
      ["Control de ortodoncia", 20000, 20, [dr]],
      ["Extracción", 50000, 45, [dr]],
    ];
    for (const [n, price, dur, staff] of services) {
      const id = await prods.createProduct({
        name: n, cost: 0, price, stock: 0, min_stock: 0, unit: "servicio", tax_rate: 0, category_id: cat,
        track_stock: false, product_kind: "prepared", prepare_mode: "on_demand", duration_min: dur,
      });
      const db = await getDb();
      for (const r of staff) await db.execute("INSERT OR IGNORE INTO service_resources (product_id, resource_id) VALUES ($1,$2)", [id, r]);
    }
    const people = [
      ["Laura Giménez", "OSDE"], ["Ricardo Pereyra", "PAMI"], ["Florencia Díaz", "Swiss Medical"],
      ["Mateo Romero", "OSDE"], ["Ana María Quiroga", "IOSFA"], ["Bruno Castro", ""], ["Paula Méndez", "Galeno"],
    ];
    const ids = [];
    for (const [n, os] of people) ids.push(await custs.createCustomer({ name: n, insurance: os || null, credit_limit: 0 }));
    const db = await getDb();
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const rows = [
      ["08:30", "09:00", "Consulta odontológica", dra, "Dra. Paula Ríos", 0, "completed"],
      ["09:00", "09:40", "Limpieza dental", dra, "Dra. Paula Ríos", 1, "in_progress"],
      ["09:00", "09:20", "Control de ortodoncia", dr, "Dr. Martín Sosa", 3, "completed"],
      ["09:30", "10:15", "Extracción", dr, "Dr. Martín Sosa", 4, "confirmed"],
      ["10:00", "10:45", "Arreglo de caries", dra, "Dra. Paula Ríos", 2, "confirmed"],
      ["10:30", "11:00", "Consulta odontológica", dr, "Dr. Martín Sosa", 5, "scheduled"],
      ["11:00", "11:40", "Limpieza dental", dra, "Dra. Paula Ríos", 6, "scheduled"],
      ["11:30", "11:50", "Control de ortodoncia", dr, "Dr. Martín Sosa", 0, "scheduled"],
    ];
    for (const [a, b, title, rid, rname, c, st] of rows) {
      await db.execute(
        `INSERT INTO appointments (customer_id, title, resource_id, resource_name, starts_at, ends_at, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ids[c], title, rid, rname, `${ymd} ${a}:00`, `${ymd} ${b}:00`, st],
      );
    }
  });
}

async function seedTaller() {
  await seed(COMMON, { rubro: "taller", name: "Taller Ruta 7" });
  await seed(async () => {
    const prods = await import("/src/db/products.ts");
    const cats = await import("/src/db/categories.ts");
    const custs = await import("/src/db/customers.ts");
    const veh = await import("/src/db/vehicles.ts");
    const so = await import("/src/db/serviceOrders.ts");
    const res = await import("/src/db/workshopResources.ts");
    const { getDb } = await import("/src/db/index.ts");
    const rep = await cats.createCategory("Repuestos");
    const mo = await cats.createCategory("Mano de obra");
    const P = {};
    const priceOf = {};
    for (const [n, cost, price, stock, min] of [
      ["Filtro de aceite", 6500, 11000, 14, 4], ["Aceite 10W40 x 4 L", 28000, 42000, 9, 3], ["Pastillas de freno delanteras", 22000, 36000, 6, 2],
      ["Bujías x4", 16000, 26000, 8, 2], ["Filtro de aire", 7000, 12500, 3, 4], ["Correa de distribución", 45000, 72000, 2, 1],
    ]) { P[n] = await prods.createProduct({ name: n, cost, price, stock, min_stock: min, unit: "unidad", tax_rate: 21, category_id: rep }); priceOf[n] = price; }
    for (const [n, price, dur] of [["Cambio de aceite y filtro", 18000, 45], ["Service completo", 65000, 180], ["Cambio de pastillas", 25000, 60], ["Alineación y balanceo", 30000, 60]]) {
      P[n] = await prods.createProduct({ name: n, cost: 0, price, stock: 0, min_stock: 0, unit: "servicio", tax_rate: 21, category_id: mo, track_stock: false, product_kind: "prepared", prepare_mode: "on_demand", duration_min: dur });
      priceOf[n] = price;
    }
    await res.createWorkshopResource({ name: "Elevador 1" });
    await res.createWorkshopResource({ name: "Elevador 2" });
    const data = [
      // Sin marcas de autos: ML marca como «fotos no relacionadas» las capturas con marcas de terceros.
      ["Jorge Medina", "AB123CD", "", "Sedán gris", 2015, 148200],
      ["Silvia Torres", "AE456FG", "", "Hatchback blanco", 2019, 76500],
      ["Hernán Oviedo", "AF789HJ", "", "Pick-up 4x4", 2021, 98300],
      ["Marcela Funes", "AD321KL", "", "Hatchback rojo", 2018, 61200],
      ["Diego Arce", "AC654MN", "", "Utilitario", 2016, 189400],
    ];
    const C = [], V = [];
    for (const [n, plate, brand, model, year, km] of data) {
      const c = await custs.createCustomer({ name: n, credit_limit: 0 });
      C.push(c);
      V.push(await veh.createVehicle({ customer_id: c, plate, kind: plate === "AF789HJ" ? "Camioneta" : "Auto", brand, model, year, odometer_km: km }));
    }
    const item = (n, q = 1) => {
      const labor = /Cambio|Service|Alineación/.test(n) && !/Filtro|Aceite 10W/.test(n);
      const x = so.buildServiceItem(n, q, 0, 0, P[n], labor);
      x.unit_price = priceOf[n]; x.line_total = priceOf[n] * q;
      return x;
    };
    const orders = [
      [0, "Service de los 150.000 km", "Ruido al frenar y service general", ["Service completo", "Filtro de aceite", "Aceite 10W40 x 4 L", "Filtro de aire", "Bujías x4"], "in_progress"],
      [1, "Cambio de pastillas", "Pedal largo, chilla al frenar", ["Cambio de pastillas", "Pastillas de freno delanteras"], "ready"],
      [3, "Alineación y balanceo", "Tira hacia la derecha", ["Alineación y balanceo"], "pending"],
      [4, "Correa de distribución", "Cambio preventivo", ["Correa de distribución"], "waiting_parts"],
    ];
    for (const [i, title, notes, items, status] of orders) {
      const id = await so.createServiceOrder({ customer_id: C[i], vehicle_id: V[i], odometer_km: data[i][5], title, subject_notes: notes, discount_pct: 0, items: items.map((n) => item(n)) });
      if (status !== "pending") {
        try { await so.setServiceOrderStatus(id, status, null); } catch (e) { console.warn("status", e); }
      }
    }
    const db = await getDb();
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const [a, b, title, ci] of [["08:30", "11:30", "Service completo", 0], ["09:00", "10:00", "Cambio de pastillas", 1], ["11:00", "11:45", "Cambio de aceite y filtro", 2], ["14:00", "15:00", "Alineación y balanceo", 3]]) {
      await db.execute(
        `INSERT INTO appointments (customer_id, vehicle_id, title, starts_at, ends_at, status) VALUES ($1,$2,$3,$4,$5,$6)`,
        [C[ci], V[ci], title, `${ymd} ${a}:00`, `${ymd} ${b}:00`, ci < 2 ? "completed" : "scheduled"],
      );
    }
  });
}

async function seedGastronomia() {
  await seed(COMMON, { rubro: "gastronomia", name: "Bodegón Martina" });
  await seed(async () => {
    const prods = await import("/src/db/products.ts");
    const cats = await import("/src/db/categories.ts");
    const tables = await import("/src/db/tables.ts");
    const { getDb } = await import("/src/db/index.ts");
    const db0 = await getDb();
    const catRows = await db0.select("SELECT id, name FROM categories");
    const C = Object.fromEntries(catRows.map((r) => [r.name, r.id]));
    const P = {};
    const menu = [
      ["Entradas", "Empanadas x6", 9000, "demo-empanadas.jpg"], ["Entradas", "Provoleta", 8500, "demo-provoleta.jpg"],
      ["Principales", "Bife de chorizo", 19500, "demo-bife.jpg"], ["Principales", "Milanesa con papas fritas", 14000, "demo-milanesa.jpg"],
      ["Principales", "Hamburguesa completa", 12500, "demo-hamburguesa.jpg"], ["Pizzas / Empanadas", "Pizza muzzarella", 13000, "demo-pizza.jpg"],
      ["Principales", "Sorrentinos con salsa", 13500, "demo-sorrentinos.jpg"], ["Guarniciones", "Papas fritas", 6000, "demo-papas.jpg"],
      ["Postres", "Flan casero", 5500, "demo-flan.jpg"], ["Postres", "Torta de chocolate", 6200, "demo-pastel.jpg"],
      ["Bebidas", "Pinta de cerveza", 5000, "demo-pintas.jpg"], ["Bebidas", "Limonada 1 L", 6000, null], ["Bebidas", "Agua mineral 500 ml", 2500, null],
    ];
    for (const [cat, n, price, img] of menu) {
      if (!C[cat]) C[cat] = await cats.createCategory(cat);
      P[n] = await prods.createProduct({ name: n, cost: Math.round(price * 0.35), price, stock: 0, min_stock: 0, unit: "porción", tax_rate: 21, category_id: C[cat], track_stock: false, product_kind: "prepared", prepare_mode: "on_demand", image_path: img });
    }
    const drafts = [];
    for (let i = 1; i <= 8; i++) drafts.push({ number: i, name: "", zone: i <= 6 ? "Salón" : "Vereda" });
    await tables.saveDiningTables(drafts);
    const list = await tables.listDiningTables();
    const byNum = Object.fromEntries(list.map((t) => [t.number, t.id]));
    const add = async (o, n, q) => tables.addTableOrderItem(o, { product_id: P[n], label: n, unit_price: menu.find((m) => m[1] === n)[2], qty: q }, null);
    let o = await tables.openTableOrder(byNum[2], { guests: 2, waiterLabel: "Juli" });
    await add(o, "Empanadas x6", 1); await add(o, "Pinta de cerveza", 2);
    await tables.sendTableOrderToKitchen(o);
    o = await tables.openTableOrder(byNum[4], { guests: 3, waiterLabel: "Juli" });
    await add(o, "Provoleta", 1); await add(o, "Bife de chorizo", 1); await add(o, "Milanesa con papas fritas", 1); await add(o, "Limonada 1 L", 1);
    await tables.sendTableOrderToKitchen(o);
    o = await tables.openTableOrder(byNum[5], { guests: 2, waiterLabel: "Fede" });
    await add(o, "Pizza muzzarella", 1); await add(o, "Pinta de cerveza", 2);
    await tables.sendTableOrderToKitchen(o);
    await tables.markTableBillRequested(o);
    o = await tables.openTableOrder(byNum[7], { guests: 1, waiterLabel: "Fede" });
    await add(o, "Hamburguesa completa", 1); await add(o, "Agua mineral 500 ml", 1);
    await tables.sendTableOrderToKitchen(o);
  });
}

async function seedElectronica() {
  await seed(COMMON, { rubro: "electronica", name: "Punto Celular" });
  await seed(async () => {
    const prods = await import("/src/db/products.ts");
    const cats = await import("/src/db/categories.ts");
    const pu = await import("/src/db/phoneUnits.ts");
    const usd = await import("/src/lib/usdRate.ts");
    const RATE = 1250;
    const cel = await cats.createCategory("Celulares");
    const acc = await cats.createCategory("Accesorios");
    const phones = [
      ["iPhone 13 128 GB", 520, 650, [["Medianoche", "nuevo", null], ["Blanco", "nuevo", null], ["Azul", "usado", 88]]],
      ["Samsung Galaxy A55 256 GB", 330, 420, [["Azul", "nuevo", null], ["Negro", "nuevo", null]]],
      ["Motorola Moto G84 256 GB", 200, 270, [["Grafito", "nuevo", null], ["Magenta", "nuevo", null], ["Grafito", "nuevo", null]]],
      ["iPhone 12 64 GB", 280, 360, [["Negro", "usado", 84], ["Violeta", "reacondicionado", 91]]],
    ];
    let imei = 356789104523410;
    for (const [n, costUsd, usdPrice, units] of phones) {
      const id = await prods.createProduct({ name: n, cost: costUsd * RATE, price: usdPrice * RATE, stock: 0, min_stock: 1, unit: "unidad", tax_rate: 21, category_id: cel });
      await pu.saveProductPhoneFields(id, { serialized: true, price_usd: usdPrice, warranty_months_new: 12, warranty_months_used: 3 });
      for (const [color, condition, bat] of units) {
        imei += 7319;
        await pu.addUnit({ product_id: id, identifier: String(imei), identifier_kind: "imei", color, capacity: (n.match(/\d+ GB/) || [null])[0], condition, battery_pct: bat, cost: costUsd * RATE }, null);
      }
    }
    for (const [n, cost, price, stock] of [["Funda silicona iPhone 13", 5000, 12000, 15], ["Cargador 20 W USB-C", 8000, 18000, 10], ["Vidrio templado 9H", 1500, 6000, 40], ["Auriculares Bluetooth", 12000, 25000, 6]]) {
      await prods.createProduct({ name: n, cost, price, stock, min_stock: 3, unit: "unidad", tax_rate: 21, category_id: acc });
    }
    await usd.saveUsdConfig({ mode: "fijo", casa: "blue", margin: 0 });
    await usd.saveUsdRate(RATE, "manual");
  });
}

/* ---------- acciones comunes en la app ---------- */

async function collapseSidebar() {
  const btn = page.getByRole("complementary").getByRole("button", { name: "Volver a solo íconos" });
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
  await page.mouse.move(VIEW.width - 5, VIEW.height / 2);
}

async function openCash() {
  await go("/caja");
  const openBtn = page.getByRole("button", { name: "Abrir turno" }).first();
  if (await openBtn.isVisible().catch(() => false)) {
    await openBtn.click();
    await sleep(600);
    await page.getByLabel("Efectivo de apertura").fill("20000");
    await page.getByRole("button", { name: "Confirmar apertura" }).click();
    await sleep(1200);
  }
}

const posInput = () => page.getByPlaceholder(/Escaneá|buscá/i).first();

async function clearCart() {
  await go("/pos");
  const cancelar = page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" });
  if (await cancelar.isVisible().catch(() => false)) await cancelar.click();
  await posInput().click().catch(() => {});
  await page.keyboard.press("Escape");
  await sleep(400);
  const vaciar = page.getByRole("button", { name: "Sí, vaciar" });
  if (await vaciar.isVisible().catch(() => false)) await vaciar.click();
  await sleep(400);
}

async function granel(code, { grams, pesos } = {}, slow = true) {
  const dlg = page.getByRole("dialog").filter({ hasText: "Venta a granel" });
  if (!(await dlg.isVisible().catch(() => false))) return;
  const m = /^20\d{5}(\d{5})/.exec(code || "");
  const g = grams ?? (m ? Number(m[1]) : 1000);
  if (pesos) {
    const b = dlg.getByRole("button", { name: "Por importe ($)" });
    slow ? await tap(b) : await b.dispatchEvent("click");
    const f = dlg.getByLabel("El cliente paga (pesos)");
    slow ? await typeSlow(f, String(pesos)) : await f.fill(String(pesos));
  } else {
    await dlg.getByRole("button", { name: "Por peso" }).dispatchEvent("click").catch(() => {});
    await dlg.getByRole("button", { name: "Gramos" }).dispatchEvent("click").catch(() => {});
    const f = dlg.getByLabel("Peso en gramos");
    const cur = await f.inputValue().catch(() => "");
    if (cur !== String(g)) await f.fill(String(g));
  }
  await sleep(slow ? 1300 : 300);
  const add = dlg.getByRole("button", { name: "Agregar al carrito" });
  slow ? await tap(add) : await add.dispatchEvent("click");
  await sleep(slow ? 700 : 400);
}

async function scan(code, opts = {}, slow = true) {
  const input = posInput();
  await input.fill(code);
  await page.keyboard.press("Enter");
  await sleep(slow ? 900 : 500);
  await granel(code, opts, slow);
}

async function addByName(q, slow = true, opts = {}) {
  const input = posInput();
  slow ? await typeSlow(input, q, 70) : await input.fill(q);
  await sleep(900);
  const btn = page.getByRole("main").getByRole("button", { name: new RegExp(`^(?!Quitar|Restar|Sumar|Menos|Más).*${q}`, "i") }).first();
  if (slow) await ripple(btn);
  await btn.dispatchEvent("click");
  await sleep(800);
  await granel(null, opts, slow);
}

function cobrarDialog() {
  return page.getByRole("dialog").filter({ hasText: "Cobrar venta" });
}
async function openCheckout(slow = true) {
  const cobrar = cobrarDialog();
  if (!(await cobrar.isVisible().catch(() => false))) {
    const fin = page.getByRole("button", { name: "Finalizar venta" });
    if (slow) await ripple(fin);
    await fin.dispatchEvent("click");
    await cobrar.waitFor({ timeout: 10_000 });
  }
  await sleep(slow ? 900 : 200);
  return cobrar;
}
async function pickMethod(cobrar, method, slow = true) {
  const b = cobrar.getByRole("button", { name: new RegExp("^" + method) }).first();
  slow ? await tap(b) : await b.dispatchEvent("click");
  await sleep(slow ? 700 : 250);
}
async function confirmCharge(cobrar, slow = true) {
  for (const name of [/ticket de cocina/i, /Enviar el comprobante/i]) {
    const box = cobrar.getByRole("checkbox", { name });
    if ((await box.count()) && (await box.first().isChecked({ timeout: 1000 }).catch(() => false))) await box.first().dispatchEvent("click");
  }
  const ok = cobrar.getByRole("button", { name: /^Confirmar cobro/ });
  const t0 = Date.now();
  slow ? await tap(ok) : await ok.dispatchEvent("click");
  const t1 = Date.now();
  await sleep(slow ? 900 : 0);
  rec?.cutStart();
  await page.getByText(/Venta registrada/i).first().waitFor({ timeout: 40_000 });
  rec?.cutEnd();
  if (process.env.DEBUG_TIMING) console.log(`  cobro: click ${t1 - t0} ms, registrada ${Date.now() - t1} ms`);
  await sleep(slow ? 2000 : 900);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(500);
}
async function checkout(method = "Efectivo", slow = true, paysWith = null) {
  const cobrar = await openCheckout(slow);
  await pickMethod(cobrar, method, slow);
  if (paysWith) {
    const f = cobrar.getByLabel(/Paga con/i);
    if (await f.isVisible().catch(() => false)) {
      slow ? await typeSlow(f, String(paysWith), 90) : await f.fill(String(paysWith));
      await sleep(slow ? 1500 : 200);
    }
  }
  await confirmCharge(cobrar, slow);
}
async function checkoutFiado(customer, slow = true) {
  const cobrar = await openCheckout(slow);
  await pickMethod(cobrar, "Fiado", slow);
  const search = cobrar.getByPlaceholder("Buscar cliente...");
  await typeSlow(search, customer, 70);
  await sleep(900);
  const opt = cobrar.getByRole("option", { name: new RegExp(customer, "i") }).first();
  if (await opt.isVisible().catch(() => false)) await tap(opt);
  else await tap(cobrar.getByRole("button", { name: new RegExp(customer, "i") }).first());
  await sleep(1000);
  await confirmCharge(cobrar, slow);
}

async function fiadoTail(codes, customer, label = "El fiado queda anotado") {
  await go("/pos", 1200);
  await caption(label);
  for (const c of codes) await scan(c);
  await checkoutFiado(customer);
  await caption("Sabés quién te debe");
  await go("/clientes", 2800);
}

async function warmSales(list) {
  await clearCart();
  for (const [codes, method] of list) {
    for (const c of codes) await scan(c, {}, false);
    await checkout(method, false);
  }
}

async function pause(ms) {
  await sleep(ms);
}

/** Para ajustar flujos sin mirar el video: botones y campos visibles ahora. */
async function inspect(label) {
  if (!process.env.ML_INSPECT) return;
  const info = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const root = document.querySelector("[role=dialog]:last-of-type") || document.querySelector("main") || document.body;
    return {
      hash: location.hash,
      dialogs: document.querySelectorAll("[role=dialog]").length,
      items: [...root.querySelectorAll("button, a, input, select")].filter(vis)
        .map((e) => e.tagName[0] + ":" + (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 38))
        .filter((s) => s.length > 2).slice(0, 45),
    };
  }).catch((e) => ({ err: e.message }));
  console.log("INSPECT", label, JSON.stringify(info));
}

/* ---------- rubros ---------- */

const KIOSCO_WARM = [
  [["7790895000782", scaleCode(1, 1850), "7790060023455"], "Efectivo"],
  [["7790387000216", "7790742656018", "7792540250450"], "Débito"],
  [[scaleCode(4, 1000), "7792798007387"], "Transferencia"],
];

const RUBROS = {
  "kiosco-almacen": {
    seed: seedKiosco,
    warm: () => warmSales(KIOSCO_WARM),
    start: "/pos",
    flow: async () => {
      await caption("Vendés con el lector de códigos");
      await pause(900);
      for (const c of ["7790895000782", "7790380022725", "7790387000216"]) { await scan(c); await pause(500); }
      await caption("La balanza carga el peso sola");
      await pause(600);
      await scan(scaleCode(1, 1450));
      await caption("Cobrás y te dice el vuelto");
      await checkout("Efectivo", true, 40000);
      await caption("El fiado queda anotado");
      await scan("7790742656018"); await scan("7790040613706");
      await checkoutFiado("Marta");
      await caption("Sabés quién te debe");
      await go("/clientes", 2600);
      await caption("Y cuánto vendiste hoy");
      await go("/", 3200);
    },
  },
  supermercado: {
    seed: seedRetail("supermercado"),
    warm: () => warmSales(KIOSCO_WARM),
    start: "/pos",
    flow: async () => {
      await caption("Cobro rápido en cada caja");
      await pause(700);
      for (const c of ["7790895000782", "7790742656018", "7790742656018", "7790520011025", "7790070318237"]) { await scan(c); await pause(250); }
      await caption("Carnicería y verdulería con balanza");
      await scan(scaleCode(22, 1250));
      await scan(scaleCode(1, 2100));
      await caption("Débito, crédito, QR o efectivo");
      await checkout("Débito");
      await caption("Fiado para los clientes de siempre");
      await scan("7790250012340"); await scan("7790742054321");
      await checkoutFiado("Carlos");
      await caption("El stock baja solo y avisa lo que falta");
      await go("/stock", 3400);
      await caption("Reportes por día, cajero y medio de pago");
      await go("/reportes", 3400);
      await caption("Todo el día del súper en una pantalla");
      await go("/", 3200);
    },
  },
  verduleria: {
    seed: seedRetail("verduleria"),
    warm: () => warmSales([[[scaleCode(1, 1500), scaleCode(2, 3000)], "Efectivo"], [[scaleCode(6, 1200), "2000100000017"], "Transferencia"]]),
    start: "/pos",
    flow: async () => {
      await caption("Pesás y la balanza carga el precio");
      await pause(700);
      await scan(scaleCode(1, 1250)); await pause(300);
      await scan(scaleCode(2, 2000)); await pause(300);
      await caption("O vendés por importe: «dame $2.000»");
      await addByName("Banana", true, { pesos: 2000 });
      await caption("Lo suelto, por unidad");
      await addByName("Lechuga");
      await caption("Cobrás con lo que el cliente quiera");
      await checkout("Transferencia");
      await caption("Sabés qué fruta y verdura se termina");
      await go("/stock", 3200);
      await fiadoTail(["2000100000031", scaleCode(3, 1500)], "Rosa", "La cuenta de cada cliente");
      await caption("Y cuánto vendiste hoy");
      await go("/", 3000);
    },
  },
  "pet-shop": {
    seed: seedRetail("pet-shop"),
    warm: () => warmSales([[["7798114000017", "7798114000048"], "Débito"], [[scaleCode(1, 3000), "7798114000079"], "Efectivo"]]),
    start: "/pos",
    flow: async () => {
      await caption("Bolsas cerradas con el lector");
      await pause(700);
      await scan("7798114000031"); await pause(300);
      await caption("Alimento suelto, por kilo");
      await addByName("perro suelto", true, { grams: 2500 });
      await caption("Y los accesorios");
      await scan("7798114000062"); await scan("7798114000079");
      await caption("Cobrás en segundos");
      await checkout("Crédito");
      await caption("Avisa qué alimento reponer");
      await go("/stock", 3200);
      await fiadoTail(["7798114000048", "7798114000055"], "Veterinaria", "Cuenta corriente para clientes");
      await caption("Y cuánto vendiste hoy");
      await go("/", 3000);
    },
  },
  ferreteria: {
    seed: seedRetail("ferreteria"),
    warm: () => warmSales([[["7791234000066", "7791234000073"], "Efectivo"], [["7791234000042", "7791234000103"], "Débito"]]),
    start: "/pos",
    flow: async () => {
      await caption("Buscás por nombre o por código");
      await pause(700);
      await addByName("tarugo");
      await addByName("autoperforante");
      await caption("Clavos y lo suelto, por kilo");
      await addByName("Clavos", true, { grams: 1500 });
      await scan("7791234000080");
      await caption("Cobrás con cualquier medio");
      await checkout("Transferencia");
      await caption("Miles de artículos, ordenados");
      await go("/productos", 3200);
      await caption("Y sabés qué reponer");
      await go("/stock", 3000);
      await fiadoTail(["7791234000042", "7791234000103"], "Raúl", "Cuenta corriente para el gremio");
    },
  },
  "ropa-indumentaria": {
    seed: seedRetail("ropa-indumentaria"),
    warm: () => warmSales([[["7790000100042", "7790000100011"], "Crédito"], [["7790000100097"], "Efectivo"]]),
    start: "/pos",
    flow: async () => {
      await caption("Cada prenda con su talle y color");
      await pause(700);
      await scan("7790000100011"); await pause(300);
      await addByName("Jean mom");
      await addByName("Buzo");
      await caption("Cobrás con tarjeta o en efectivo");
      await checkout("Crédito");
      await caption("Sabés qué talle te queda");
      await go("/stock", 3200);
      await fiadoTail(["7790000100097", "7790000100103"], "Camila", "Cuenta corriente de tus clientas");
      await caption("Y cuánto vendiste hoy");
      await go("/", 3000);
    },
  },
  "general-permanente": {
    seed: seedRetail("general-permanente"),
    warm: () => warmSales(KIOSCO_WARM.map(([c, m]) => [c.filter((x) => !x.startsWith("20")), m])),
    start: "/pos",
    flow: async () => {
      await caption("Para cualquier comercio");
      await pause(700);
      for (const c of ["7791111000014", "7791111000021", "7790895000430"]) { await scan(c); await pause(300); }
      await caption("Vendés y cobrás en segundos");
      await checkout("Efectivo", true, 10000);
      await caption("Y anotás el fiado");
      await scan("7791111000038"); await scan("7791111000045");
      await checkoutFiado("Graciela");
      await inspect("fiado general");
      await caption("Sabés quién te debe");
      await go("/clientes", 2800);
      await caption("Productos y stock ordenados");
      await go("/productos", 3000);
      await caption("Caja y arqueo del día");
      await go("/caja", 3000);
      await caption("Y cuánto vendiste");
      await go("/", 3000);
    },
  },
  gastronomia: {
    seed: seedGastronomia,
    warm: async () => {},
    start: "/mesas",
    flow: async () => {
      await caption("El salón de un vistazo");
      await pause(2200);
      await caption("Abrís la mesa y cargás el pedido");
      await inspect("mesas");
      await tap(page.getByText(/^Mesa 1$/).first());
      await pause(1500);
      await inspect("mesa1");
      await RUBROS.gastronomia.fillTable();
      await caption("La mesa 5 pidió la cuenta");
      await pause(1800);
      await tap(page.getByRole("button", { name: /^Mesa 5/ }).first());
      await pause(2200);
      await caption("Cobrás la mesa por la caja");
      await tap(page.getByRole("dialog").last().getByRole("button", { name: /^Cobrar/ }).first());
      await pause(1800);
      await inspect("cobrar mesa");
      await checkout("Efectivo", true, 25000);
      await go("/mesas", 2400);
      await caption("Todo el día del local");
      await go("/", 3000);
    },
    fillTable: async () => {
      const dlg = page.getByRole("dialog").first();
      const waiter = dlg.locator("select").first();
      if (await waiter.count()) { await ripple(waiter); await waiter.selectOption({ index: 1 }).catch(() => {}); await pause(500); }
      await tap(dlg.getByRole("button", { name: "Abrir mesa" }));
      await pause(1500);
      await inspect("mesa abierta");
      for (const [cat, item, times] of [["Entradas", "Empanadas x6", 1], ["Principales", "Milanesa con papas fritas", 2], ["Bebidas", "Limonada 1 L", 1]]) {
        await tap(dlg.getByRole("button", { name: cat, exact: true }));
        await pause(600);
        for (let i = 0; i < times; i++) {
          await tap(dlg.getByRole("button", { name: new RegExp("^" + item.replace(/[()]/g, ".")) }).first());
          await pause(700);
          for (let k = 0; k < 3 && (await page.getByRole("dialog").count()) > 1; k++) {
            const sub = page.getByRole("dialog").last();
            await inspect("variante " + item);
            const pickBtn = sub.getByRole("button", { name: /Al horno|Agregar|Confirmar|Listo/ }).first();
            if (await pickBtn.isVisible().catch(() => false)) await tap(pickBtn);
            else await sub.getByRole("button", { name: "Cerrar" }).first().click().catch(() => {});
            await pause(800);
          }
        }
      }
      await pause(800);
      await caption("La comanda sale a cocina");
      await tap(dlg.getByRole("button", { name: /Enviar a cocina/i }).first());
      await pause(2000);
      await inspect("enviada");
      const extra = page.getByRole("dialog").last().getByRole("button", { name: /^(Aceptar|Listo|Cerrar)$/ }).first();
      if (await extra.isVisible().catch(() => false)) await extra.click().catch(() => {});
      await pause(600);
      const close = page.getByRole("dialog").last().getByRole("button", { name: "Cerrar" }).first();
      if (await close.isVisible().catch(() => false)) await tap(close);
      await pause(900);
    },
  },
  celulares: {
    seed: seedElectronica,
    warm: async () => {},
    start: "/celulares",
    flow: async () => {
      await caption("Cada equipo con su IMEI");
      await pause(2000);
      await caption("Buscás un IMEI y ves su historia");
      await typeSlow(page.getByPlaceholder(/IMEI, serie/i), "530729", 90);
      await tap(page.getByRole("button", { name: "Buscar", exact: true }));
      await pause(2600);
      await caption("Al vender, la caja te pide el equipo");
      await clearCart();
      await addByName("iPhone 13");
      await pause(1200);
      await inspect("equipo");
      const unit = page.getByRole("dialog").last().getByRole("button", { name: /Medianoche|Blanco|nuevo/i }).first();
      if (await unit.isVisible().catch(() => false)) { await tap(unit); await pause(1200); }
      await caption("Precio en dólares, cobrás en pesos");
      await pause(1500);
      await checkout("Transferencia");
      await caption("La garantía queda anotada en el equipo");
      await go("/celulares", 1200);
      await typeSlow(page.getByPlaceholder(/IMEI, serie/i), "530729", 90);
      await tap(page.getByRole("button", { name: "Buscar", exact: true }));
      await pause(3600);
      await caption("Y todo el stock de equipos y accesorios");
      await go("/stock", 3200);
    },
  },
  "taller-mecanico": {
    seed: seedTaller,
    warm: async () => {},
    start: "/ordenes",
    flow: async () => {
      await caption("Órdenes de trabajo por patente");
      await pause(2400);
      await caption("Repuestos, mano de obra y kilometraje");
      await tap(page.getByText("AB123CD").first());
      await pause(3500);
      await inspect("orden");
      await caption("Sumás un repuesto del stock");
      const rep = page.getByPlaceholder("Buscar repuesto…").first();
      await rep.scrollIntoViewIfNeeded().catch(() => {});
      await pause(800);
      await typeSlow(rep, "Pastillas", 80);
      await pause(1000);
      await inspect("repuesto");
      const opt = page.getByRole("option", { name: /Pastillas de freno/ }).first();
      if (await opt.isVisible().catch(() => false)) await tap(opt);
      else await tap(page.getByRole("button", { name: /Pastillas de freno/ }).first()).catch(() => {});
      await pause(1600);
      await caption("Y avisás que el auto está listo");
      await tap(page.getByRole("button", { name: "Marcar lista para entrega" }));
      await pause(1500);
      await caption("Entregás el auto y cobrás");
      await tap(page.getByRole("button", { name: "Entregar y cobrar" }));
      await pause(1800);
      const ent = page.getByRole("dialog").last();
      const pay = ent.locator("select").first();
      await ripple(pay);
      await pay.selectOption({ label: "Débito" }).catch(() => {});
      await pause(900);
      await tap(ent.getByRole("button", { name: "Confirmar" }));
      await pause(2600);
      await inspect("entregada");
      await caption("Cada auto con su estado");
      await go("/ordenes", 3000);
      await caption("Turnos del taller");
      await go("/turnos", 3000);
      await caption("Y el stock de repuestos");
      await go("/stock", 2800);
    },
  },
  "peluqueria-barberia-estetica": {
    seed: seedEstetica,
    warm: async () => {},
    start: "/turnos",
    flow: async () => {
      await caption("Los turnos del día, en orden");
      await pause(2600);
      await caption("La agenda de cada profesional");
      const filter = page.locator("select").filter({ hasText: "Todos los profesionales" }).first();
      await ripple(filter);
      await filter.selectOption({ label: "Nico" }).catch(() => {});
      await pause(2400);
      await filter.selectOption({ index: 0 }).catch(() => {});
      await pause(800);
      await caption("Cargás un turno en segundos");
      await tap(page.getByText("Nuevo turno").first());
      await pause(1400);
      await tap(page.getByRole("button", { name: /Corte y barba · 45/ }));
      await pause(500);
      const pro = page.getByPlaceholder("Buscar profesional…");
      await typeSlow(pro, "Nico", 90);
      await pause(600);
      await tap(page.getByText("Nico", { exact: true }).last());
      await pause(500);
      const hora = page.getByLabel(/Hora inicio/).first();
      await ripple(hora);
      await hora.fill("17:30").catch(() => {});
      await pause(500);
      const cli = page.getByPlaceholder(/Buscar por nombre, teléfono o DNI/).first();
      await typeSlow(cli, "Martín", 80);
      await pause(900);
      await tap(page.getByText("Martín Ledesma").last()).catch(() => {});
      await pause(1200);
      await tap(page.getByRole("button", { name: "Guardar" }).last());
      await pause(2200);
      await go("/turnos", 1800);
      await caption("Cobrás desde el turno");
      const btn = page.getByRole("button", { name: "Cobrar" }).first();
      if (await btn.isVisible().catch(() => false)) {
        await tap(btn);
        await pause(2000);
        await checkout("Transferencia");
      }
      await caption("Comisiones de cada profesional");
      await go("/comisiones", 3400);
      await caption("Servicios con duración y precio");
      await go("/productos", 1200);
      await tap(page.getByRole("main").getByRole("button", { name: /^Servicios/ }).first()).catch(() => {});
      await pause(2600);
      await caption("Y cuánto entró hoy");
      await go("/", 3000);
    },
  },
  "consultorio-clinica": {
    seed: seedClinica,
    warm: async () => {},
    start: "/",
    flow: async () => {
      await caption("A quién llamar, de un vistazo");
      await pause(2600);
      await caption("La agenda de cada profesional");
      await go("/agenda-profesional", 3200);
      await caption("Turnos: primero el servicio, después quién atiende");
      await go("/turnos", 1500);
      await tap(page.getByText("Nuevo turno").first());
      await pause(1400);
      await tap(page.getByRole("button", { name: /^Limpieza dental/ }).first());
      await pause(800);
      await inspect("turno clinica");
      const pro = page.getByPlaceholder("Buscar profesional…");
      if (await pro.isVisible().catch(() => false)) {
        await typeSlow(pro, "Paula", 90);
        await pause(600);
        await tap(page.getByText("Dra. Paula Ríos", { exact: true }).last()).catch(() => {});
      } else {
        const sel = page.locator("select").filter({ hasText: "Paula" }).first();
        if (await sel.count()) { await ripple(sel); await sel.selectOption({ label: "Dra. Paula Ríos" }).catch(() => {}); }
      }
      await pause(600);
      const hora = page.getByLabel(/Hora inicio/).first();
      await ripple(hora);
      await hora.fill("12:00").catch(() => {});
      await pause(500);
      const cli = page.getByPlaceholder(/Buscar por (nombre|DNI)/).first();
      await typeSlow(cli, "Bruno", 80);
      await pause(900);
      await tap(page.getByText("Bruno Castro").last()).catch(() => {});
      await pause(1200);
      await tap(page.getByRole("button", { name: "Guardar" }).last());
      await pause(2400);
      await caption("Pacientes con su obra social");
      await go("/clientes", 2600);
      await caption("Odontograma en la ficha");
      await tap(page.getByRole("button", { name: /Ficha/ }).nth(2)).catch(() => {});
      await pause(1600);
      await inspect("ficha");
      const dlg = page.getByRole("dialog");
      for (const [tooth, taps] of [["16", 1], ["26", 1], ["36", 2], ["47", 3]]) {
        const b = dlg.getByRole("button", { name: new RegExp(`^Diente ${tooth},`) }).first();
        for (let i = 0; i < taps; i++) { await tap(b).catch(() => {}); await pause(350); }
      }
      await pause(1500);
    },
  },
};

/* ---------- principal ---------- */

const slugs = args.filter((a) => !a.startsWith("--"));
const list = slugs.length ? slugs : Object.keys(RUBROS);

page = await livePage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

for (const slug of list) {
  const cfg = RUBROS[slug];
  if (!cfg) { console.log("rubro desconocido", slug); continue; }
  console.log("==>", slug);
  await bridge();
  await page.evaluate(async () => { await window.__GESTION_E2E__.warmDb(); });
  await invoke("e2e_ensure_baseline_template");
  await page.evaluate(async () => { await window.__GESTION_E2E__.closeDb(); window.__GESTION_E2E__.clearStorage(); });
  await invoke("e2e_reset_environment");
  await reload();
  await cfg.seed();
  await reload();
  await login();
  await collapseSidebar();
  await openCash();
  await cfg.warm();
  await go("/", 1500);
  await go(cfg.start, 2000);
  await page.mouse.move(VIEW.width - 5, VIEW.height / 2);
  if (cfg.start === "/pos") await clearCart();
  await caption("");
  if (PROBE) {
    await page.screenshot({ path: path.join("tests/results", `probe-${slug}.jpg`), type: "jpeg", quality: 70 });
    console.log("probe", slug);
    continue;
  }
  rec = new Recorder(slug);
  await rec.start();
  await sleep(600);
  try {
    await cfg.flow();
  } catch (e) {
    console.log("FLOW ERROR", slug, e.message.split("\n").slice(0, 8).join(" | "));
    await page.screenshot({ path: path.join("tests/results", `flowerr-${slug}.jpg`), type: "jpeg", quality: 70 }).catch(() => {});
  }
  await caption("");
  await sleep(800);
  await rec.stop();
  rec = null;
}

await browser.close();
