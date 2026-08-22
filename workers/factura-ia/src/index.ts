import { enrichWithLearning, saveLearning, type LearnPayloadItem } from "./learn";
import { runOpenAiVision } from "./openai";

export interface Env {
  AI: Ai;
  LEARN: KVNamespace;
  /** Si está definida, se usa GPT-4o como motor principal (mejor OCR multi-rubro). */
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
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
- Transcribí ÚNICAMENTE filas de productos visibles en ESTA imagen.
- PROHIBIDO inventar productos. PROHIBIDO copiar ejemplos de este prompt.
- PROHIBIDO mezclar con facturas de otros rubros (bebidas, petshop, kiosco, taller).
- Una línea por producto, separador |

Detectá el tipo:

TIPO A — Mayorista / FACTURA CONTADO (PRODUCTO, DETALLE, CANTIDAD, PRECIO UNITARIO):
CODIGO|DETALLE|PACKS|PRECIO_PACK
- CODIGO = columna PRODUCTO (numérico 6 dígitos).
- PACKS = CANTIDAD en bultos.
- PRECIO_PACK = PRECIO UNITARIO del bulto.

TIPO B — Tique / Factura B (Cant, Descripción, Precio, Total):
CANT|CODIGO-DESCRIPCION|PRECIO_UNITARIO|TOTAL_LINEA

TIPO C — Petshop (Quantity, Item PR…, Unit Price, Amount):
CANT|CODIGO|NOMBRE|PRECIO_UNIT|TOTAL
- Omití filas ZD / BONIFICACIÓN / montos negativos.

TIPO D — Remito / lista SIN precios (Código, Cant, Descripción):
CODIGO|CANT|DESCRIPCION
- Si NO hay columna de precio → costo 0. NO inventes precios.
- Códigos alfanuméricos (ej. AB1234) son válidos.

Prioridad: "FACTURA CONTADO" / "PRECIO UNITARIO" → A. Solo Código+Cant+Descripción sin precio → D.

Formato de ejemplo (DATOS FALSOS — no copies):
TIPO A: 000000|PRODUCTO FALSO DEMO X1|1|100.00
TIPO B: 1|0000-ITEM FALSO DEMO|10.00|10.00
TIPO D: ZZ0000|1|ITEM FALSO REMITO SIN PRECIO

Sin encabezados, sin IVA, sin pie.`;

const REMITO_PROMPT = `Remito / lista de piezas o productos SIN precios.
Columnas típicas: Código | Cant | Descripción.
NO hay PRECIO UNITARIO ni TOTAL ni IVA.

Transcribí TODAS las filas reales de ESTA imagen:
CODIGO|CANT|DESCRIPCION

- Copiá código y descripción EXACTOS de la imagen.
- CANT = cantidad de la columna Cant.
- Precio implícito = 0 (no inventes).
- PROHIBIDO inventar bebidas, Coca-Cola, petshop u otros rubros.
- PROHIBIDO usar ejemplos de este mensaje.

Formato (DATOS FALSOS — no copies):
ZZ0001|1|ITEM FALSO DEMO LINEA UNO
ZZ0002|2|ITEM FALSO DEMO LINEA DOS`;

const PETSHOP_PROMPT = `Factura con columnas Quantity, Item, IVA, Unit Price, Amount.
Códigos de ítem tipo PR + números.

Transcribí CADA fila de producto:
CANT|CODIGO|NOMBRE|PRECIO_UNIT|TOTAL

- CANT = Quantity (no el nº de fila).
- PRECIO_UNIT = Unit Price. TOTAL = Amount.
- Omití ZD, BONIFICACIÓN e importes negativos.
- Solo lo visible en la imagen. No copies ejemplos.

Formato (DATOS FALSOS — no copies):
1|PR000000|PRODUCTO FALSO DEMO|1000.00|1000.00`;

const DISTRIBUTOR_PROMPT = `Factura mayorista argentina (FACTURA CONTADO).
Columnas: PRODUCTO (6 dígitos), DETALLE, CANTIDAD (bultos), PRECIO UNITARIO, TOTAL.

Una línea por producto:
CODIGO|DETALLE|PACKS|PRECIO_PACK|TOTAL_LINEA

- PACKS = columna CANTIDAD (bultos: 1,00 / 2,00…). NUNCA el nº de fila.
- PRECIO_PACK = PRECIO UNITARIO (miles de pesos típicos). NUNCA 1 ni 2 como precio.
- "1x8" / "X8" en el detalle = unidades por bulto; PACKS sigue siendo CANTIDAD.
- Solo productos de ESTA imagen. No inventes ni copies ejemplos.

Formato (DATOS FALSOS — no copies):
000000|PRODUCTO FALSO MAYORISTA X8|1|1000.00|1000.00`;

const DISTRIBUTOR_STRICT_PROMPT = `RELECTURA — FACTURA CONTADO / mayorista.
La lectura anterior falló (nº de fila o precios inventados).

Para CADA producto visible:
CODIGO|DETALLE|PACKS|PRECIO_PACK|TOTAL_LINEA

- PACKS = CANTIDAD real (1/2/4…). PROHIBIDO secuencias 1,2,3,4…
- PRECIO_PACK = PRECIO UNITARIO real (≥ 100).
- Solo lo visible. Sin markdown.`;

const TIQUE_PROMPT = `Tique o Factura B (Cant, Descripción, Precio, Total).
Descripción suele ser CODIGO-NOMBRE.

Una línea por producto:
CANT|CODIGO-DESCRIPCION|PRECIO|TOTAL

- CANT = columna Cant (no el nº de fila).
- Solo filas visibles. No inventes.

Formato (DATOS FALSOS — no copies):
1|0000-ITEM FALSO TIQUE|100.00|100.00`;

const JSON_FALLBACK_PROMPT = `Lista SOLO productos visibles en ESTA imagen. Nada inventado. No copies ejemplos.
Tipos:
- Mayorista con precio: {"codigo":"000000","nombre":"ITEM FALSO","packs":1,"precio_pack":100}
- Tique: {"codigo":"0000","nombre":"ITEM FALSO","cant":1,"precio_unit":10,"total_linea":10}
- Petshop: {"codigo":"PR000000","nombre":"ITEM FALSO","cant":1,"precio_unit":100,"total_linea":100}
- Remito sin precio: {"codigo":"ZZ0000","nombre":"ITEM FALSO","cant":1,"precio_unit":0}
JSON array sin markdown:
[{"codigo":"ZZ0000","nombre":"ITEM FALSO","cant":1,"precio_unit":0}]`;

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
  const text = detalle.replace(/×/g, "x");
  for (const m of text.matchAll(/(?:^|[\s(])(?:(\d+)\s*)?[xX]\s*(\d+)\b/gi)) {
    if (isWeightUnitAfter(text, m.index ?? 0, m[0].length)) continue;
    const n = parseInt(m[2], 10);
    if (n >= 2 && n <= 48) candidates.push(n);
  }
  for (const m of text.matchAll(/[xX]\s*(\d+)(?!\d)/gi)) {
    if (isWeightUnitAfter(text, m.index ?? 0, m[0].length)) continue;
    const n = parseInt(m[1], 10);
    if (n >= 2 && n <= 48) candidates.push(n);
  }
  for (const m of text.matchAll(/(\d{3,4})[xX](\d+)(?!\d)/gi)) {
    const n = parseInt(m[2], 10);
    if (n >= 2 && n <= 48) candidates.push(n);
  }
  return candidates.length ? candidates[candidates.length - 1]! : 1;
}

/** CANTIDAD en factura mayorista = bultos (1, 2, 3…), no unidades totales. */
function inferDistributorPacks(qtyOrPacks: number, mult: number): number {
  const q = Math.round(qtyOrPacks);
  if (q <= 0) return 1;
  if (mult <= 1) return q;

  if (q % mult === 0) {
    const asPacks = q / mult;
    if (asPacks >= 1 && asPacks <= 50 && (asPacks <= 12 || q > 15)) return asPacks;
  }

  if (q <= 15) return q;

  if (q > 50 && q % mult === 0) return Math.max(1, Math.min(20, q / mult));

  return Math.min(q, 20);
}

function cleanProductName(desc: string): string {
  return desc
    .trim()
    .replace(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[,.]\d{2})$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function impliedQuantity(precioUnit: number, totalLine: number): number | null {
  if (precioUnit <= 0 || totalLine <= 0) return null;
  const q = Math.round(totalLine / precioUnit);
  if (q >= 1 && q <= 999 && near(q * precioUnit, totalLine, 0.02)) return q;
  return null;
}

/** Corrige cantidad y costo cuando la IA pone nº de fila (1,2,3…) en vez de Quantity. */
function derivePetshopQtyCost(
  cant: number,
  precioUnit: number,
  totalLine: number,
): { qty: number; unitCost: number } {
  const implied = totalLine > 0 && precioUnit > 0 ? impliedQuantity(precioUnit, totalLine) : null;

  if (implied != null) {
    const cantOk = near(cant * precioUnit, totalLine, 0.02);
    const qty = cantOk ? Math.round(cant) : implied;
    const unitCost =
      precioUnit > 0 && near(qty * precioUnit, totalLine, 0.02)
        ? round2(precioUnit)
        : round2(totalLine / qty);
    return { qty, unitCost };
  }

  if (precioUnit > 0) return { qty: Math.max(1, Math.round(cant)), unitCost: round2(precioUnit) };
  if (totalLine > 0 && cant > 0) {
    return { qty: Math.round(cant), unitCost: round2(totalLine / cant) };
  }
  return { qty: Math.max(1, Math.round(cant)), unitCost: 0 };
}

function isSequentialRowCounts(items: InvoiceItem[]): boolean {
  if (items.length < 3) return false;
  for (let i = 0; i < items.length; i++) {
    if (Math.round(items[i].stock ?? items[i].cantidad ?? 0) !== i + 1) return false;
  }
  return true;
}

function fixSequentialPetshopMath(items: InvoiceItem[]): InvoiceItem[] {
  if (!shouldApplyPetshopSeqFix(items)) return items;

  return items.map((it, i) => {
    const rowNum = i + 1;
    const p = it.costo;
    if (p <= 0) return it;

    const lineFromWrongAvg = p * rowNum;
    let best = { qty: rowNum, unit: p, score: 0 };

    for (let q = 1; q <= 24; q++) {
      let score = 0;
      let unit = p;

      const totalH1 = p * q;
      if (p >= 500 && p <= 400_000) {
        score = 30;
        if (q !== rowNum) score += 25;
        if (q === 1 || q === 2 || q === 3 || q === 6) score += 5;
        if (totalH1 > lineFromWrongAvg * 1.5) score += 15;
        if (near(totalH1, lineFromWrongAvg, 0.02)) score += 20;
      }

      const unitH2 = lineFromWrongAvg / q;
      if (unitH2 >= 500 && unitH2 <= 400_000 && near(unitH2 * q, lineFromWrongAvg, 0.02)) {
        const scoreH2 = 35 + (q !== rowNum ? 25 : 0) + (q <= 6 ? 5 : 0);
        if (scoreH2 > score) {
          score = scoreH2;
          unit = unitH2;
        }
      }

      if (score > best.score) {
        best = { qty: q, unit, score };
      }
    }

    if (best.score < 30) return it;
    return {
      ...it,
      packs: round2(best.qty),
      cantidad: best.qty,
      stock: best.qty,
      costo: round2(best.unit),
    };
  });
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
  totalLine = 0,
): InvoiceItem {
  const mult = extractPackMultiplier(detalle);
  const stockUnits = Math.round(packs * mult);
  let packCost = precioPack;
  // Si el precio unitario salió basura (1, 2…) pero hay TOTAL de fila, estimar por bulto.
  if ((packCost <= 0 || packCost < 100) && totalLine >= 100 && packs > 0) {
    packCost = totalLine / packs;
  }
  const unitCost = mult > 1 && packCost > 0 ? packCost / mult : packCost;
  return {
    nombre: cleanProductName(detalle),
    codigo: normalizeProductCode(codigo),
    packs: round2(packs),
    unidades_por_pack: mult,
    cantidad: stockUnits,
    stock: stockUnits,
    costo: round2(unitCost),
    tipo: "mayorista",
  };
}

/** Si la IA puso unidades totales (24) en vez de packs (3 con X8), corrige a packs. */
function finalizeDistributorSmart(
  codigo: string,
  detalle: string,
  qtyOrPacks: number,
  precioPack: number,
  totalLine = 0,
): InvoiceItem | null {
  if (!detalle || qtyOrPacks <= 0 || qtyOrPacks > 50_000) return null;
  const mult = extractPackMultiplier(detalle);
  const packs = inferDistributorPacks(qtyOrPacks, mult);

  if (packs > 500) return null;
  return finalizeDistributor(codigo, detalle, packs, precioPack, totalLine);
}

function finalizeKioscoTicket(
  cant: number,
  codigo: string | undefined,
  desc: string,
  precioCol: number,
  totalCol: number,
): InvoiceItem | null {
  if (!desc || cant <= 0 || cant > 9999) return null;

  const { qty, unitCost } = derivePetshopQtyCost(cant, precioCol, totalCol);
  const nombre = cleanProductName(desc);

  return {
    nombre,
    codigo: codigo ? normalizeKioscoCode(codigo) : undefined,
    packs: round2(qty),
    unidades_por_pack: 1,
    cantidad: Math.round(qty),
    stock: Math.round(qty),
    costo: unitCost,
    tipo: "tique",
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
  return /^\d{5,9}$/.test(normalizeProductCode(s));
}

/** Códigos de remito / proveedor: LT10139, OST162T, THO1506, AB-12, etc. */
function isPartsListCode(s: string): boolean {
  const t = s.trim().toUpperCase();
  if (!t || t.length < 3 || t.length > 20) return false;
  if (/^(CODIGO|CANT|DESCRIPCION|PRODUCTO|DETALLE|CANTIDAD)$/i.test(t)) return false;
  if (isKioscoTicketCode(t) || isPetshopSupplierCode(t) || isWholesaleNumericCode(t)) return false;
  if (isDistributorCode(t)) return false;
  // Alfanumérico con al menos una letra
  if (/^[A-Z]{1,6}\d{2,10}[A-Z0-9]*$/i.test(t)) return true;
  if (/^[A-Z0-9]+-\d+[A-Z0-9]*$/i.test(t)) return true;
  if (/^[A-Z]+\d+[A-Z]+$/i.test(t)) return true;
  return false;
}

function finalizeRemito(
  codigo: string,
  cant: number,
  desc: string,
  costo = 0,
): InvoiceItem | null {
  if (!desc || cant <= 0 || cant > 50_000) return null;
  const nombre = cleanProductName(desc);
  if (nombre.length < 2) return null;
  const qty = Math.round(cant);
  return {
    nombre,
    codigo: codigo.trim().toUpperCase() || undefined,
    packs: qty,
    unidades_por_pack: 1,
    cantidad: qty,
    stock: qty,
    costo: round2(Math.max(0, costo)),
    tipo: "tique",
  };
}

function parseRemitoFallback(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(codigo|cant|descripcion|localidad)/i.test(line)) continue;

    const pipe = normalizeLine(line);
    if (pipe.includes("|")) {
      const parts = pipe.split("|").map((p) => p.trim());
      // CODIGO|CANT|DESCRIPCION
      if (parts.length >= 3 && isPartsListCode(parts[0]) && isTicketCant(parts[1])) {
        const item = finalizeRemito(parts[0], parseArgNumber(parts[1]), parts.slice(2).join(" "));
        if (item) items.push(item);
        continue;
      }
      // CANT|CODIGO|DESCRIPCION
      if (parts.length >= 3 && isTicketCant(parts[0]) && isPartsListCode(parts[1])) {
        const item = finalizeRemito(parts[1], parseArgNumber(parts[0]), parts.slice(2).join(" "));
        if (item) items.push(item);
        continue;
      }
      // CODIGO|DESCRIPCION|CANT
      if (parts.length >= 3 && isPartsListCode(parts[0]) && isTicketCant(parts[2])) {
        const item = finalizeRemito(parts[0], parseArgNumber(parts[2]), parts[1]);
        if (item) items.push(item);
        continue;
      }
    }

    const m = line.match(/^([A-Z]{1,6}\d{2,10}[A-Z0-9]*)\s+(\d{1,5})\s+(.+)$/i);
    if (!m) continue;
    const item = finalizeRemito(m[1], parseArgNumber(m[2]), m[3]);
    if (item) items.push(item);
  }
  return items;
}

function countRemitoHints(text: string): number {
  let n = 0;
  if (/C[oó]digo\s*[|/\t ]+\s*Cant/i.test(text) && !/PRECIO/i.test(text)) n += 3;
  if (/DESCRIPCI[OÓ]N/i.test(text) && /C[OÓ]DIGO/i.test(text) && !/PRECIO UNITARIO|FACTURA CONTADO/i.test(text)) {
    n += 2;
  }
  for (const line of text.split(/\r?\n/)) {
    const norm = normalizeLine(line);
    const code = (norm.split("|")[0] ?? "").trim();
    if (isPartsListCode(code) && !/\$|[,.]\d{2}/.test(norm)) n++;
    if (/^\w+\|\d{1,4}\|.{8,}/i.test(norm) && !/\$|[,.]\d{2}/.test(norm) && isPartsListCode(code)) n++;
  }
  return n;
}

function looksLikeRemitoInvoice(text: string, items: InvoiceItem[]): boolean {
  if (/FACTURA CONTADO|PRECIO UNITARIO|TOTAL NETO|Unit Price|Amount/i.test(text)) return false;
  if (countRemitoHints(text) >= 3) return true;
  // Piezas / taller: códigos alfanuméricos + nombres de auto, sin precios
  const partsCodes = items.filter((it) => it.codigo && isPartsListCode(it.codigo)).length;
  if (partsCodes >= 2 && items.every((it) => !(it.costo > 0))) return true;
  if (/CHEVROLET|RENAULT|FORD F\d|ROTULA|AMORTIGUADOR|BRAZO AUXILIAR/i.test(text) && !/PRECIO/i.test(text)) {
    return true;
  }
  if (looksLikeDistributorInvoice(text, items)) return false;
  const zeroCost = items.filter((it) => (it.costo ?? 0) <= 0 && it.nombre).length;
  const priced = items.filter((it) => (it.costo ?? 0) > 0).length;
  if (priced > 0) return false;
  return zeroCost >= 2 && zeroCost >= items.length * 0.7;
}

/** Descarta Coca-Cola / mayorista cuando la imagen es claramente remito. */
function stripWrongRubroItems(text: string, items: InvoiceItem[]): InvoiceItem[] {
  const remitoish =
    countRemitoHints(text) >= 2 ||
    /C[oó]digo.*Cant.*Descripci/i.test(text) ||
    (/CHEVROLET|ROTULA|AMORTIGUADOR/i.test(text) && !/PRECIO UNITARIO|FACTURA CONTADO/i.test(text));
  if (!remitoish) return items;
  const cleaned = items.filter((it) => {
    if (it.codigo && isWholesaleNumericCode(it.codigo)) return false;
    if (/coca-?cola|sprite|fanta|aquarius|monster|cepit/i.test(it.nombre)) return false;
    return true;
  });
  return cleaned.length > 0 ? cleaned : [];
}

function normalizeProductCode(raw: string): string {
  const t = raw.trim().toUpperCase();
  const pr = t.match(/^PR(\d{5,9})$/);
  if (pr) return pr[1];
  return t.replace(/^PR/i, "").trim();
}

/** Códigos PR10xxxx son mayorista Coca/FEMSA mal leídos con prefijo PR. */
function isWholesaleNumericCode(code: string): boolean {
  const n = normalizeProductCode(code);
  return /^10\d{4,5}$/.test(n);
}

function isKioscoTicketCode(code: string): boolean {
  const t = code.trim().toUpperCase();
  return /^PR?\d{3,4}$/.test(t);
}

function normalizeKioscoCode(code: string): string {
  return code.trim().replace(/^PR/i, "");
}

function isPetshopSupplierCode(code: string): boolean {
  const t = code.trim().toUpperCase();
  if (isKioscoTicketCode(t)) return false;
  if (isWholesaleNumericCode(t)) return false;
  return /^PR(11|12|13|14|15)\d{4,}$/i.test(t);
}

function shouldApplyPetshopSeqFix(items: InvoiceItem[]): boolean {
  if (!isSequentialRowCounts(items)) return false;
  if (items.some((it) => it.tipo === "mayorista")) return false;
  if (items.some((it) => it.codigo && isWholesaleNumericCode(it.codigo))) return false;
  return items.every((it) => !it.codigo || isPetshopSupplierCode(it.codigo));
}

function isSupplierCode(s: string): boolean {
  const t = s.trim().toUpperCase();
  if (isKioscoTicketCode(t) || isWholesaleNumericCode(t)) return false;
  return isPetshopSupplierCode(t) || /^ZD\d/i.test(t);
}

function splitTicketCodeDesc(field: string): { codigo?: string; nombre: string } {
  const t = field.trim();
  let m = t.match(/^PR?(\d{3,4})[-–\s]+(.+)$/i);
  if (m) return { codigo: m[1], nombre: m[2].trim() };
  m = t.match(/^PR(\d{3,4})$/i);
  if (m) return { codigo: m[1], nombre: t };
  m = t.match(/^(\d{3,4})$/);
  if (m) return { codigo: m[1], nombre: t };
  return splitItemCodeDesc(t);
}

function parseTicketBParts(parts: string[]): InvoiceItem | null {
  if (!isTicketCant(parts[0] ?? "")) return null;

  const cant = parseArgNumber(parts[0]);
  let codigo: string | undefined;
  let nombre = "";
  let precioIdx = 2;
  let totalIdx = 3;

  if (parts.length >= 5 && isKioscoTicketCode(parts[1] ?? "")) {
    codigo = normalizeKioscoCode(parts[1]);
    nombre = parts[2] ?? "";
    precioIdx = 3;
    totalIdx = 4;
    if (/%/.test(parts[3] ?? "")) {
      precioIdx = 4;
      totalIdx = 5;
    }
  } else if (parts.length >= 4) {
    const split = splitTicketCodeDesc(parts[1] ?? "");
    codigo = split.codigo;
    nombre = split.nombre;
    precioIdx = 2;
    totalIdx = 3;
    if (/%/.test(parts[2] ?? "") && parts.length >= 5) {
      precioIdx = 3;
      totalIdx = 4;
    }
    if (
      parts.length >= 5 &&
      isKioscoTicketCode(parts[1] ?? "") &&
      /^PR?\d{3,4}$/i.test(nombre.trim())
    ) {
      codigo = normalizeKioscoCode(parts[1]);
      nombre = parts[2] ?? "";
      precioIdx = 3;
      totalIdx = 4;
    }
  } else if (parts.length >= 3) {
    const split = splitTicketCodeDesc(parts[1] ?? "");
    codigo = split.codigo;
    nombre = split.nombre;
    precioIdx = 2;
    totalIdx = parts.length >= 4 ? 3 : -1;
  } else {
    return null;
  }

  const precio = parseArgNumber(parts[precioIdx] ?? "0");
  const total = totalIdx >= 0 ? parseArgNumber(parts[totalIdx] ?? "0") : 0;
  if (!nombre || precio <= 0) return null;

  // Factura mayorista mal leída como tique: "1x8"/"X6" con precio ridículo (1, 2…).
  const packMult = extractPackMultiplier(nombre);
  if (
    packMult >= 2 &&
    precio < 100 &&
    !isKioscoTicketCode(codigo ?? "") &&
    !/^\d{3,4}-/.test(nombre)
  ) {
    return null;
  }

  if (isPetshopSupplierCode(codigo ?? "") || isPetshopSupplierCode(nombre)) return null;
  return finalizeKioscoTicket(cant, codigo, nombre, precio, total);
}

function parseTicketFallback(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(cant|descripcion|precio|total)/i.test(line)) continue;

    const pipe = normalizeLine(line);
    if (pipe.includes("|")) {
      const parts = pipe.split("|").map((p) => p.trim());
      const item = parseTicketBParts(parts);
      if (item) items.push(item);
      continue;
    }

    const m = line.match(
      /^([\d.,]+)\s+(\d{3,4}\s*[-–]\s*.+?|PR?\d{3,4}\s+.+?)\s+([\d.,]+)\s+([\d.,]+)\s*$/i,
    );
    if (!m) continue;
    const split = splitTicketCodeDesc(m[2]);
    const item = finalizeKioscoTicket(
      parseArgNumber(m[1]),
      split.codigo,
      split.nombre,
      parseArgNumber(m[3]),
      parseArgNumber(m[4]),
    );
    if (item) items.push(item);
  }
  return items;
}

function splitItemCodeDesc(item: string): { codigo?: string; nombre: string } {
  const t = item.trim();
  const m = t.match(/^([A-Z]{1,4}\d{4,})\s+(.+)$/i);
  if (m) return { codigo: m[1].toUpperCase(), nombre: m[2].trim() };
  const m2 = t.match(/^(\d{5,9})\s+(.+)$/);
  if (m2) return { codigo: m2[1], nombre: m2[2].trim() };
  return { nombre: t };
}

function isBonificacion(desc: string, precioUnit: number, totalLine: number, codigo?: string): boolean {
  if (codigo && /^ZD/i.test(codigo.trim())) return true;
  if (/bonificaci[oó]n/i.test(desc)) return true;
  if (/^ZD\d/i.test(desc.trim())) return true;
  if (precioUnit < 0 || totalLine < 0) return true;
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
  if (isBonificacion(desc, precioUnit, totalLine, codigo)) return null;

  const { qty, unitCost } = derivePetshopQtyCost(cant, precioUnit, totalLine);
  const mult = extractPackMultiplier(desc);
  const stockUnits = mult > 1 ? Math.round(qty * mult) : Math.round(qty);

  return {
    nombre: cleanProductName(desc),
    codigo: codigo?.trim() || undefined,
    packs: round2(qty),
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
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s
    .replace(/\t/g, "|")
    .replace(/[;]/g, "|")
    .replace(/\s*\|\s*/g, "|");
}

function parsePetshopSpacedLine(line: string): InvoiceItem | null {
  const m = line.match(
    /^(\d{1,4})\s+(PR\d{5,7})\s+(.+?)\s+21\s*%?\s+(\$?\s*[\d.,\s]+)\s+(\$?\s*-?[\d.,\s]+)$/i,
  );
  if (!m) return null;
  const cant = parseArgNumber(m[1]);
  const codigo = m[2].toUpperCase();
  const nombre = m[3].trim();
  const precio = parseArgNumber(m[4]);
  const total = parseArgNumber(m[5]);
  return finalizePetshop(cant, codigo, nombre, precio, total);
}

function parsePetshopFallback(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(quantity|item|cantidad)/i.test(line)) continue;

    const spaced = parsePetshopSpacedLine(line);
    if (spaced) {
      items.push(spaced);
      continue;
    }

    const m = line.match(
      /^(\d{1,4})\s*\|?\s*(PR\d{5,7})\s+(.+?)\s+(\$?\s*[\d.,\s]+)\s+(\$?\s*-?[\d.,\s]+)$/i,
    );
    if (!m) continue;
    const item = finalizePetshop(
      parseArgNumber(m[1]),
      m[2].toUpperCase(),
      m[3].trim(),
      parseArgNumber(m[4]),
      parseArgNumber(m[5]),
    );
    if (item) items.push(item);
  }
  return items;
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
    if (/^(producto|detalle|cantidad|codigo|tipo|ejemplo|regla|descripcion|cant\b)/i.test(trimmed)) {
      continue;
    }

    if (!trimmed.includes("|")) {
      const remitoSpace = trimmed.match(
        /^([A-Z]{1,6}\d{2,10}[A-Z0-9]*)\s+(\d{1,5})\s+(.+)$/i,
      );
      if (remitoSpace) {
        const item = finalizeRemito(
          remitoSpace[1],
          parseArgNumber(remitoSpace[2]),
          remitoSpace[3],
        );
        if (item) {
          items.push(item);
          continue;
        }
      }
      const m = trimmed.match(
        /^([\d.,]+)\s+(\d{3,4}\s*[-–]\s*.+?)\s+([\d.,]+)\s+([\d.,]+)\s*$/,
      );
      if (m) {
        const split = splitTicketCodeDesc(m[2]);
        const item = finalizeKioscoTicket(
          parseArgNumber(m[1]),
          split.codigo,
          split.nombre,
          parseArgNumber(m[3]),
          parseArgNumber(m[4]),
        );
        if (item) {
          items.push(item);
          continue;
        }
      }
      const m2 = trimmed.match(
        /^([\d.,]+)\s+(\d+\s*[-–]\s*.+?)\s+([\d.,]+)\s+([\d.,]+)\s*$/,
      );
      if (!m2) continue;
      items.push(
        finalizeTicket(
          parseArgNumber(m2[1]),
          m2[2],
          parseArgNumber(m2[3]),
          parseArgNumber(m2[4]),
        ),
      );
      continue;
    }

    const parts = trimmed.split("|").map((p) => p.trim());
    if (parts.length < 3) continue;

    // Remito: CODIGO|CANT|DESCRIPCION (sin precios o precio 0)
    if (parts.length >= 3 && isPartsListCode(parts[0]) && isTicketCant(parts[1])) {
      const priceCol = parts.length >= 4 ? parseArgNumber(parts[3]) : 0;
      const looksPriced = parts.length >= 4 && priceCol > 0;
      if (!looksPriced) {
        const item = finalizeRemito(parts[0], parseArgNumber(parts[1]), parts.slice(2).join(" "));
        if (item) {
          items.push(item);
          continue;
        }
      }
    }

    // Remito: CANT|CODIGO|DESCRIPCION
    if (parts.length >= 3 && isTicketCant(parts[0]) && isPartsListCode(parts[1])) {
      const priceCol = parts.length >= 4 ? parseArgNumber(parts[3]) : 0;
      if (!(parts.length >= 4 && priceCol > 0)) {
        const item = finalizeRemito(parts[1], parseArgNumber(parts[0]), parts.slice(2).join(" "));
        if (item) {
          items.push(item);
          continue;
        }
      }
    }

    // Tique kiosco: CANT|1523-NOMBRE|PRECIO|TOTAL o CANT|PR1523|NOMBRE|PRECIO|TOTAL
    if (parts.length >= 4 && isTicketCant(parts[0])) {
      const ticketItem = parseTicketBParts(parts);
      if (ticketItem) {
        items.push(ticketItem);
        continue;
      }
    }

    // Mayorista mal leído: CANT|PR100433|DETALLE|PRECIO|[TOTAL]
    if (parts.length >= 4 && isTicketCant(parts[0])) {
      const codigoNorm = normalizeProductCode(parts[1]);
      if (isDistributorCode(codigoNorm)) {
        const qtyOrPacks = parseArgNumber(parts[0]);
        let precioIdx = 3;
        if (parts.length >= 5 && /%/.test(parts[3])) precioIdx = 4;
        else if (parts.length === 4) precioIdx = 3;
        const precioPack = parseArgNumber(parts[precioIdx] ?? parts[2]);
        const detalle = parts[2];
        if (detalle && precioPack > 0) {
          const item = finalizeDistributorSmart(codigoNorm, detalle, qtyOrPacks, precioPack);
          if (item) {
            items.push(item);
            continue;
          }
        }
      }
    }

    // Petshop: CANT|CODIGO|DESCRIPCION|PRECIO|TOTAL (5+ cols, a veces con IVA)
    if (parts.length >= 5 && isTicketCant(parts[0]) && isPetshopSupplierCode(parts[1])) {
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
      const totalLine = parts.length >= 5 ? parseArgNumber(parts[4]) : 0;
      if (!parts[1] || packs <= 0 || packs > 500) continue;
      const item = finalizeDistributorSmart(parts[0], parts[1], packs, costoPack, totalLine);
      if (item) items.push(item);
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
      if (isKioscoTicketCode(codigo ?? nombre) || isKioscoTicketCode(itemField)) {
        const split = splitTicketCodeDesc(itemField);
        const item = finalizeKioscoTicket(cant, split.codigo, split.nombre, precio, total);
        if (item) items.push(item);
        continue;
      }
      const item = finalizePetshop(cant, codigo, nombre, precio, total);
      if (item) items.push(item);
      continue;
    }

    if (parts.length >= 3 && isTicketCant(parts[0])) {
      const cant = parseArgNumber(parts[0]);
      const split = splitTicketCodeDesc(parts[1]);
      const precio = parseArgNumber(parts[2]);
      const total = parts.length >= 4 ? parseArgNumber(parts[3]) : 0;
      if (!split.nombre || cant <= 0 || cant > 999) continue;
      if (split.codigo || /\d{3,4}\s*[-–]/.test(parts[1])) {
        const item = finalizeKioscoTicket(cant, split.codigo, split.nombre, precio, total);
        if (item) {
          items.push(item);
          continue;
        }
      }
      items.push(finalizeTicket(cant, parts[1], precio, total));
    }
  }
  return items;
}

function parseDistributorFallback(text: string): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const pipe = normalizeLine(line);
    if (pipe.includes("|")) {
      const parts = pipe.split("|").map((p) => p.trim());
      if (parts.length >= 4 && isDistributorCode(normalizeProductCode(parts[0]))) {
        const item = finalizeDistributorSmart(
          parts[0],
          parts[1],
          parseArgNumber(parts[2]),
          parseArgNumber(parts[3]),
          parts.length >= 5 ? parseArgNumber(parts[4]) : 0,
        );
        if (item) items.push(item);
        continue;
      }
    }

    const m = line.match(
      /^(\d{6})\s+(.+?)\s+(\d+[,.]\d{2}|\d+)\s+([\d.,]+)(?:\s+([\d.,]+))?/,
    );
    if (!m) continue;
    const packs = parseArgNumber(m[3]);
    if (packs <= 0 || packs > 500) continue;
    let detalle = m[2].trim().replace(/\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+.*$/, "").trim();
    const item = finalizeDistributorSmart(
      m[1],
      detalle,
      packs,
      parseArgNumber(m[4]),
      m[5] ? parseArgNumber(m[5]) : 0,
    );
    if (item) items.push(item);
  }
  return items;
}

function countDistributorHints(text: string): number {
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    const norm = normalizeLine(line);
    if (/^\d{6}\|/.test(norm)) n++;
    if (/^PR10\d{4}\|/i.test(norm)) n++;
    if (/^\d{1,3}\|(?:PR)?10\d{4}\|/i.test(norm)) n++;
    if (/FACTURA CONTADO|PRODUCTO.*DETALLE/i.test(line)) n += 2;
  }
  return n;
}

function looksLikeDistributorInvoice(text: string, items: InvoiceItem[]): boolean {
  if (countDistributorHints(text) >= 2) return true;
  if (/FACTURA CONTADO|PRECIO UNITARIO/i.test(text)) return true;
  const wholesale = items.filter((it) => it.codigo && isWholesaleNumericCode(it.codigo)).length;
  return wholesale >= 2 || (items.length > 0 && wholesale / items.length >= 0.5);
}

/** Solo descarta ejemplos FALSOS del prompt — nunca productos reales de clientes. */
function isPromptExampleItem(item: InvoiceItem): boolean {
  const code = (item.codigo ?? "").trim().toUpperCase();
  if (/^(ZZ\d+|000000|0000|PR000000)$/i.test(code)) return true;
  const name = item.nombre ?? "";
  if (/ITEM FALSO|PRODUCTO FALSO|FALSO DEMO|FALSO REMITO|FALSO MAYORISTA|FALSO TIQUE/i.test(name)) {
    return true;
  }
  return false;
}

function scoreItemSet(items: InvoiceItem[]): number {
  let score = items.length * 10;
  for (const it of items) {
    if (isPromptExampleItem(it)) {
      score -= 80;
      continue;
    }
    if (it.codigo && !/^PR?\d{3,4}$/i.test(it.nombre.trim())) score += 5;
    if ((it.costo ?? 0) > 0) score += 12;
    if (it.tipo === "mayorista") score += 4;
    if (it.codigo && isWholesaleNumericCode(it.codigo)) score += 8;
    if (it.codigo && isDistributorCode(it.codigo) && (it.costo ?? 0) > 0) score += 6;
    if (/^PR?\d{3,4}$/i.test(it.nombre.trim())) score -= 10;
  }
  return score;
}

function pickBetterItemSet(a: InvoiceItem[], b: InvoiceItem[]): InvoiceItem[] {
  if (b.length === 0) return a;
  if (a.length === 0) return b;
  const scoreA = scoreItemSet(a);
  const scoreB = scoreItemSet(b);
  if (scoreB > scoreA) return b;
  if (scoreA > scoreB) return a;
  return b.length > a.length ? b : a;
}

function countTicketHints(text: string): number {
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    const norm = normalizeLine(line);
    if (/^\d{1,3}\|\d{3,4}-/i.test(norm)) n++;
    if (/TIQUE|FACTURA\s*B/i.test(line)) n += 3;
    if (/^\d+[,.]?\d*\s+\d{3,4}-/i.test(line)) n++;
  }
  return n;
}

function looksLikeTicketInvoice(text: string, items: InvoiceItem[]): boolean {
  if (countTicketHints(text) >= 2) return true;
  if (/TIQUE\s*FACTURA/i.test(text)) return true;
  const kiosco = items.filter(
    (it) => it.codigo && /^\d{3,4}$/.test(it.codigo) && it.tipo === "tique",
  ).length;
  return kiosco >= 2;
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
    const codigoNorm = normalizeProductCode(codigo);
    const cant = Number(r.cant ?? r.cantidad ?? r.qty ?? 1);
    const precio = Number(r.precio_unit ?? r.precio ?? r.costo ?? 0);
    const total = Number(r.total_linea ?? r.total ?? 0);

    if (codigo && isKioscoTicketCode(codigo)) {
      const item = finalizeKioscoTicket(
        cant > 0 ? cant : 1,
        codigo,
        nombre,
        precio,
        total,
      );
      if (item) items.push(item);
      continue;
    }

    if (codigo && isPartsListCode(codigo)) {
      const item = finalizeRemito(codigo, cant > 0 ? cant : 1, nombre, precio > 0 ? precio : 0);
      if (item) items.push(item);
      continue;
    }

    if (codigoNorm && isDistributorCode(codigoNorm)) {
      const packs = Number(
        r.packs ?? r.cantidad_packs ?? r.bultos ?? r.cantidad ?? r.cant ?? 1,
      );
      const costoPack = Number(r.precio_pack ?? r.precio_unit ?? r.costo ?? r.cost ?? r.precio ?? 0);
      const totalLine = Number(r.total_linea ?? r.total ?? 0);
      const item = finalizeDistributorSmart(
        codigoNorm,
        nombre,
        packs > 0 ? packs : 1,
        costoPack,
        totalLine,
      );
      if (item) items.push(item);
      continue;
    }

    if (codigo && isPetshopSupplierCode(codigo)) {
      const packs = Number(r.packs ?? r.cantidad_packs ?? r.bultos ?? r.cantidad ?? r.cant ?? 1);
      const costoPack = Number(r.precio_pack ?? r.precio_unit ?? r.costo ?? r.cost ?? r.precio ?? 0);
      const total = Number(r.total_linea ?? r.total ?? 0);
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

    if (codigo && isSupplierCode(codigo)) {
      const packs = Number(r.packs ?? r.cantidad_packs ?? r.bultos ?? r.cantidad ?? r.cant ?? 1);
      const costoPack = Number(r.precio_pack ?? r.precio_unit ?? r.costo ?? r.cost ?? r.precio ?? 0);
      items.push(
        finalizeDistributor(codigo, nombre, packs > 0 ? packs : 1, costoPack),
      );
      continue;
    }

    const cantFallback = Number(r.cant ?? r.cantidad ?? r.qty ?? 1);
    const precioFallback = Number(r.precio_unit ?? r.precio ?? r.costo ?? 0);
    const totalFallback = Number(r.total_linea ?? r.total ?? 0);
    const split = splitTicketCodeDesc(nombre);
    if (split.codigo) {
      const item = finalizeKioscoTicket(
        cantFallback > 0 ? cantFallback : 1,
        split.codigo,
        split.nombre,
        precioFallback,
        totalFallback,
      );
      if (item) {
        items.push(item);
        continue;
      }
    }
    items.push(finalizeTicket(cantFallback > 0 ? cantFallback : 1, nombre, precioFallback, totalFallback));
  }
  if (items.length === 0) throw new Error("sin_json");
  return items;
}

function sanitizeItems(items: InvoiceItem[]): InvoiceItem[] {
  const out: InvoiceItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (isPromptExampleItem(item)) continue;
    if (!item.nombre || item.nombre.length < 2) continue;
    if (/bonificaci[oó]n/i.test(item.nombre)) continue;
    if (item.codigo && /^ZD/i.test(item.codigo)) continue;
    // Remitos / listas sin precio: permitir costo 0 (el usuario lo completa después).
    if (item.costo < 0 || item.costo > 2_000_000) continue;
    if ((item.stock ?? 0) <= 0 || (item.stock ?? 0) > 50_000) continue;

    const key = `${item.codigo ?? ""}|${normNameKey(item.nombre)}|${item.stock}|${item.costo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return fixSequentialPetshopMath(fixSequentialDistributorPacks(out));
}

function isSequentialPackCounts(items: InvoiceItem[]): boolean {
  if (items.length < 4) return false;
  let hits = 0;
  for (let i = 0; i < items.length; i++) {
    const q = Math.round(items[i].packs ?? items[i].stock ?? items[i].cantidad ?? 0);
    if (q === i + 1) hits++;
  }
  return hits >= 4 && hits / items.length >= 0.6;
}

/** La IA suele poner 1,2,3…n (nº de fila) en PACKS/CANT; no son bultos reales. */
function fixSequentialDistributorPacks(items: InvoiceItem[]): InvoiceItem[] {
  if (!isSequentialPackCounts(items)) return items;

  return items.map((it) => {
    const mult = Math.max(1, extractPackMultiplier(it.nombre) || it.unidades_por_pack || 1);
    const packs = 1;
    const units = Math.round(packs * mult);
    const packCost =
      (it.costo ?? 0) > 0 && mult > 1 ? (it.costo ?? 0) * (it.unidades_por_pack || mult) : (it.costo ?? 0);
    // Si el costo era basura (< 50 por unidad con pack), dejar 0 para forzar relectura.
    const unitCost = packCost >= 100 ? round2(packCost / mult) : (it.costo ?? 0) >= 100 ? (it.costo ?? 0) : 0;
    return {
      ...it,
      tipo: "mayorista",
      packs: 1,
      unidades_por_pack: mult,
      cantidad: units,
      stock: units,
      costo: unitCost,
    };
  });
}

/** Cantidades tipo fila o precios ridículos en facturas con 1x8 / X6. */
function distributorMathLooksBroken(items: InvoiceItem[]): boolean {
  if (items.length < 3) return false;
  if (isSequentialPackCounts(items)) return true;
  const packish = items.filter((it) => extractPackMultiplier(it.nombre) >= 2);
  if (packish.length < 3) return false;
  const lowCost = packish.filter((it) => (it.costo ?? 0) > 0 && (it.costo ?? 0) < 80).length;
  const tinyStock = packish.filter((it) => Math.round(it.stock ?? 0) <= 4 && extractPackMultiplier(it.nombre) >= 6).length;
  return lowCost / packish.length >= 0.5 || tinyStock / packish.length >= 0.5;
}

function parseAnyFormat(text: string): InvoiceItem[] {
  let items = parsePipeLines(text);
  if (items.length === 0) items = parseTicketFallback(text);
  if (items.length === 0) items = parsePetshopFallback(text);

  // Mayorista antes que remito: evita que códigos/ejemplos sin precio ganen a FACTURA CONTADO.
  if (items.length === 0 || countDistributorHints(text) >= 1 || /FACTURA CONTADO|PRECIO UNITARIO/i.test(text)) {
    const distItems = parseDistributorFallback(text);
    if (distItems.length > 0) items = pickBetterItemSet(items, distItems);
  }
  if (countTicketHints(text) >= 2) {
    const ticketItems = parseTicketFallback(text);
    if (ticketItems.length > 0) items = pickBetterItemSet(items, ticketItems);
  }
  if (
    countRemitoHints(text) >= 2 &&
    countDistributorHints(text) < 2 &&
    !/FACTURA CONTADO|PRECIO UNITARIO/i.test(text)
  ) {
    const remitoItems = parseRemitoFallback(text);
    if (remitoItems.length > 0) items = pickBetterItemSet(items, remitoItems);
  }
  if (items.length === 0) {
    items = parseRemitoFallback(text);
  }
  if (items.length === 0) {
    try {
      items = parseItemsFromJsonText(text);
    } catch {
      items = [];
    }
  }
  return sanitizeItems(items);
}

async function runVision(env: Env, imageBase64: string, mimeType: string, prompt: string): Promise<string> {
  const key = env.OPENAI_API_KEY?.trim();
  if (key) {
    try {
      return await runOpenAiVision(key, imageBase64, mimeType, prompt, env.OPENAI_MODEL || "gpt-4o");
    } catch (e) {
      console.error("[factura-ia] openai failed, fallback Workers AI:", e);
      // cae a Workers AI
    }
  }

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
  let items = stripWrongRubroItems(mainText, parseAnyFormat(mainText));

  const isDist = looksLikeDistributorInvoice(mainText, items) && !looksLikeRemitoInvoice(mainText, items);
  const isTicket = !isDist && looksLikeTicketInvoice(mainText, items);
  const isRemito =
    !isDist &&
    !isTicket &&
    (looksLikeRemitoInvoice(mainText, items) ||
      (items.length === 0 && countRemitoHints(mainText) >= 2));

  if (isDist) {
    const distText = await runVisionWithRetry(env, imageBase64, mimeType, DISTRIBUTOR_PROMPT);
    console.log("[factura-ia] distributor sample:", distText.slice(0, 600));
    items = pickBetterItemSet(items, parseAnyFormat(distText));
  } else if (isTicket) {
    const ticketText = await runVisionWithRetry(env, imageBase64, mimeType, TIQUE_PROMPT);
    console.log("[factura-ia] ticket sample:", ticketText.slice(0, 600));
    items = pickBetterItemSet(items, parseAnyFormat(ticketText));
  } else if (isRemito) {
    const remitoText = await runVisionWithRetry(env, imageBase64, mimeType, REMITO_PROMPT);
    console.log("[factura-ia] remito sample:", remitoText.slice(0, 600));
    items = pickBetterItemSet(items, parseAnyFormat(remitoText));
  }

  // Si mayorista salió con nº de fila / precios 1-2, forzar relectura estricta.
  if (
    (isDist || looksLikeDistributorInvoice(mainText, items) || distributorMathLooksBroken(items)) &&
    (distributorMathLooksBroken(items) || !items.some((it) => (it.costo ?? 0) >= 100))
  ) {
    const strictText = await runVisionWithRetry(env, imageBase64, mimeType, DISTRIBUTOR_STRICT_PROMPT);
    console.log("[factura-ia] distributor strict sample:", strictText.slice(0, 600));
    items = pickBetterItemSet(items, parseAnyFormat(strictText));
  }

  const pricedOk = items.filter((it) => (it.costo ?? 0) >= 50).length;
  const priced = items.filter((it) => (it.costo ?? 0) > 0).length;
  if (
    items.length > 0 &&
    !distributorMathLooksBroken(items) &&
    (pricedOk > 0 || (isRemito && priced >= 0)) &&
    !(isDist && pricedOk === 0)
  ) {
    return items;
  }

  // Fallbacks: no mezclar rubros. Remito primero si aplica; nunca meter mayorista en un remito.
  if (isRemito || looksLikeRemitoInvoice(mainText, items) || countRemitoHints(mainText) >= 2) {
    const remitoText = await runVisionWithRetry(env, imageBase64, mimeType, REMITO_PROMPT);
    console.log("[factura-ia] remito fallback sample:", remitoText.slice(0, 600));
    items = pickBetterItemSet(items, parseAnyFormat(remitoText));
    if (items.length > 0) return items;
  }

  if (
    isDist ||
    countDistributorHints(mainText) >= 1 ||
    /FACTURA CONTADO|PRECIO UNITARIO/i.test(mainText) ||
    distributorMathLooksBroken(items)
  ) {
    const distText = await runVisionWithRetry(env, imageBase64, mimeType, DISTRIBUTOR_PROMPT);
    console.log("[factura-ia] distributor fallback sample:", distText.slice(0, 600));
    items = pickBetterItemSet(items, parseAnyFormat(distText));
    if (items.some((it) => (it.costo ?? 0) >= 100) && !distributorMathLooksBroken(items)) {
      return items;
    }
  }

  if (items.length === 0 && !/FACTURA CONTADO|PRECIO UNITARIO/i.test(mainText)) {
    const remitoText = await runVisionWithRetry(env, imageBase64, mimeType, REMITO_PROMPT);
    console.log("[factura-ia] remito empty fallback:", remitoText.slice(0, 600));
    items = pickBetterItemSet(items, parseAnyFormat(remitoText));
    if (items.length > 0) return items;
  }

  const petText = await runVisionWithRetry(env, imageBase64, mimeType, PETSHOP_PROMPT);
  console.log("[factura-ia] petshop sample:", petText.slice(0, 600));
  items = pickBetterItemSet(items, parseAnyFormat(petText));
  if (items.length > 0) return items;

  const jsonText = await runVisionWithRetry(env, imageBase64, mimeType, JSON_FALLBACK_PROMPT);
  console.log("[factura-ia] json fallback sample:", jsonText.slice(0, 400));
  items = pickBetterItemSet(items, parseAnyFormat(jsonText));
  if (items.length > 0) return items;

  console.error("[factura-ia] raw unified:", mainText.slice(0, 1200));
  throw new Error("sin_productos");
}

async function handleLearn(request: Request, env: Env): Promise<Response> {
  let body: { items?: LearnPayloadItem[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido." }, 400);
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return json({ error: "Falta items[] con correcciones." }, 400);
  }
  if (items.length > 500) {
    return json({ error: "Demasiados ítems (máx. 500)." }, 413);
  }
  try {
    const result = await saveLearning(env.LEARN, items);
    return json({ ok: true, ...result });
  } catch (e) {
    console.error("[factura-ia] learn", e);
    return json({ error: "No se pudo guardar el aprendizaje." }, 502);
  }
}

async function handleExtract(request: Request, env: Env): Promise<Response> {
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
    let items = await extractItems(env, imageBase64, mimeType);
    let learned = 0;
    try {
      const enriched = await enrichWithLearning(env.LEARN, items);
      items = enriched.items;
      learned = enriched.applied;
    } catch (e) {
      console.error("[factura-ia] enrich", e);
    }
    return json({ items, learned });
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
            "No pudimos extraer los productos de esa factura. Tocá «Leer factura con IA» otra vez (reintenta automático).",
        },
        422,
      );
    }
    return json(
      { error: "Error temporal del servicio. Esperá 5 segundos y probá de nuevo." },
      502,
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && (path === "/" || path === "/health")) {
      return json({
        ok: true,
        service: "factura-ia",
        learn: Boolean(env.LEARN),
        openai: Boolean(env.OPENAI_API_KEY?.trim()),
        model: env.OPENAI_API_KEY?.trim() ? env.OPENAI_MODEL || "gpt-4o" : "workers-ai-llama-vision",
      });
    }

    if (request.method === "POST" && path === "/learn") {
      return handleLearn(request, env);
    }

    if (request.method === "POST" && (path === "/" || path === "/extract")) {
      return handleExtract(request, env);
    }

    if (request.method !== "POST") {
      return json({ error: "Usá POST /extract o POST /learn." }, 405);
    }
    return json({ error: "Ruta no encontrada. Usá POST / o POST /learn." }, 404);
  },
} satisfies ExportedHandler<Env>;
