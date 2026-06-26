export interface Env {
  AI: Ai;
}

interface InvoiceItem {
  nombre: string;
  barcode?: string;
  codigo?: string;
  cantidad: number;
  costo: number;
  precio?: number;
  stock?: number;
  packs?: number;
  unidades_por_pack?: number;
  tipo?: "mayorista" | "tique";
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

let licenseAccepted = false;

async function ensureVisionLicense(env: Env): Promise<void> {
  if (licenseAccepted) return;
  try {
    await env.AI.run(MODEL, { prompt: "agree" });
  } catch {
    /* ya aceptada */
  }
  licenseAccepted = true;
}

const UNIFIED_PROMPT = `Sos un transcriptor de facturas argentinas. Leé SOLO esta imagen.

REGLAS CRÍTICAS:
- Transcribí ÚNICAMENTE filas que veas en ESTA imagen.
- NO inventes productos. NO repitas ejemplos. NO uses memoria de otras facturas.
- Una línea por producto, separador |

Detectá el tipo de factura:

TIPO A — Mayorista / FACTURA CONTADO (PRODUCTO, DETALLE, CANTIDAD, PRECIO UNITARIO):
CODIGO|DETALLE|PACKS|PRECIO_PACK
- CODIGO = columna PRODUCTO (numérico).
- PACKS = CANTIDAD en bultos.
- PRECIO_PACK = PRECIO UNITARIO del bulto (no el total de la fila).

TIPO B — Tique o Factura B (Cant, Descripción, Precio, Total):
CANT|DESCRIPCION|PRECIO_UNITARIO|TOTAL_LINEA
- CANT = columna Cant (unidades o packs comprados).
- PRECIO_UNITARIO = columna Precio (costo por unidad).
- TOTAL_LINEA = columna Total (importe de la fila = cant × precio, con descuentos si hay).
- NUNCA pongas el Total en PRECIO_UNITARIO.

TIPO C — Distribuidor petshop / alimento (Quantity, Item, Unit Price, Amount):
CANT|CODIGO DESCRIPCION|PRECIO_UNITARIO|TOTAL_LINEA
(o: CANT|CODIGO|DESCRIPCION|PRECIO_UNITARIO|TOTAL_LINEA)
- CODIGO = al inicio del Item (ej PR114046, ZD101000).
- PRECIO_UNITARIO = columna Unit Price (ej $50 055,49). NO uses Amount/Total como unitario.
- TOTAL_LINEA = columna Amount (total de la fila).
- NO incluyas filas de bonificación, descuento ZD o importes negativos.

Si la factura tiene Precio y Total, devolvé las 4 columnas.
Sin encabezados, sin subtotales, sin IVA, sin pie de página.`;

const JSON_FALLBACK_PROMPT = `Lista SOLO los productos visibles en esta factura argentina (nada inventado).
JSON array sin markdown:
[{"codigo":"PR114046","nombre":"AGILITY CATS ADULTO X 10 KG","cant":3,"precio_unit":50055.49,"total_linea":150166.47}]
O tique: {"nombre":"...","cant":9,"precio_unit":122.49,"total_linea":1102.44}`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

function extractModelText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.response === "string") return r.response;
    if (r.result && typeof r.result === "object") {
      const inner = r.result as Record<string, unknown>;
      if (typeof inner.response === "string") return inner.response;
    }
    const choices = r.choices as Array<{ message?: { content?: string } }> | undefined;
    if (choices?.[0]?.message?.content) return String(choices[0].message.content);
  }
  return JSON.stringify(result);
}

function parseArgNumber(raw: string): number {
  let s = raw.trim().replace(/^\$/, "").replace(/%/g, "");
  const neg = /^-/.test(s) || /^−/.test(s);
  s = s.replace(/^[−-]/, "").replace(/\s/g, "");
  if (!s) return 0;
  let n: number;
  if (s.includes(",") && s.includes(".")) {
    n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  } else if (s.includes(",")) {
    n = parseFloat(s.replace(",", "."));
  } else {
    n = parseFloat(s);
  }
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function near(a: number, b: number, rel = 0.02): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(a - b) <= Math.max(0.02, rel * Math.max(a, b));
}

function isWeightUnitAfter(detalle: string, index: number, matchLen: number): boolean {
  const after = detalle.slice(index + matchLen);
  return /^\s*(kg|kgs|gr|g|ml|lt|l)\b/i.test(after);
}

export function extractPackMultiplier(detalle: string): number {
  const candidates: number[] = [];
  for (const m of detalle.matchAll(/(?:^|[\s(])(?:1\s*)?[xX]\s*(\d+)/gi)) {
    if (isWeightUnitAfter(detalle, m.index ?? 0, m[0].length)) continue;
    const n = parseInt(m[1], 10);
    if (n >= 2 && n <= 48) candidates.push(n);
  }
  for (const m of detalle.matchAll(/[xX]\s*(\d+)(?!\d)/gi)) {
    if (isWeightUnitAfter(detalle, m.index ?? 0, m[0].length)) continue;
    const n = parseInt(m[1], 10);
    if (n >= 2 && n <= 48) candidates.push(n);
  }
  return candidates.length ? candidates[candidates.length - 1]! : 1;
}

function cleanProductName(desc: string): string {
  return desc
    .trim()
    .replace(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]\d{2})$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function resolveUnitCost(
  cant: number,
  stockUnits: number,
  precioCol: number,
  totalCol: number,
): number {
  if (stockUnits <= 0) stockUnits = Math.max(1, Math.round(cant));

  if (totalCol > 0) {
    const unitFromTotal = totalCol / stockUnits;
    const unitFromCant = cant > 0 ? totalCol / cant : unitFromTotal;

    if (precioCol <= 0) return round2(unitFromTotal);

    // Precio y Total iguales con cant>1 → confundió Total con unitario
    if (cant > 1 && near(precioCol, totalCol, 0.01)) {
      return round2(unitFromCant / (stockUnits > cant ? stockUnits / cant : 1));
    }

    // precio × cant ≈ total → precio es unitario (por pack o unidad)
    if (cant > 0 && near(precioCol * cant, totalCol, 0.03)) {
      if (stockUnits > cant) return round2(precioCol / (stockUnits / cant));
      return round2(precioCol);
    }

    // precio × stock ≈ total
    if (near(precioCol * stockUnits, totalCol, 0.03)) {
      return round2(precioCol);
    }

    // precio mucho mayor que total/cant → tomó total como precio
    if (precioCol > unitFromCant * 1.4) {
      return round2(unitFromTotal);
    }

    // Preferir total/stock (incluye descuentos de línea)
    if (unitFromTotal > 0 && unitFromTotal < precioCol * 1.05) {
      return round2(unitFromTotal);
    }
  }

  if (precioCol > 0 && stockUnits > cant && stockUnits > 1) {
    return round2(precioCol / (stockUnits / cant));
  }

  return round2(precioCol);
}

function finalizeDistributor(
  codigo: string,
  detalle: string,
  packs: number,
  precioPack: number,
): InvoiceItem {
  const mult = extractPackMultiplier(detalle);
  const stockUnits = Math.round(packs * mult);
  const unitCost = mult > 1 && precioPack > 0 ? precioPack / mult : precioPack;
  return {
    nombre: cleanProductName(detalle),
    codigo: codigo.trim(),
    packs: round2(packs),
    unidades_por_pack: mult,
    cantidad: stockUnits,
    stock: stockUnits,
    costo: round2(unitCost),
    tipo: "mayorista",
  };
}

function finalizeTicket(
  cant: number,
  desc: string,
  precioCol: number,
  totalCol: number,
): InvoiceItem {
  const mult = extractPackMultiplier(desc);
  const stockUnits = Math.round(cant * mult);
  const unitCost = resolveUnitCost(cant, stockUnits, precioCol, totalCol);
  return {
    nombre: cleanProductName(desc),
    packs: round2(cant),
    unidades_por_pack: mult,
    cantidad: stockUnits,
    stock: stockUnits,
    costo: unitCost,
    tipo: "tique",
  };
}

function isDistributorCode(s: string): boolean {
  return /^\d{5,9}$/.test(s.trim());
}

function isSupplierCode(s: string): boolean {
  const t = s.trim();
  return /^(?:PR|ZD|AR|SKU)?\d{4,}$/i.test(t) || /^[A-Z]{1,4}\d{4,}$/i.test(t);
}

function splitItemCodeDesc(item: string): { codigo?: string; nombre: string } {
  const t = item.trim();
  const m = t.match(/^([A-Z]{1,4}\d{4,})\s+(.+)$/i);
  if (m) return { codigo: m[1].toUpperCase(), nombre: m[2].trim() };
  const m2 = t.match(/^(\d{5,9})\s+(.+)$/);
  if (m2) return { codigo: m2[1], nombre: m2[2].trim() };
  return { nombre: t };
}

function isBonificacion(desc: string, precioUnit: number, totalLine: number): boolean {
  if (/bonificaci[oó]n/i.test(desc)) return true;
  if (/^ZD\d/i.test(desc.trim())) return true;
  if (precioUnit < 0 || totalLine < 0) return true;
  if (/%/.test(desc) && precioUnit <= 0) return true;
  return false;
}

function finalizePetshop(
  cant: number,
  codigo: string | undefined,
  desc: string,
  precioUnit: number,
  totalLine: number,
): InvoiceItem | null {
  if (!desc || cant <= 0 || cant > 9999) return null;
  if (isBonificacion(desc, precioUnit, totalLine)) return null;

  const mult = extractPackMultiplier(desc);
  const stockUnits = mult > 1 ? Math.round(cant * mult) : Math.round(cant);
  const unitCost = resolveUnitCost(cant, stockUnits, precioUnit, totalLine);

  return {
    nombre: cleanProductName(desc),
    codigo: codigo?.trim() || undefined,
    packs: round2(cant),
    unidades_por_pack: mult > 1 ? mult : 1,
    cantidad: stockUnits,
    stock: stockUnits,
    costo: unitCost,
    tipo: "tique",
  };
}

function isTicketCant(s: string): boolean {
  const n = parseArgNumber(s);
  return n > 0 && n <= 999;
}

function normalizeLine(line: string): string {
  return line
    .trim()
    .replace(/\t/g, "|")
    .replace(/[;]/g, "|")
    .replace(/\s*\|\s*/g, "|");
}

function normNameKey(name: string): string {
  return cleanProductName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parsePipeLines(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = normalizeLine(rawLine);
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^(producto|detalle|cantidad|codigo|tipo|ejemplo|regla)/i.test(trimmed)) continue;
    if (/coca-cola|100454|100103/i.test(trimmed)) continue;

    if (!trimmed.includes("|")) {
      const m = trimmed.match(
        /^([\d.,]+)\s+(\d+\s*[-–]\s*.+?)\s+([\d.,]+)\s+([\d.,]+)\s*$/,
      );
      if (!m) continue;
      items.push(
        finalizeTicket(
          parseArgNumber(m[1]),
          m[2],
          parseArgNumber(m[3]),
          parseArgNumber(m[4]),
        ),
      );
      continue;
    }

    const parts = trimmed.split("|").map((p) => p.trim());
    if (parts.length < 3) continue;

    // Petshop: CANT|CODIGO|DESCRIPCION|PRECIO|TOTAL (5+ cols, a veces con IVA)
    if (parts.length >= 5 && isTicketCant(parts[0]) && isSupplierCode(parts[1])) {
      const cant = parseArgNumber(parts[0]);
      let precioIdx = 3;
      let totalIdx = 4;
      if (/%/.test(parts[3])) {
        precioIdx = 4;
        totalIdx = 5;
      }
      if (parts.length <= totalIdx) continue;
      const item = finalizePetshop(
        cant,
        parts[1],
        parts[2],
        parseArgNumber(parts[precioIdx]),
        parseArgNumber(parts[totalIdx]),
      );
      if (item) items.push(item);
      continue;
    }

    if (parts.length >= 4 && isDistributorCode(parts[0])) {
      const packs = parseArgNumber(parts[2]);
      const costoPack = parseArgNumber(parts[3]);
      if (!parts[1] || packs <= 0 || packs > 500) continue;
      items.push(finalizeDistributor(parts[0], parts[1], packs, costoPack));
      continue;
    }

    if (parts.length >= 4 && isTicketCant(parts[0])) {
      const cant = parseArgNumber(parts[0]);
      const itemField = parts[1];
      let precioIdx = 2;
      let totalIdx = 3;
      if (/%/.test(parts[2]) && parts.length >= 5) {
        precioIdx = 3;
        totalIdx = 4;
      }
      if (/%/.test(parts[3]) && parts.length >= 6) {
        precioIdx = 4;
        totalIdx = 5;
      }
      const precio = parseArgNumber(parts[precioIdx]);
      const total = parseArgNumber(parts[totalIdx] ?? "0");
      const { codigo, nombre } = splitItemCodeDesc(itemField);
      if (!nombre) continue;
      const item = finalizePetshop(cant, codigo, nombre, precio, total);
      if (item) items.push(item);
      continue;
    }

    if (parts.length >= 3 && isTicketCant(parts[0])) {
      const cant = parseArgNumber(parts[0]);
      const desc = parts[1];
      const precio = parseArgNumber(parts[2]);
      const total = parts.length >= 4 ? parseArgNumber(parts[3]) : 0;
      if (!desc || cant <= 0 || cant > 999) continue;
      items.push(finalizeTicket(cant, desc, precio, total));
    }
  }
  return items;
}

function parseDistributorFallback(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(/^(\d{6})\s+(.+?)\s+(\d+[,.]\d{2}|\d+)\s+([\d.,]+)/);
    if (!m) continue;
    const packs = parseArgNumber(m[3]);
    if (packs <= 0 || packs > 500) continue;
    let detalle = m[2].trim().replace(/\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+.*$/, "").trim();
    items.push(finalizeDistributor(m[1], detalle, packs, parseArgNumber(m[4])));
  }
  return items;
}

function countDistributorHints(text: string): number {
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/^\d{6}\|/.test(normalizeLine(line))) n++;
  }
  return n;
}

function parseItemsFromJsonText(text: string): InvoiceItem[] {
  let trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) trimmed = fence[1].trim();

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("sin_json");

  const raw = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  if (!Array.isArray(raw)) throw new Error("sin_json");

  const items: InvoiceItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const nombre = String(r.nombre ?? r.name ?? r.detalle ?? r.descripcion ?? "").trim();
    if (!nombre) continue;

    const codigo = String(r.codigo ?? r.producto ?? "").trim();
    if (codigo && (isDistributorCode(codigo) || isSupplierCode(codigo))) {
      const packs = Number(r.packs ?? r.cantidad_packs ?? r.bultos ?? r.cantidad ?? r.cant ?? 1);
      const costoPack = Number(r.precio_pack ?? r.precio_unit ?? r.costo ?? r.cost ?? r.precio ?? 0);
      const total = Number(r.total_linea ?? r.total ?? 0);
      if (isSupplierCode(codigo) && !isDistributorCode(codigo)) {
        const item = finalizePetshop(
          packs > 0 ? packs : 1,
          codigo,
          nombre,
          costoPack,
          total,
        );
        if (item) items.push(item);
        continue;
      }
      items.push(
        finalizeDistributor(codigo, nombre, packs > 0 ? packs : 1, costoPack),
      );
      continue;
    }

    const cant = Number(r.cant ?? r.cantidad ?? r.qty ?? 1);
    const precio = Number(r.precio_unit ?? r.precio ?? r.costo ?? 0);
    const total = Number(r.total_linea ?? r.total ?? 0);
    items.push(finalizeTicket(cant > 0 ? cant : 1, nombre, precio, total));
  }
  if (items.length === 0) throw new Error("sin_json");
  return items;
}

function scoreItem(item: InvoiceItem): number {
  let s = 0;
  if (item.costo > 0 && item.costo < 500_000) s += 10;
  if (item.stock && item.stock > 0 && item.stock <= 5000) s += 5;
  if (item.packs && item.packs <= 200) s += 3;
  if (item.nombre.length >= 3 && item.nombre.length < 120) s += 2;
  if (/\d{5,}/.test(item.nombre)) s -= 5;
  if ((item.packs ?? 1) > 200) s -= 20;
  if ((item.stock ?? 0) > 5000) s -= 20;
  if (item.costo <= 0) s -= 3;
  return s;
}

function sanitizeItems(items: InvoiceItem[], rawText: string): InvoiceItem[] {
  const distributor = countDistributorHints(rawText) >= 3;
  const byName = new Map<string, InvoiceItem>();

  for (const item of items) {
    if (!item.nombre || item.nombre.length < 2) continue;
    if (/bonificaci[oó]n/i.test(item.nombre)) continue;
    if (item.costo < 0 || item.costo > 2_000_000) continue;

    if (!distributor) {
      if ((item.packs ?? 1) > 200) continue;
      if ((item.stock ?? 0) > 5000) continue;
    } else {
      if ((item.packs ?? 1) > 500) continue;
    }

    const key = `${item.codigo ?? ""}|${normNameKey(item.nombre)}`;
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev || scoreItem(item) > scoreItem(prev)) {
      byName.set(key, item);
    }
  }

  return [...byName.values()];
}

function parseAnyFormat(text: string): InvoiceItem[] {
  let items = parsePipeLines(text);
  if (items.length === 0 && countDistributorHints(text) >= 2) {
    items = parseDistributorFallback(text);
  }
  if (items.length === 0) {
    try {
      items = parseItemsFromJsonText(text);
    } catch {
      items = [];
    }
  }
  return sanitizeItems(items, text);
}

async function runVision(env: Env, imageBase64: string, mimeType: string, prompt: string): Promise<string> {
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: 8192,
    temperature: 0,
  });
  return extractModelText(result);
}

async function runVisionWithRetry(
  env: Env,
  imageBase64: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runVision(env, imageBase64, mimeType, prompt);
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

async function extractItems(env: Env, imageBase64: string, mimeType: string): Promise<InvoiceItem[]> {
  await ensureVisionLicense(env);

  const mainText = await runVisionWithRetry(env, imageBase64, mimeType, UNIFIED_PROMPT);
  console.log("[factura-ia] unified sample:", mainText.slice(0, 600));
  let items = parseAnyFormat(mainText);
  if (items.length > 0) return items;

  const jsonText = await runVisionWithRetry(env, imageBase64, mimeType, JSON_FALLBACK_PROMPT);
  console.log("[factura-ia] json fallback sample:", jsonText.slice(0, 400));
  items = parseAnyFormat(jsonText);
  if (items.length > 0) return items;

  throw new Error("sin_productos");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== "POST") {
      return json({ error: "Usá POST con image_base64." }, 405);
    }

    let body: { image_base64?: string; mime_type?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON inválido." }, 400);
    }

    const imageBase64 = body.image_base64?.trim();
    if (!imageBase64) {
      return json({ error: "Falta image_base64." }, 400);
    }
    if (imageBase64.length > 12_000_000) {
      return json({ error: "Imagen demasiado grande. Usá una foto más chica." }, 413);
    }

    const mimeType = body.mime_type?.trim() || "image/jpeg";

    try {
      const items = await extractItems(env, imageBase64, mimeType);
      return json({ items });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[factura-ia]", msg);
      if (msg.includes("agree") || msg.includes("5016")) {
        licenseAccepted = false;
        return json(
          { error: "Falta activar el modelo de visión en Cloudflare. Reintentá en unos segundos." },
          502,
        );
      }
      if (msg.includes("timeout") || msg.includes("1101") || msg.includes("1042")) {
        return json(
          { error: "La lectura tardó demasiado. Tocá de nuevo «Leer factura con IA»." },
          504,
        );
      }
      if (msg === "sin_productos") {
        return json(
          {
            error:
              "La IA no pudo transcribir los productos. Probá otra vez con mejor luz y más cerca.",
          },
          422,
        );
      }
      return json(
        { error: "Error temporal del servicio. Esperá 5 segundos y probá de nuevo." },
        502,
      );
    }
  },
} satisfies ExportedHandler<Env>;
