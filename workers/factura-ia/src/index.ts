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
CANT|CODIGO-DESCRIPCION|PRECIO_UNITARIO|TOTAL_LINEA
- CANT = columna Cant exacta (ej 9, 18, 1, 10). NUNCA el número de fila.
- CODIGO-DESCRIPCION = texto de Descripcion tal cual (ej 1523-ALFAJOR TATIN NEGRO). Sin prefijo PR.
- PRECIO_UNITARIO = columna Precio.
- TOTAL_LINEA = columna Total (= cant × precio).
- Si el nombre está cortado en el papel, transcribí lo que se lea igual.

Ejemplo tique:
9|1523-ALFAJOR TATIN NEGRO|122.49|1102.44
18|150-AGUA FRESH SABORIZA|209.98|3779.69
1|2090-AQUARIUS X 1.5 X6|1973.39|1973.39

TIPO C — Tabla Quantity / Item / Unit Price / Amount (petshop, códigos PR11…):
CANT|CODIGO|NOMBRE|PRECIO_UNIT|TOTAL
- CANT = columna Quantity (ej 3, 2, 6). NUNCA el número de fila (1, 2, 3…).
- CODIGO = código al inicio del Item (ej PR114046).
- NOMBRE = resto del Item sin el código.
- PRECIO_UNIT = columna Unit Price (ej $50 055,49). NUNCA uses Amount como unitario.
- TOTAL = columna Amount (importe total de la fila).
- Omití filas ZD, BONIFICACIÓN o montos negativos.

TIPO A es para Coca-Cola / FEMSA / mayoristas con columna PRODUCTO de 6 dígitos (100433).
En TIPO A: CODIGO sin prefijo PR. PACKS = CANTIDAD en bultos (no unidades totales).

Ejemplo mayorista:
100433|Coca Cola RED 2L REF X8|3|4780.46

Ejemplo petshop:
3|PR114046|AGILITY CATS ADULTO X 10 KG|50055.49|150166.47

Sin encabezados, sin IVA, sin pie de página.`;

const PETSHOP_PROMPT = `Esta factura tiene columnas Quantity, Item, IVA, Unit Price, Amount.
Cada Item empieza con código PR y números (ej PR114046).

Transcribí CADA fila de producto. Formato exacto, una línea por producto:
CANT|CODIGO|NOMBRE|PRECIO_UNIT|TOTAL

- CANT = columna Quantity (ej 3, 2, 6). NUNCA el número de fila ni el orden (1, 2, 3…).
- PRECIO_UNIT = columna Unit Price (con centavos). NUNCA dividas Amount por Quantity.
- TOTAL = columna Amount (importe total de la fila).
- NO incluyas filas ZD, BONIFICACIÓN ni importes negativos.
- NO inventes productos que no estén en la imagen.

Ejemplo:
3|PR114046|AGILITY CATS ADULTO X 10 KG|50055.49|150166.47
2|PR114049|AGILITY CATS URINARY X 10 KG|54170.38|108340.76`;

const DISTRIBUTOR_PROMPT = `Factura mayorista argentina (Coca-Cola FEMSA, FACTURA CONTADO, etc.).
Columnas: PRODUCTO (6 dígitos), DETALLE, CANTIDAD (packs/bultos), PRECIO UNITARIO.

Transcribí TODAS las filas de producto visibles en la imagen. Una línea por producto:
CODIGO|DETALLE|PACKS|PRECIO_PACK

- CODIGO = columna PRODUCTO (6 dígitos, ej 100433). Sin prefijo PR.
- DETALLE = texto completo del producto (incluye X8, X6, 1x8, etc.).
- PACKS = columna CANTIDAD en bultos/packs (ej 1, 2, 3). NO las unidades totales.
- PRECIO_PACK = PRECIO UNITARIO del bulto (no el total de la fila).
- NO inventes productos. NO omitas filas.

Ejemplo:
100433|Coca Cola RED 2L REF X8|3|4780.46
102018|Sprite 2L REF 100MTP# X8|2|4953.42`;

const TIQUE_PROMPT = `Tique o Factura B de kiosco (columnas Cant, Descripcion, Precio, Total).
La Descripcion suele ser CODIGO-NOMBRE (ej 1523-ALFAJOR TATIN NEGRO, 150-AGUA FRESH SABORIZA).

Transcribí TODAS las filas visibles. Una línea por producto:
CANT|CODIGO-DESCRIPCION|PRECIO|TOTAL

- CANT = columna Cant (ej 9, 18, 1, 10). NUNCA el número de fila.
- CODIGO-DESCRIPCION = Descripcion completa tal como se lea (aunque esté cortada).
- PRECIO = columna Precio. TOTAL = columna Total.
- NO agregues prefijo PR a los códigos.
- NO inventes productos ni nombres que no estén en la imagen.

Ejemplo:
9|1523-ALFAJOR TATIN NEGRO|122.49|1102.44
18|150-AGUA FRESH SABORIZA|209.98|3779.69
1|687-COCA X 500 X12|2231.99|2231.99
10|269-MARLBORO FUSION 20|640.00|6400.00`;

const JSON_FALLBACK_PROMPT = `Lista SOLO los productos visibles en esta factura (nada inventado).
Si es mayorista Coca-Cola (códigos 10xxxx): {"codigo":"100433","nombre":"Coca Cola RED 2L REF X8","packs":3,"precio_pack":4780.46}
Si es tique kiosco: {"codigo":"1523","nombre":"ALFAJOR TATIN NEGRO","cant":9,"precio_unit":122.49,"total_linea":1102.44}
Si es petshop (códigos PR11…): {"codigo":"PR114046","nombre":"AGILITY CATS ADULTO X 10 KG","cant":3,"precio_unit":50055.49,"total_linea":150166.47}
JSON array sin markdown:
[{"codigo":"1523","nombre":"ALFAJOR TATIN NEGRO","cant":9,"precio_unit":122.49,"total_linea":1102.44}]`;

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
): InvoiceItem {
  const mult = extractPackMultiplier(detalle);
  const stockUnits = Math.round(packs * mult);
  const unitCost = mult > 1 && precioPack > 0 ? precioPack / mult : precioPack;
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
): InvoiceItem | null {
  if (!detalle || qtyOrPacks <= 0 || qtyOrPacks > 50_000) return null;
  const mult = extractPackMultiplier(detalle);
  let packs = qtyOrPacks;

  if (mult > 1 && qtyOrPacks >= mult && qtyOrPacks % mult === 0) {
    const asPacks = qtyOrPacks / mult;
    if (asPacks >= 1 && asPacks <= 500 && asPacks < qtyOrPacks) {
      packs = asPacks;
    }
  }

  if (packs > 500) return null;
  return finalizeDistributor(codigo, detalle, packs, precioPack);
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
    if (/^(producto|detalle|cantidad|codigo|tipo|ejemplo|regla)/i.test(trimmed)) continue;

    if (!trimmed.includes("|")) {
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
      if (!parts[1] || packs <= 0 || packs > 500) continue;
      const item = finalizeDistributorSmart(parts[0], parts[1], packs, costoPack);
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
        );
        if (item) items.push(item);
        continue;
      }
    }

    const m = line.match(/^(\d{6})\s+(.+?)\s+(\d+[,.]\d{2}|\d+)\s+([\d.,]+)/);
    if (!m) continue;
    const packs = parseArgNumber(m[3]);
    if (packs <= 0 || packs > 500) continue;
    let detalle = m[2].trim().replace(/\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+.*$/, "").trim();
    const item = finalizeDistributorSmart(m[1], detalle, packs, parseArgNumber(m[4]));
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
  if (/FACTURA CONTADO/i.test(text)) return true;
  const wholesale = items.filter((it) => it.codigo && isWholesaleNumericCode(it.codigo)).length;
  return wholesale >= 2 || (items.length > 0 && wholesale / items.length >= 0.5);
}

function scoreItemSet(items: InvoiceItem[]): number {
  let score = items.length * 10;
  for (const it of items) {
    if (it.codigo && !/^PR?\d{3,4}$/i.test(it.nombre.trim())) score += 5;
    if (it.tipo === "mayorista") score += 2;
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

    if (codigoNorm && isDistributorCode(codigoNorm)) {
      const packs = Number(
        r.packs ?? r.cantidad_packs ?? r.bultos ?? r.cantidad ?? r.cant ?? 1,
      );
      const costoPack = Number(r.precio_pack ?? r.precio_unit ?? r.costo ?? r.cost ?? r.precio ?? 0);
      const item = finalizeDistributorSmart(codigoNorm, nombre, packs > 0 ? packs : 1, costoPack);
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
    if (!item.nombre || item.nombre.length < 2) continue;
    if (/bonificaci[oó]n/i.test(item.nombre)) continue;
    if (item.codigo && /^ZD/i.test(item.codigo)) continue;
    if (item.costo <= 0 || item.costo > 2_000_000) continue;
    if ((item.stock ?? 0) <= 0 || (item.stock ?? 0) > 50_000) continue;

    const key = `${item.codigo ?? ""}|${normNameKey(item.nombre)}|${item.stock}|${item.costo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return fixSequentialPetshopMath(out);
}

function parseAnyFormat(text: string): InvoiceItem[] {
  let items = parsePipeLines(text);
  if (items.length === 0) items = parseTicketFallback(text);
  if (items.length === 0) items = parsePetshopFallback(text);
  if (countTicketHints(text) >= 2) {
    const ticketItems = parseTicketFallback(text);
    if (ticketItems.length > 0) items = pickBetterItemSet(items, ticketItems);
  }
  if (items.length === 0 || countDistributorHints(text) >= 2) {
    const distItems = parseDistributorFallback(text);
    if (distItems.length > 0) items = pickBetterItemSet(items, distItems);
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

  if (looksLikeDistributorInvoice(mainText, items)) {
    const distText = await runVisionWithRetry(env, imageBase64, mimeType, DISTRIBUTOR_PROMPT);
    console.log("[factura-ia] distributor sample:", distText.slice(0, 600));
    items = pickBetterItemSet(items, parseAnyFormat(distText));
  } else if (looksLikeTicketInvoice(mainText, items)) {
    const ticketText = await runVisionWithRetry(env, imageBase64, mimeType, TIQUE_PROMPT);
    console.log("[factura-ia] ticket sample:", ticketText.slice(0, 600));
    items = pickBetterItemSet(items, parseAnyFormat(ticketText));
  }

  if (items.length > 0) return items;

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
  },
} satisfies ExportedHandler<Env>;
