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

/** Una sola pasada: mayorista y tique kiosco */
const UNIFIED_PROMPT = `Transcribí TODOS los productos de esta factura argentina de compra.

TIPO A — Factura mayorista / FACTURA CONTADO (columnas PRODUCTO, DETALLE, CANTIDAD, PRECIO UNITARIO):
CODIGO|DETALLE|PACKS|PRECIO_PACK
- CODIGO = columna PRODUCTO (ej 100454). Copiá exacto, no inventes.
- DETALLE = texto completo de la columna DETALLE (incluye 1x8, X6, etc.).
- PACKS = columna CANTIDAD en bultos (1,00 → 1; 2,00 → 2).
- PRECIO_PACK = PRECIO UNITARIO del bulto.

TIPO B — Tique kiosco (Cant, Descripción, Precio):
CANT|DESCRIPCION|PRECIO|TOTAL

Reglas:
- Una línea por producto, separador |
- Sin encabezados, totales, IVA ni texto extra
- Si hay muchas filas, transcribí todas

Ejemplos tipo A:
100454|Coca-Cola 2.5L Bot Polic R 1x8|1|15234.50
100103|COCA-COLA 1,25L BT VIDR R 1X8|2|9876.00`;

const JSON_FALLBACK_PROMPT = `Lista TODOS los productos de esta factura argentina.
JSON array sin markdown:
[{"codigo":"100454","nombre":"detalle completo","packs":1,"costo":15000}]
codigo=PRODUCTO si existe; packs=bultos; costo=precio del bulto.`;

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
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  if (s.includes(",")) {
    return parseFloat(s.replace(",", "."));
  }
  return parseFloat(s);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function extractPackMultiplier(detalle: string): number {
  const candidates: number[] = [];
  for (const m of detalle.matchAll(/(?:^|[\s(])(?:1\s*)?[xX]\s*(\d+)/gi)) {
    const n = parseInt(m[1], 10);
    if (n >= 2 && n <= 48) candidates.push(n);
  }
  for (const m of detalle.matchAll(/[xX](\d+)(?!\d)/g)) {
    const n = parseInt(m[1], 10);
    if (n >= 2 && n <= 48) candidates.push(n);
  }
  return candidates.length ? candidates[candidates.length - 1]! : 1;
}

function finalizeStock(
  codigo: string | undefined,
  detalle: string,
  packs: number,
  costoPack: number,
): InvoiceItem {
  const mult = extractPackMultiplier(detalle);
  const stockUnits = Math.round(packs * mult);
  const unitCost = mult > 1 && costoPack > 0 ? costoPack / mult : costoPack;
  return {
    nombre: detalle.trim(),
    codigo: codigo?.trim() || undefined,
    packs: round2(packs),
    unidades_por_pack: mult,
    cantidad: stockUnits,
    stock: stockUnits,
    costo: round2(unitCost),
  };
}

function isDistributorCode(s: string): boolean {
  return /^\d{4,9}$/.test(s.trim());
}

function normalizeLine(line: string): string {
  return line
    .trim()
    .replace(/\t/g, "|")
    .replace(/[;]/g, "|")
    .replace(/\s*\|\s*/g, "|");
}

function parsePipeLines(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = normalizeLine(rawLine);
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^(producto|detalle|cantidad|codigo|tipo|ejemplo)/i.test(trimmed)) continue;

    if (!trimmed.includes("|")) {
      const m = trimmed.match(
        /^([\d.,]+)\s+(\d+\s*[-–]\s*.+?)\s+([\d.,]+)\s+([\d.,]+)\s*$/,
      );
      if (!m) continue;
      const packs = parseArgNumber(m[1]);
      const desc = m[2];
      const costo = parseArgNumber(m[3]);
      const codeMatch = desc.match(/^(\d+)\s*[-–]\s*(.+)$/);
      const codigo = codeMatch?.[1];
      const nombre = codeMatch?.[2]?.trim() ?? desc;
      const item = finalizeStock(codigo, nombre, packs, costo);
      const key = `${item.codigo ?? ""}|${item.nombre}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
      continue;
    }

    const parts = trimmed.split("|").map((p) => p.trim());
    if (parts.length < 3) continue;

    if (parts.length >= 4 && isDistributorCode(parts[0])) {
      const packs = parseArgNumber(parts[2]);
      const costoPack = parseArgNumber(parts[3]);
      if (!parts[1] || packs <= 0) continue;
      const item = finalizeStock(parts[0], parts[1], packs, costoPack);
      const key = `${item.codigo}|${item.nombre}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
      continue;
    }

    const packs = parseArgNumber(parts[0]);
    const desc = parts[1];
    const costo = parseArgNumber(parts[2]);
    if (!desc || packs <= 0) continue;

    const codeMatch = desc.match(/^(\d+)\s*[-–]\s*(.+)$/);
    const item = finalizeStock(
      codeMatch?.[1],
      codeMatch?.[2]?.trim() ?? desc,
      packs,
      costo,
    );
    const key = `${item.codigo ?? ""}|${item.nombre}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}

/** Si la IA no usó pipes, buscar filas con código de 6 dígitos + detalle + cantidad */
function parseDistributorFallback(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = line.match(
      /^(\d{6})\s+(.+?)\s+(\d+[,.]\d{2}|\d+)\s+([\d.,]+)/,
    );
    if (!m) continue;

    const codigo = m[1];
    let detalle = m[2].trim();
    const packs = parseArgNumber(m[3]);
    const costoPack = parseArgNumber(m[4]);
    if (packs <= 0 || !detalle) continue;

    detalle = detalle.replace(/\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+.*$/, "").trim();
    const item = finalizeStock(codigo, detalle, packs, costoPack);
    const key = `${item.codigo}|${item.nombre}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}

function countDistributorHints(text: string): number {
  return (text.match(/\b\d{6}\b/g) ?? []).length;
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

    const codigo = String(r.codigo ?? r.producto ?? r.sku ?? "").trim() || undefined;
    const packs = Number(r.packs ?? r.cantidad_packs ?? r.bultos ?? r.cantidad ?? 1);
    const costoPack = Number(r.costo ?? r.cost ?? r.precio ?? r.precio_pack ?? 0);

    items.push(finalizeStock(codigo, nombre, packs > 0 ? packs : 1, costoPack));
  }
  if (items.length === 0) throw new Error("sin_json");
  return items;
}

function parseAnyFormat(text: string): InvoiceItem[] {
  let items = parsePipeLines(text);
  if (items.length > 0) return items;

  if (countDistributorHints(text) >= 2) {
    items = parseDistributorFallback(text);
    if (items.length > 0) return items;
  }

  try {
    return parseItemsFromJsonText(text);
  } catch {
    return [];
  }
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
    temperature: 0.05,
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
          { error: "La lectura tardó demasiado. Tocá de nuevo «Leer factura con IA» (se reintenta solo)." },
          504,
        );
      }
      if (msg === "sin_productos") {
        return json(
          {
            error:
              "La IA no pudo transcribir los productos. Probá otra vez o sacá la foto más de cerca, con buena luz.",
          },
          422,
        );
      }
      return json(
        {
          error:
            "Error temporal del servicio. Esperá 5 segundos y tocá «Leer factura con IA» otra vez.",
        },
        502,
      );
    }
  },
} satisfies ExportedHandler<Env>;
