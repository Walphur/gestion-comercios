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

const TRANSCRIBE_PROMPT = `Esta imagen es un tique o factura de compra argentina (columnas Cant, Descripción, Precio, Total).
Transcribí SOLO las filas de productos, una por línea, con este formato exacto (usá | como separador):
CANT|DESCRIPCION_COMPLETA|PRECIO_UNITARIO|TOTAL_LINEA

Ejemplo:
9|1523-ALFAJOR TATIN NEGRO|122,49|1102,44
18|150-AGUA FRESH SABORIZA|209,98|3779,69

Reglas:
- CANT = cantidad (puede ser 9,00 o 9).
- DESCRIPCION_COMPLETA = código y nombre tal como en el papel (ej 687-COCA X 500 X12).
- PRECIO_UNITARIO = columna Precio (no el Total).
- No incluyas encabezados, totales, IVA ni pie de factura.
- Si una línea está cortada, igual intentá transcribirla.`;

const JSON_PROMPT = `Extraé los productos de esta factura argentina.
Respondé SOLO un JSON array, sin markdown:
[{"nombre":"...","codigo":"1523","cantidad":9,"costo":122.49}]
costo = precio unitario. cantidad = unidades. codigo = número al inicio de la descripción si hay.`;

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

function normalizeItem(row: Partial<InvoiceItem> & { nombre: string }): InvoiceItem {
  const cantidad = Number(row.cantidad ?? row.stock ?? 1);
  const costo = Number(row.costo ?? 0);
  return {
    nombre: row.nombre.trim(),
    barcode: row.barcode?.trim() || undefined,
    codigo: row.codigo?.trim() || undefined,
    cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
    costo: Number.isFinite(costo) && costo >= 0 ? costo : 0,
    stock: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
  };
}

/** Parsea líneas CANT|DESC|PRECIO|TOTAL del modelo. */
function parsePipeLines(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    let parts: string[];
    if (trimmed.includes("|")) {
      parts = trimmed.split("|").map((p) => p.trim());
    } else {
      const m = trimmed.match(
        /^([\d.,]+)\s+(\d+\s*[-–]\s*.+?)\s+([\d.,]+)\s+([\d.,]+)\s*$/,
      );
      if (!m) continue;
      parts = [m[1], m[2], m[3], m[4]];
    }

    if (parts.length < 3) continue;
    const cantidad = parseArgNumber(parts[0]);
    const desc = parts[1];
    const costo = parseArgNumber(parts[2]);
    if (!desc || cantidad <= 0) continue;

    const codeMatch = desc.match(/^(\d+)\s*[-–]\s*(.+)$/);
    items.push(
      normalizeItem({
        nombre: codeMatch?.[2]?.trim() ?? desc,
        codigo: codeMatch?.[1],
        cantidad,
        costo,
      }),
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
  if (start < 0 || end <= start) {
    throw new Error("sin_json");
  }
  const slice = trimmed.slice(start, end + 1);
  const raw = JSON.parse(slice) as unknown;
  if (!Array.isArray(raw)) throw new Error("sin_json");

  const items: InvoiceItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const nombre = String(r.nombre ?? r.name ?? r.descripcion ?? "").trim();
    if (!nombre) continue;
    items.push(
      normalizeItem({
        nombre,
        barcode: String(r.barcode ?? r.ean ?? "").trim() || undefined,
        codigo: String(r.codigo ?? r.sku ?? "").trim() || undefined,
        cantidad: Number(r.cantidad ?? r.qty ?? r.stock ?? 1),
        costo: Number(r.costo ?? r.cost ?? r.precio ?? 0),
      }),
    );
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

  const transcribed = await runVision(env, imageBase64, mimeType, TRANSCRIBE_PROMPT);
  console.log("[factura-ia] transcribe sample:", transcribed.slice(0, 400));

  let items = parsePipeLines(transcribed);
  if (items.length > 0) return items;

  try {
    items = parseItemsFromJsonText(transcribed);
    if (items.length > 0) return items;
  } catch {
    /* seguir */
  }

  const jsonText = await runVision(env, imageBase64, mimeType, JSON_PROMPT);
  console.log("[factura-ia] json sample:", jsonText.slice(0, 400));
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
