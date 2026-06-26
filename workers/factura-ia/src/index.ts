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

/** Factura mayorista: PRODUCTO | DETALLE | CANTIDAD (packs) | PRECIO UNITARIO */
const DISTRIBUTOR_PROMPT = `Esta imagen es una FACTURA CONTADO de distribuidor (Coca-Cola, mayorista, etc.).
Columnas: PRODUCTO, DETALLE, CANTIDAD, PRECIO UNITARIO (+ impuestos que ignorás).

Transcribí SOLO filas de productos. Una línea por producto, formato exacto con |:
CODIGO|DETALLE|PACKS|PRECIO_PACK

- CODIGO = columna PRODUCTO (código numérico, ej 100454). NUNCA inventes otro código.
- DETALLE = columna DETALLE completa (ej "Coca-Cola 2.5L Bot Polic R 1x8").
- PACKS = columna CANTIDAD en bultos/packs (1,00 → 1; 2,00 → 2).
- PRECIO_PACK = columna PRECIO UNITARIO del bulto (sin IVA si hay columna aparte).

Ejemplos:
100454|Coca-Cola 2.5L Bot Polic R 1x8|1|15234.50
100103|COCA-COLA 1,25L BT VIDR R 1X8|2|9876.00
100860|CEPITA HF NARANJA TEN 1500 X 4|1|5432.10

No incluyas totales, IVA, percepciones ni encabezados.`;

/** Tique kiosco: Cant | Descripción | Precio */
const TICKET_PROMPT = `Tique o factura B de kiosco (columnas Cant, Descripción, Precio, Total).
Una línea por producto:
CANT|DESCRIPCION|PRECIO_UNITARIO|TOTAL_LINEA

Ejemplo:
9|1523-ALFAJOR TATIN NEGRO|122,49|1102,44`;

const JSON_PROMPT = `Extraé productos de esta factura de compra argentina.
JSON array solo, sin markdown:
[{"codigo":"100454","nombre":"detalle completo","packs":1,"costo":15000}]
codigo=columna PRODUCTO si existe; packs=cantidad de bultos; costo=precio unitario del bulto.`;

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

function parsePipeLines(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

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
      items.push(finalizeStock(codigo, nombre, packs, costo));
      continue;
    }

    const parts = trimmed.split("|").map((p) => p.trim());
    if (parts.length < 3) continue;

    if (parts.length >= 4 && isDistributorCode(parts[0])) {
      const packs = parseArgNumber(parts[2]);
      const costoPack = parseArgNumber(parts[3]);
      if (!parts[1] || packs <= 0) continue;
      items.push(finalizeStock(parts[0], parts[1], packs, costoPack));
      continue;
    }

    const packs = parseArgNumber(parts[0]);
    const desc = parts[1];
    const costo = parseArgNumber(parts[2]);
    if (!desc || packs <= 0) continue;

    const codeMatch = desc.match(/^(\d+)\s*[-–]\s*(.+)$/);
    items.push(
      finalizeStock(
        codeMatch?.[1],
        codeMatch?.[2]?.trim() ?? desc,
        packs,
        costo,
      ),
    );
  }
  return items;
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

async function extractItems(env: Env, imageBase64: string, mimeType: string): Promise<InvoiceItem[]> {
  await ensureVisionLicense(env);

  const distributorText = await runVision(env, imageBase64, mimeType, DISTRIBUTOR_PROMPT);
  console.log("[factura-ia] distributor sample:", distributorText.slice(0, 500));
  let items = parsePipeLines(distributorText);
  if (items.length >= 2) return items;

  const ticketText = await runVision(env, imageBase64, mimeType, TICKET_PROMPT);
  console.log("[factura-ia] ticket sample:", ticketText.slice(0, 500));
  items = parsePipeLines(ticketText);
  if (items.length > 0) return items;

  try {
    items = parseItemsFromJsonText(ticketText);
    if (items.length > 0) return items;
  } catch {
    /* seguir */
  }

  const jsonText = await runVision(env, imageBase64, mimeType, JSON_PROMPT);
  items = parsePipeLines(jsonText);
  if (items.length > 0) return items;
  return parseItemsFromJsonText(jsonText);
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
      return json(
        {
          error:
            "No pudimos leer los productos de esa foto. Probá con mejor luz, más cerca, o usá «Ingreso compra» con el lector.",
        },
        502,
      );
    }
  },
} satisfies ExportedHandler<Env>;
