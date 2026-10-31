/**
 * Capturas de la app real para las fotos de Mercado Libre (marketing/mercadolibre/capturas/<rubro>/).
 *
 * Sin marcas de terceros (productos, autos, celulares, obras sociales), sin teléfonos ni links, y sin el
 * logo ni walqo.pro del menú: ML marca esas fotos como «no relacionadas» o desenfoca los «datos de contacto».
 *
 * Requiere una instancia e2e aislada con depuración remota (resetea su base en cada rubro):
 *   $env:GESTION_E2E="1"; $env:GESTION_LICENSE_DEV="1"; $env:GESTION_E2E_DATA_DIR="<carpeta>"
 *   $env:WEBVIEW2_USER_DATA_FOLDER="<carpeta>"; $env:CARGO_TARGET_DIR="<carpeta>"
 *   npm run tauri dev -- --no-watch --config <conf con otro identifier, puerto de vite y remote-debugging-port>
 *
 * Uso: WALQO_CDP=http://127.0.0.1:9234 WALQO_ORIGIN=http://localhost:1432 node scripts/mercadolibre/capture-shots.mjs [rubro ...]
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ORIGIN = process.env.WALQO_ORIGIN || "http://localhost:1420";
const CDP = process.env.WALQO_CDP || "http://127.0.0.1:9222";
const OUT_ROOT = path.resolve(process.env.WALQO_SHOTS_OUT || "marketing/mercadolibre/capturas");
const VIEW = { width: 1440, height: 900, deviceScaleFactor: 1.1112, mobile: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.connectOverCDP(CDP);
const context = browser.contexts()[0];
let page;
let emuSession;
let outDir;

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
  emuSession = await context.newCDPSession(page);
  await emuSession.send("Emulation.setDeviceMetricsOverride", VIEW);
}
async function reload() {
  await page.goto(`${ORIGIN}/?s=${Date.now()}#/login`).catch(() => {});
  page = await livePage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
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
async function go(hash, wait = 1800) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await sleep(wait);
}
async function seed(fn, arg) {
  await page.evaluate(fn, arg);
}

async function expandSidebar() {
  const aside = page.getByRole("complementary");
  const expand = aside.getByRole("button", { name: /Abrir menú completo/i });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  const collapsed = aside.locator('button[data-nav-group][aria-expanded="false"]');
  for (let i = 0; i < 8 && (await collapsed.count()) > 0; i++) {
    await collapsed.first().click();
    await sleep(200);
  }
}

/** Saca de la pantalla lo que ML toma como logo, link o contacto, y los avisos que no son del rubro. */
async function cleanup() {
  const hide = page.getByRole("button", { name: "Ocultar los primeros pasos" });
  if (await hide.isVisible().catch(() => false)) {
    await hide.click().catch(() => {});
    await sleep(400);
  }
  await page.evaluate(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const invisible = (el) => { if (el) el.style.visibility = "hidden"; };
    for (const el of root.querySelectorAll('[title^="WalQo"]')) invisible(el.closest("div.flex.items-end") || el);
    for (const el of root.querySelectorAll('[aria-label*="WhatsApp"], [title*="WhatsApp"]')) invisible(el);
    for (const el of root.querySelectorAll("aside *")) {
      if (!el.children.length && /walqo\.pro|^v\d+\.\d+\.\d+/i.test((el.textContent || "").trim())) invisible(el.parentElement);
    }
    for (const el of root.querySelectorAll("span, p, div")) {
      if (!el.children.length && (el.textContent || "").trim() === "WalQo") invisible(el);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const contact = [];
    while (walker.nextNode()) if (/WhatsApp|walqo\.pro/i.test(walker.currentNode.nodeValue)) contact.push(walker.currentNode.parentElement);
    for (const leaf of contact) {
      let box = leaf;
      while (box.parentElement && box.parentElement !== root && (box.parentElement.textContent || "").length < 220) box = box.parentElement;
      box.style.display = "none";
    }
    const update = [...root.querySelectorAll("div, section, aside")].filter((el) => {
      const t = el.textContent || "";
      return t.includes("Hay una versión nueva") && t.length < 260;
    });
    if (update.length) update[update.length - 1].style.display = "none";
    for (const el of root.querySelectorAll("a, button")) {
      if (/^\s*Actualizar v\d/.test(el.textContent || "")) el.style.display = "none";
    }
  }).catch(() => {});
}

async function shot(name) {
  const size = await page.evaluate(() => [innerWidth, innerHeight]).catch(() => [0, 0]);
  if (size[0] !== VIEW.width || size[1] !== VIEW.height) {
    await emuSession.send("Emulation.setDeviceMetricsOverride", VIEW).catch(() => {});
    await sleep(800);
  }
  await sleep(900);
  await cleanup();
  await page.mouse.move(VIEW.width - 4, VIEW.height - 4).catch(() => {});
  await sleep(300);
  const file = path.join(outDir, `app-${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 88 });
  console.log("  shot", path.relative(process.cwd(), file));
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

const SEED_RETAIL = async ({ products, customers, variants }) => {
  const cats = await import("/src/db/categories.ts");
  const prods = await import("/src/db/products.ts");
  const custs = await import("/src/db/customers.ts");
  const vars = await import("/src/db/variants.ts");
  const catIds = {};
  const catId = async (cat) => {
    if (!(cat in catIds)) catIds[cat] = await cats.createCategory(cat);
    return catIds[cat];
  };
  for (const [cat, name, barcode, cost, price, stock, min, unit, plu] of products) {
    await prods.createProduct({ name, barcode, cost, price, stock, min_stock: min, unit, tax_rate: 21, category_id: await catId(cat), scale_plu: plu ?? null });
  }
  for (const [cat, name, barcode, cost, price, color, sizes] of variants ?? []) {
    const id = await prods.createProduct({ name, barcode, cost, price, stock: 0, min_stock: 0, unit: "unidad", tax_rate: 21, category_id: await catId(cat) });
    await vars.saveProductVariants(id, sizes.map(([talle, stock]) => ({ attributes: { Talle: talle, Color: color }, sku: "", barcode: "", price: "", stock, min_stock: 1 })));
  }
  for (const [name, debt] of customers) await custs.createCustomer({ name, credit_limit: 0, initial_debt: debt });
};

const ALMACEN = [
  ["Bebidas", "Gaseosa cola 2,25 L", "7791000000014", 3000, 4200, 18, 6, "unidad"],
  ["Bebidas", "Gaseosa lima-limón 500 ml", "7791000000021", 1250, 1900, 30, 10, "unidad"],
  ["Bebidas", "Agua mineral 2 L", "7791000000038", 1400, 2100, 4, 6, "unidad"],
  ["Bebidas", "Cerveza rubia 1 L", "7791000000045", 2300, 3300, 24, 12, "unidad"],
  ["Golosinas", "Alfajor triple de chocolate", "7791000000052", 700, 1100, 9, 12, "unidad"],
  ["Golosinas", "Alfajor de maicena", "7791000000069", 420, 700, 40, 15, "unidad"],
  ["Golosinas", "Papas fritas 85 g", "7791000000076", 2200, 3200, 12, 6, "unidad"],
  ["Almacén", "Yerba mate 1 kg", "7791000000083", 4300, 5900, 14, 6, "unidad"],
  ["Almacén", "Fideos tirabuzón 500 g", "7791000000090", 1200, 1800, 22, 10, "unidad"],
  ["Almacén", "Leche entera 1 L", "7791000000106", 1150, 1650, 20, 12, "unidad"],
  ["Almacén", "Azúcar 1 kg", "7791000000113", 1050, 1500, 18, 8, "unidad"],
  ["Almacén", "Pan lactal", "7791000000120", 2200, 3100, 2, 4, "unidad"],
];
const CARNES = [
  ["Fiambrería", "Jamón cocido", null, 9000, 14000, 6, 2, "kg", "11"],
  ["Fiambrería", "Queso de máquina", null, 8000, 12500, 5, 2, "kg", "12"],
  ["Carnicería", "Asado", null, 8200, 11900, 24, 8, "kg", "1"],
  ["Carnicería", "Carne picada común", null, 5200, 7900, 15, 5, "kg", "4"],
  ["Carnicería", "Pollo entero", null, 2600, 3900, 20, 6, "kg", "6"],
];
const FIADO = [["Marta Gómez", 18500], ["Carlos Ruiz", 7200], ["Luis (edificio de enfrente)", 32400], ["Graciela Funes", 0], ["Norma Benítez", 5600]];

const RETAIL = {
  kiosco: {
    rubro: "kiosco", name: "Almacén La Esquina",
    products: [...ALMACEN, ...CARNES],
    customers: FIADO,
    cart: ["7791000000014", "7791000000052", "7791000000083", scaleCode(1, 1450)],
    granel: { name: "picada", pesos: 4000 },
    warm: [[["7791000000014", scaleCode(1, 1850), "7791000000052"], "Efectivo"], [["7791000000083", "7791000000106", "7791000000113"], "Débito"], [[scaleCode(4, 1000), "7791000000045"], "Transferencia"]],
  },
  supermercado: {
    rubro: "supermercado", name: "Súper Don Pedro",
    products: [
      ...ALMACEN, ...CARNES,
      ["Limpieza", "Lavandina 1 L", "7791000000137", 900, 1400, 30, 10, "unidad"],
      ["Limpieza", "Detergente 750 ml", "7791000000144", 1500, 2300, 3, 8, "unidad"],
      ["Limpieza", "Papel higiénico x4", "7791000000151", 2400, 3600, 18, 8, "unidad"],
      ["Lácteos", "Yogur bebible 1 L", "7791000000168", 1800, 2700, 2, 6, "unidad"],
      ["Lácteos", "Manteca 200 g", "7791000000175", 2100, 3100, 10, 4, "unidad"],
      ["Verdulería", "Papa", null, 600, 1100, 80, 20, "kg", "21"],
      ["Verdulería", "Tomate", null, 1500, 2600, 25, 10, "kg", "22"],
    ],
    customers: FIADO,
    cart: ["7791000000014", "7791000000106", "7791000000106", "7791000000137", "7791000000090", scaleCode(22, 1250)],
    granel: { name: "Tomate", grams: 1500 },
    warm: [[["7791000000014", scaleCode(1, 1850), "7791000000151"], "Efectivo"], [["7791000000083", "7791000000106", "7791000000175"], "Débito"], [[scaleCode(21, 3000), "7791000000045"], "Crédito"], [["7791000000137", "7791000000144"], "Transferencia"]],
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
      ["Hojas", "Lechuga criolla", "2100100000017", 900, 1500, 20, 6, "unidad"],
      ["Hojas", "Atado de acelga", "2100100000024", 800, 1400, 3, 6, "unidad"],
      ["Almacén", "Huevos maple x30", "2100100000031", 6500, 8900, 12, 4, "unidad"],
    ],
    customers: [["Doña Rosa", 9600], ["Comedor Los Peques", 21500], ["Jorge Paz", 0], ["Silvia Ortiz", 4300]],
    cart: [scaleCode(1, 1250), scaleCode(2, 2000), scaleCode(6, 1100), "2100100000017"],
    granel: { name: "Frutilla", pesos: 3000 },
    warm: [[[scaleCode(1, 1500), scaleCode(2, 3000)], "Efectivo"], [[scaleCode(6, 1200), "2100100000017"], "Transferencia"], [[scaleCode(7, 2000), "2100100000031"], "Débito"]],
  },
  petshop: {
    rubro: "petshop", name: "Pet Shop Huellitas",
    products: [
      ["Alimento perro", "Alimento perro adulto 15 kg", "7792000000011", 38000, 52000, 8, 3, "unidad"],
      ["Alimento perro", "Alimento cachorro 3 kg", "7792000000028", 11000, 15500, 2, 4, "unidad"],
      ["Alimento perro", "Alimento perro suelto", null, 2600, 3900, 45, 10, "kg", "1"],
      ["Alimento gato", "Alimento gato adulto 7,5 kg", "7792000000035", 26000, 36000, 6, 3, "unidad"],
      ["Alimento gato", "Alimento gato suelto", null, 3400, 5200, 30, 8, "kg", "2"],
      ["Higiene", "Piedras sanitarias 4 kg", "7792000000042", 3500, 5400, 14, 5, "unidad"],
      ["Higiene", "Pipeta antipulgas mediana", "7792000000059", 5200, 8200, 10, 4, "unidad"],
      ["Accesorios", "Collar regulable", "7792000000066", 2500, 4900, 12, 4, "unidad"],
      ["Accesorios", "Pelota de goma", "7792000000073", 1100, 2400, 20, 5, "unidad"],
      ["Accesorios", "Cama mediana", "7792000000080", 15000, 26000, 3, 2, "unidad"],
      ["Forrajería", "Maíz partido", null, 500, 900, 80, 20, "kg", "3"],
      ["Forrajería", "Alpiste", null, 1800, 2900, 12, 5, "kg", "4"],
    ],
    customers: [["Romina Suárez", 12300], ["Veterinaria del Centro", 46000], ["Pablo Díaz", 0], ["Criadero San Roque", 18900]],
    cart: ["7792000000035", scaleCode(1, 2500), "7792000000066", "7792000000073"],
    granel: { name: "perro suelto", pesos: 10000 },
    warm: [[["7792000000011", "7792000000042"], "Débito"], [[scaleCode(1, 3000), "7792000000073"], "Efectivo"], [["7792000000059"], "Transferencia"]],
  },
  ferreteria: {
    rubro: "ferreteria", name: "Ferretería El Tornillo",
    products: [
      ["Tornillería", "Tornillo autoperforante 8x1\" (x100)", "7793000000018", 3800, 6200, 25, 8, "unidad"],
      ["Tornillería", "Tarugo de nailon 8 mm (x50)", "7793000000025", 2200, 3900, 30, 10, "unidad"],
      ["Tornillería", "Clavos 2\" por kilo", null, 3000, 4800, 18, 5, "kg", "1"],
      ["Electricidad", "Cable unipolar 2,5 mm por metro", null, 500, 850, 300, 50, "m", "2"],
      ["Electricidad", "Cinta aisladora", "7793000000032", 600, 1200, 40, 10, "unidad"],
      ["Electricidad", "Lámpara LED 12 W", "7793000000049", 1400, 2600, 3, 10, "unidad"],
      ["Pinturería", "Látex interior 4 L", "7793000000056", 17000, 26500, 9, 3, "unidad"],
      ["Pinturería", "Rodillo antigota 22 cm", "7793000000063", 3200, 5600, 7, 3, "unidad"],
      ["Herramientas", "Taladro percutor 650 W", "7793000000070", 48000, 72000, 4, 2, "unidad"],
      ["Herramientas", "Cinta métrica 5 m", "7793000000087", 3000, 5200, 2, 4, "unidad"],
      ["Plomería", "Teflón 3/4\"", "7793000000094", 450, 900, 50, 10, "unidad"],
      ["Plomería", "Codo PVC 40 mm", "7793000000100", 700, 1300, 35, 10, "unidad"],
    ],
    customers: [["Constructora Norte", 128000], ["Raúl (plomero)", 23500], ["Mónica Ibáñez", 0], ["Electricidad Gómez", 41200]],
    cart: ["7793000000025", "7793000000018", "7793000000056", "7793000000063", "7793000000032"],
    granel: { name: "Cable unipolar", grams: 15000 },
    warm: [[["7793000000056", "7793000000063"], "Efectivo"], [["7793000000032", "7793000000094"], "Débito"], [["7793000000070"], "Crédito"]],
  },
  ropa: {
    rubro: "ropa", name: "Tienda Alma",
    products: [
      ["Accesorios", "Medias pack x3", "7794000000015", 2500, 6900, 20, 6, "unidad"],
      ["Accesorios", "Gorra lisa", "7794000000022", 4000, 11900, 7, 3, "unidad"],
      ["Accesorios", "Cinturón de cuero", "7794000000039", 6000, 15900, 2, 3, "unidad"],
    ],
    variants: [
      ["Remeras", "Remera básica", "7794000000046", 6000, 14900, "Negro", [["S", 4], ["M", 6], ["L", 3], ["XL", 0]]],
      ["Remeras", "Remera oversize", "7794000000053", 7500, 18900, "Gris", [["M", 2], ["L", 3]]],
      ["Pantalones", "Jean mom", "7794000000060", 16000, 39900, "Celeste", [["36", 2], ["38", 3], ["40", 1], ["42", 0]]],
      ["Pantalones", "Jogger de frisa", "7794000000077", 11000, 27900, "Negro", [["S", 3], ["M", 4], ["L", 2]]],
      ["Abrigos", "Buzo canguro", "7794000000084", 15000, 36900, "Beige", [["M", 2], ["L", 2], ["XL", 1]]],
      ["Abrigos", "Campera rompeviento", "7794000000091", 24000, 58900, "Negro", [["M", 1], ["L", 2]]],
      ["Vestidos", "Vestido corto", "7794000000107", 14000, 34900, "Verde", [["S", 2], ["M", 2], ["L", 1]]],
      ["Calzado", "Zapatillas urbanas", "7794000000114", 30000, 69900, "Blanco", [["38", 2], ["39", 2], ["40", 3], ["41", 1], ["42", 0]]],
    ],
    customers: [["Camila Rossi", 39900], ["Lucas Fernández", 0], ["Brenda Molina", 14900]],
    cart: ["7794000000015", "7794000000022"],
    variantPick: "Jean mom",
    warm: [[["7794000000015", "7794000000022"], "Crédito"], [["7794000000039"], "Efectivo"]],
  },
  general: {
    rubro: "general", name: "Comercio Central",
    products: [
      ...ALMACEN,
      ["Librería", "Cuaderno A4 rayado", "7795000000012", 2500, 4200, 15, 5, "unidad"],
      ["Librería", "Birome azul", "7795000000029", 300, 700, 60, 20, "unidad"],
      ["Regalería", "Taza de cerámica", "7795000000036", 3000, 6500, 6, 2, "unidad"],
      ["Bazar", "Pilas AA x4", "7795000000043", 2400, 4500, 3, 6, "unidad"],
      ["Limpieza", "Lavandina 1 L", "7795000000050", 900, 1400, 30, 10, "unidad"],
    ],
    customers: FIADO,
    cart: ["7795000000012", "7795000000029", "7795000000029", "7791000000021", "7795000000043"],
    warm: [[["7791000000014", "7791000000052"], "Efectivo"], [["7791000000083", "7795000000036"], "Débito"], [["7795000000050", "7791000000045"], "Transferencia"]],
  },
};

async function seedEstetica() {
  await seed(COMMON, { rubro: "estetica", name: "Estudio Lu" });
  await seed(async () => {
    const prods = await import("/src/db/products.ts");
    const cats = await import("/src/db/categories.ts");
    const res = await import("/src/db/workshopResources.ts");
    const custs = await import("/src/db/customers.ts");
    const { getDb } = await import("/src/db/index.ts");
    const pros = {};
    for (const [n, s, p] of [["Lucía", 40, 10], ["Caro", 35, 10], ["Nico", 40, 15]]) {
      pros[n] = await res.createWorkshopResource({ name: n, commission_service_pct: s, commission_product_pct: p });
    }
    const svc = await cats.createCategory("Servicios");
    const prod = await cats.createCategory("Productos");
    for (const [n, price, dur] of [["Corte de pelo", 12000, 30], ["Corte y barba", 15000, 45], ["Coloración", 38000, 90], ["Lavado y peinado", 9000, 30], ["Alisado", 55000, 120], ["Manicura", 11000, 40]]) {
      const id = await prods.createProduct({ name: n, cost: 0, price, stock: 0, min_stock: 0, unit: "servicio", tax_rate: 0, category_id: svc, track_stock: false, product_kind: "prepared", prepare_mode: "on_demand", duration_min: dur });
      const db = await getDb();
      for (const r of Object.values(pros)) await db.execute("INSERT OR IGNORE INTO service_resources (product_id, resource_id) VALUES ($1,$2)", [id, r]);
    }
    for (const [n, cost, price, stock, min] of [["Shampoo profesional 1 L", 9000, 16000, 6, 2], ["Cera para peinar", 4000, 8500, 9, 3], ["Tintura (pomo)", 3500, 6500, 3, 5]]) {
      await prods.createProduct({ name: n, cost, price, stock, min_stock: min, unit: "unidad", tax_rate: 21, category_id: prod });
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
      ["12:00", "12:45", "Corte y barba", "Nico", 4, "scheduled"],
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
    for (const [n, price, dur, staff] of [
      ["Consulta odontológica", 25000, 30, [dra, dr]],
      ["Limpieza dental", 30000, 40, [dra]],
      ["Arreglo de caries", 45000, 45, [dra, dr]],
      ["Control de ortodoncia", 20000, 20, [dr]],
      ["Extracción", 50000, 45, [dr]],
      ["Blanqueamiento", 80000, 60, [dra]],
    ]) {
      const id = await prods.createProduct({ name: n, cost: 0, price, stock: 0, min_stock: 0, unit: "servicio", tax_rate: 0, category_id: cat, track_stock: false, product_kind: "prepared", prepare_mode: "on_demand", duration_min: dur });
      const db = await getDb();
      for (const r of staff) await db.execute("INSERT OR IGNORE INTO service_resources (product_id, resource_id) VALUES ($1,$2)", [id, r]);
    }
    const people = [
      ["Laura Giménez", "28456123"], ["Ricardo Pereyra", "17852963"], ["Florencia Díaz", "35741258"], ["Mateo Romero", "45123987"],
      ["Ana María Quiroga", "14785236"], ["Bruno Castro", "39654123"], ["Paula Méndez", "31258741"],
    ];
    const ids = [];
    for (const [n, dni] of people) ids.push(await custs.createCustomer({ name: n, document: dni, credit_limit: 0 }));
    const db = await getDb();
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const [a, b, title, rid, rname, c, st] of [
      ["08:30", "09:00", "Consulta odontológica", dra, "Dra. Paula Ríos", 0, "completed"],
      ["09:00", "09:40", "Limpieza dental", dra, "Dra. Paula Ríos", 1, "in_progress"],
      ["09:00", "09:20", "Control de ortodoncia", dr, "Dr. Martín Sosa", 3, "completed"],
      ["09:30", "10:15", "Extracción", dr, "Dr. Martín Sosa", 4, "confirmed"],
      ["10:00", "10:45", "Arreglo de caries", dra, "Dra. Paula Ríos", 2, "confirmed"],
      ["10:30", "11:00", "Consulta odontológica", dr, "Dr. Martín Sosa", 5, "scheduled"],
      ["11:00", "11:40", "Limpieza dental", dra, "Dra. Paula Ríos", 6, "scheduled"],
      ["11:30", "11:50", "Control de ortodoncia", dr, "Dr. Martín Sosa", 0, "scheduled"],
    ]) {
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
      ["Amortiguador delantero", 38000, 59000, 4, 2], ["Líquido de frenos 500 ml", 4500, 7800, 1, 3],
    ]) { P[n] = await prods.createProduct({ name: n, cost, price, stock, min_stock: min, unit: "unidad", tax_rate: 21, category_id: rep }); priceOf[n] = price; }
    for (const [n, price, dur] of [["Cambio de aceite y filtro", 18000, 45], ["Service completo", 65000, 180], ["Cambio de pastillas", 25000, 60], ["Alineación y balanceo", 30000, 60]]) {
      P[n] = await prods.createProduct({ name: n, cost: 0, price, stock: 0, min_stock: 0, unit: "servicio", tax_rate: 21, category_id: mo, track_stock: false, product_kind: "prepared", prepare_mode: "on_demand", duration_min: dur });
      priceOf[n] = price;
    }
    await res.createWorkshopResource({ name: "Elevador 1" });
    await res.createWorkshopResource({ name: "Elevador 2" });
    const data = [
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
    for (const [i, title, notes, items, status] of [
      [0, "Service de los 150.000 km", "Ruido al frenar y service general", ["Service completo", "Filtro de aceite", "Aceite 10W40 x 4 L", "Filtro de aire", "Bujías x4"], "in_progress"],
      [1, "Cambio de pastillas", "Pedal largo, chilla al frenar", ["Cambio de pastillas", "Pastillas de freno delanteras"], "ready"],
      [2, "Cambio de aceite", "Service de rutina", ["Cambio de aceite y filtro", "Filtro de aceite", "Aceite 10W40 x 4 L"], "pending"],
      [3, "Alineación y balanceo", "Tira hacia la derecha", ["Alineación y balanceo"], "pending"],
      [4, "Correa de distribución", "Cambio preventivo", ["Correa de distribución"], "waiting_parts"],
    ]) {
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
    await add(o, "Flan casero", 2);
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
    let imei = 356789104523410;
    for (const [n, costUsd, usdPrice, units] of [
      ["Smartphone Pro 128 GB", 520, 650, [["Negro", "nuevo", null], ["Blanco", "nuevo", null], ["Azul", "usado", 88]]],
      ["Smartphone Plus 256 GB", 330, 420, [["Azul", "nuevo", null], ["Negro", "nuevo", null]]],
      ["Smartphone Lite 128 GB", 200, 270, [["Grafito", "nuevo", null], ["Verde", "nuevo", null], ["Grafito", "nuevo", null]]],
      ["Smartphone Max 256 GB", 280, 360, [["Negro", "usado", 84], ["Violeta", "reacondicionado", 91]]],
    ]) {
      const id = await prods.createProduct({ name: n, cost: costUsd * RATE, price: usdPrice * RATE, stock: 0, min_stock: 1, unit: "unidad", tax_rate: 21, category_id: cel });
      await pu.saveProductPhoneFields(id, { serialized: true, price_usd: usdPrice, warranty_months_new: 12, warranty_months_used: 3 });
      for (const [color, condition, bat] of units) {
        imei += 7319;
        await pu.addUnit({ product_id: id, identifier: String(imei), identifier_kind: "imei", color, capacity: (n.match(/\d+ GB/) || [null])[0], condition, battery_pct: bat, cost: costUsd * RATE }, null);
      }
    }
    for (const [n, cost, price, stock] of [["Funda de silicona", 5000, 12000, 15], ["Cargador 20 W USB-C", 8000, 18000, 10], ["Vidrio templado 9H", 1500, 6000, 40], ["Auriculares inalámbricos", 12000, 25000, 2]]) {
      await prods.createProduct({ name: n, cost, price, stock, min_stock: 3, unit: "unidad", tax_rate: 21, category_id: acc });
    }
    await usd.saveUsdConfig({ mode: "fijo", casa: "blue", margin: 0 });
    await usd.saveUsdRate(RATE, "manual");
  });
}

/* ---------- acciones en la app ---------- */

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

async function closeDialogs() {
  for (let i = 0; i < 3 && (await page.getByRole("dialog").count()) > 0; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(400);
  }
}
async function clearCart() {
  await closeDialogs();
  await go("/pos", 1200);
  await posInput().click().catch(() => {});
  await page.keyboard.press("Escape");
  await sleep(400);
  const vaciar = page.getByRole("button", { name: "Sí, vaciar" });
  if (await vaciar.isVisible().catch(() => false)) await vaciar.click();
  await sleep(400);
}
async function granel(code, { grams, pesos } = {}, keepOpen = false) {
  const dlg = page.getByRole("dialog").filter({ hasText: "Venta a granel" });
  if (!(await dlg.isVisible().catch(() => false))) return false;
  const m = /^20\d{5}(\d{5})/.exec(code || "");
  const g = grams ?? (m ? Number(m[1]) : 1000);
  if (pesos) {
    await dlg.getByRole("button", { name: "Por importe ($)" }).dispatchEvent("click");
    await dlg.getByLabel("El cliente paga (pesos)").fill(String(pesos));
  } else {
    await dlg.getByRole("button", { name: "Por peso" }).dispatchEvent("click").catch(() => {});
    await dlg.getByRole("button", { name: "Gramos" }).dispatchEvent("click").catch(() => {});
    const f = dlg.getByLabel(/Peso en gramos|Cantidad/).first();
    if ((await f.inputValue().catch(() => "")) !== String(g)) await f.fill(String(g)).catch(() => {});
  }
  await sleep(700);
  if (keepOpen) return true;
  await dlg.getByRole("button", { name: "Agregar al carrito" }).dispatchEvent("click");
  await sleep(500);
  return true;
}
async function scan(code) {
  await posInput().fill(code);
  await page.keyboard.press("Enter");
  await sleep(600);
  await granel(code);
}
/** fill("") sobre un campo vacío manda Supr, y en la caja Supr quita el último producto. */
async function clearSearch() {
  if (!(await posInput().inputValue().catch(() => ""))) return;
  await posInput().selectText().catch(() => {});
  await page.keyboard.press("Backspace");
}
async function typeSearch(q) {
  await posInput().fill(q);
  await sleep(900);
}
async function clickResult(q) {
  const btn = page.getByRole("main").getByRole("button", { name: new RegExp(`^(?!Quitar|Restar|Sumar|Menos|Más).*${q}`, "i") }).first();
  await btn.dispatchEvent("click");
  await sleep(900);
}
const cobrarDialog = () => page.getByRole("dialog").filter({ hasText: "Cobrar venta" });
async function openCheckout() {
  const cobrar = cobrarDialog();
  if (!(await cobrar.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Finalizar venta" }).dispatchEvent("click");
    await cobrar.waitFor({ timeout: 10_000 });
  }
  await sleep(500);
  return cobrar;
}
async function pickMethod(cobrar, method) {
  await cobrar.getByRole("button", { name: new RegExp("^" + method) }).first().dispatchEvent("click");
  await sleep(400);
}
async function confirmCharge(cobrar) {
  for (const name of [/ticket de cocina/i, /Enviar el comprobante/i, /Imprimir/i]) {
    const box = cobrar.getByRole("checkbox", { name });
    if ((await box.count()) && (await box.first().isChecked({ timeout: 1000 }).catch(() => false))) await box.first().dispatchEvent("click");
  }
  await cobrar.getByRole("button", { name: /^Confirmar cobro/ }).dispatchEvent("click");
  await page.getByText(/Venta registrada/i).first().waitFor({ timeout: 40_000 });
  await sleep(900);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(500);
}
async function warmSales(list) {
  await clearCart();
  for (const [codes, method] of list) {
    for (const c of codes) await scan(c);
    const cobrar = await openCheckout();
    await pickMethod(cobrar, method);
    await confirmCharge(cobrar);
  }
}
async function noPrint() {
  await page.evaluate(() => {
    window.print = () => {};
  }).catch(() => {});
}

/* ---------- capturas por rubro ---------- */

async function retailShots(cfg) {
  await go("/stock", 2400); await shot("stock");
  await go("/productos", 2400); await shot("productos");
  await go("/clientes", 2400); await shot("clientes");
  await go("/reportes", 3000); await shot("reportes");
  await clearCart();
  for (const c of cfg.cart) await scan(c);
  if (cfg.variantPick) {
    await typeSearch(cfg.variantPick);
    await clickResult(cfg.variantPick);
    await shot("variantes");
    const dlg = page.getByRole("dialog").last();
    const opt = dlg.getByRole("button", { name: /38/ }).first();
    if (await opt.isVisible().catch(() => false)) await opt.dispatchEvent("click");
    await sleep(800);
    await closeDialogs();
  }
  await clearSearch();
  await sleep(600);
  await shot("caja");
  await openCheckout();
  await shot("cobrar");
  await closeDialogs();
  if (cfg.granel) {
    await typeSearch(cfg.granel.name);
    await clickResult(cfg.granel.name);
    if (await granel(null, cfg.granel, true)) await shot("granel");
    await closeDialogs();
  }
  await go("/", 3000); await shot("inicio");
}

const RUBROS = {
  ...Object.fromEntries(Object.entries(RETAIL).map(([dir, cfg]) => [dir, {
    seed: async () => {
      await seed(COMMON, { rubro: cfg.rubro, name: cfg.name });
      await seed(SEED_RETAIL, { products: cfg.products, customers: cfg.customers, variants: cfg.variants });
    },
    warm: () => warmSales(cfg.warm),
    shots: () => retailShots(cfg),
  }])),
  peluqueria: {
    seed: seedEstetica,
    warm: async () => {},
    shots: async () => {
      await go("/turnos", 2600); await shot("agenda");
      await go("/comisiones", 3000); await shot("comisiones");
      await go("/productos", 2400); await shot("servicios");
      await go("/clientes", 2400); await shot("clientes");
      await go("/turnos", 1800);
      await page.getByText("Nuevo turno").first().click().catch(() => {});
      await sleep(1400);
      await page.getByRole("button", { name: /Corte y barba · 45/ }).first().dispatchEvent("click").catch(() => {});
      await sleep(600);
      await shot("turno-nuevo");
      await closeDialogs();
      await go("/turnos", 1800);
      const btn = page.getByRole("button", { name: "Cobrar" }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.dispatchEvent("click");
        await sleep(2000);
        await shot("caja");
        await openCheckout();
        await shot("cobrar");
        await closeDialogs();
      }
      await go("/", 3000); await shot("inicio");
    },
  },
  clinica: {
    seed: seedClinica,
    warm: async () => {},
    shots: async () => {
      await go("/", 3000); await shot("inicio");
      await go("/agenda-profesional", 3000); await shot("agenda-profesional");
      await go("/turnos", 2600); await shot("turnos");
      await go("/productos", 2400); await shot("servicios");
      await go("/clientes", 2600); await shot("pacientes");
      await page.getByRole("button", { name: /Ficha/ }).nth(2).click().catch(() => {});
      await sleep(1600);
      const dlg = page.getByRole("dialog");
      for (const [tooth, taps] of [["16", 1], ["26", 1], ["36", 2], ["47", 3], ["14", 1]]) {
        const b = dlg.getByRole("button", { name: new RegExp(`^Diente ${tooth},`) }).first();
        for (let i = 0; i < taps; i++) { await b.dispatchEvent("click").catch(() => {}); await sleep(250); }
      }
      await sleep(800);
      await shot("ficha");
      await closeDialogs();
      await go("/turnos", 1800);
      await page.getByText("Nuevo turno").first().click().catch(() => {});
      await sleep(1400);
      await page.getByRole("button", { name: /^Limpieza dental/ }).first().dispatchEvent("click").catch(() => {});
      await sleep(800);
      await shot("turno-nuevo");
      await closeDialogs();
    },
  },
  taller: {
    seed: seedTaller,
    warm: async () => {},
    shots: async () => {
      await go("/ordenes", 2600); await shot("ordenes");
      await page.getByText("AB123CD").first().click().catch(() => {});
      await sleep(2200); await shot("orden-detalle");
      await go("/turnos", 2600); await shot("turnos");
      await go("/stock", 2400); await shot("stock");
      await go("/productos", 2400); await shot("productos");
      await go("/clientes", 2400); await shot("clientes");
      await go("/", 3000); await shot("inicio");
    },
  },
  gastronomia: {
    seed: seedGastronomia,
    warm: async () => {},
    shots: async () => {
      await go("/mesas", 2600); await shot("mesas");
      await page.getByRole("button", { name: /^Mesa 4/ }).first().click().catch(() => {});
      await sleep(2000); await shot("mesa-cuenta");
      await closeDialogs();
      await go("/productos", 2400); await shot("productos");
      await clearCart();
      await shot("caja-vacia");
      for (const n of ["Hamburguesa completa", "Papas fritas", "Limonada"]) {
        await page.getByRole("main").getByRole("button", { name: new RegExp("^" + n) }).first().dispatchEvent("click").catch(() => {});
        await sleep(700);
        await closeDialogs();
      }
      await shot("caja");
      await openCheckout();
      await shot("cobrar");
      await closeDialogs();
      await go("/", 3000); await shot("inicio");
    },
  },
  celulares: {
    seed: seedElectronica,
    warm: async () => {},
    shots: async () => {
      await go("/celulares", 2600); await shot("celulares");
      const q = page.getByPlaceholder(/IMEI, serie/i);
      await q.fill("356789104530729").catch(() => {});
      await page.getByRole("button", { name: "Buscar", exact: true }).click().catch(() => {});
      await sleep(2400); await shot("imei");
      await go("/stock", 2400); await shot("stock");
      await go("/productos", 2400); await shot("productos");
      await clearCart();
      await typeSearch("Smartphone Pro");
      await clickResult("Smartphone Pro");
      await sleep(800);
      await shot("caja-imei");
      const unit = page.getByRole("dialog").last().getByRole("button", { name: /Negro|Blanco|nuevo/i }).first();
      if (await unit.isVisible().catch(() => false)) { await unit.dispatchEvent("click"); await sleep(1200); }
      await scan("Funda").catch(() => {});
      await closeDialogs();
      await clearSearch();
      await sleep(500);
      await shot("caja");
      await openCheckout().catch(() => {});
      await shot("cobrar");
      await closeDialogs();
      await go("/", 3000); await shot("inicio");
    },
  },
};

/* ---------- principal ---------- */

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const list = only.length ? only : Object.keys(RUBROS);

page = await livePage();
await reload();
await sleep(4000);

for (const dir of list) {
  const cfg = RUBROS[dir];
  if (!cfg) { console.log("rubro desconocido", dir); continue; }
  console.log("==>", dir);
  outDir = path.join(OUT_ROOT, dir);
  fs.mkdirSync(outDir, { recursive: true });
  await bridge();
  await page.evaluate(async () => { await window.__GESTION_E2E__.warmDb(); });
  await invoke("e2e_ensure_baseline_template");
  await page.evaluate(async () => { await window.__GESTION_E2E__.closeDb(); window.__GESTION_E2E__.clearStorage(); });
  await invoke("e2e_reset_environment");
  await reload();
  await cfg.seed();
  await reload();
  await login();
  await noPrint();
  await expandSidebar();
  await openCash();
  try {
    await cfg.warm();
    await cfg.shots();
  } catch (e) {
    console.log("ERROR", dir, e.message.split("\n").slice(0, 6).join(" | "));
    await page.screenshot({ path: path.join(outDir, "_error.jpg"), type: "jpeg", quality: 70 }).catch(() => {});
  }
}

await browser.close();
