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

/** Meta exige enviar prompt "agree" una vez antes del modelo vision. */
async function ensureVisionLicense(env: Env): Promise<void> {
  if (licenseAccepted) return;
  try {
    await env.AI.run(MODEL, { prompt: "agree" });
  } catch {
    /* ya aceptada en esta cuenta */
  }
  licenseAccepted = true;
}

const EXTRACT_PROMPT = `Analizá esta factura o tique de compra argentino (Factura A/B, remito, distribuidor).
Suele tener columnas: Cant / Descripción / Precio / Total.
Extraé CADA línea de producto.
Respondé ÚNICAMENTE con un JSON array válido (sin markdown, sin texto extra).
Cada objeto:
{"nombre":"descripción del producto","barcode":"","codigo":"código interno si aparece (ej 1523)","cantidad":número,"costo":número}
- "costo" = precio unitario de la columna Precio (compra).
- "cantidad" = columna Cant.
- "nombre" = texto de Descripción sin el código numérico delante si es redundante.
- "codigo" = número de artículo al inicio de la descripción si existe (ej 1523 en "1523-ALFAJOR...").
- barcode solo si hay EAN visible; si no, "".
- No incluyas subtotales, IVA, percepciones ni totales.`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

function parseItemsFromModelText(text: string): InvoiceItem[] {
  const trimmed = text.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start < 0 || end <= start) {
    throw new Error("La IA no devolvió una lista de productos reconocible.");
  }
  const slice = trimmed.slice(start, end + 1);
  const raw = JSON.parse(slice) as unknown;
  if (!Array.isArray(raw)) throw new Error("Formato de respuesta inválido.");
  const items: InvoiceItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const nombre = String(r.nombre ?? r.name ?? "").trim();
    if (!nombre) continue;
    const cantidad = Number(r.cantidad ?? r.qty ?? r.stock ?? 1);
    const costo = Number(r.costo ?? r.cost ?? 0);
    items.push({
      nombre,
      barcode: String(r.barcode ?? r.codigo ?? r.ean ?? "").trim() || undefined,
      codigo: String(r.codigo ?? "").trim() || undefined,
      cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
      costo: Number.isFinite(costo) && costo >= 0 ? costo : 0,
      stock: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
    });
  }
  if (items.length === 0) {
    throw new Error("No se detectaron productos en la factura.");
  }
  return items;
}

async function extractItems(env: Env, imageBase64: string, mimeType: string): Promise<InvoiceItem[]> {
  await ensureVisionLicense(env);
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const result = await env.AI.run(MODEL, {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACT_PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.1,
  });

  const text =
    typeof result === "object" && result !== null && "response" in result
      ? String((result as { response: string }).response)
      : String(result);

  return parseItemsFromModelText(text);
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
          {
            error:
              "Falta activar el modelo de visión en Cloudflare. Reintentá en unos segundos o contactá soporte.",
          },
          502,
        );
      }
      return json({ error: msg }, 502);
    }
  },
} satisfies ExportedHandler<Env>;
