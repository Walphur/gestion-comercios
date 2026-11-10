/**
 * Lectura de una planilla de productos con las reglas de src-tauri/src/import_products.rs:
 * fila de encabezados, columnas por nombre aproximado, números en formato argentino y margen.
 * Sin base de datos: la web prepara las filas acá y el servidor las guarda.
 */

export interface Spreadsheet {
  headers: string[];
  rows: string[][];
}

export interface ImportRow {
  barcode: string | null;
  sku: string | null;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  category: string | null;
  brand: string | null;
  supplier: string | null;
  unit: string;
  tax_rate: number;
}

export interface PreparedImport {
  rows: ImportRow[];
  skipped: number;
  /** Avisos de lectura (encabezados, columnas detectadas). */
  notes: string[];
  /** Va al final, después de lo que diga el guardado. */
  marginNote: string | null;
}

type Col = number | null;

interface ColumnMap {
  name: Col;
  barcode: Col;
  sku: Col;
  price: Col;
  cost: Col;
  stock: Col;
  min_stock: Col;
  category: Col;
  cat1: Col;
  cat2: Col;
  cat3: Col;
  brand: Col;
  supplier: Col;
  unit: Col;
  tax: Col;
}

const ACCENTS: Record<string, string> = {
  á: "a", à: "a", ä: "a", â: "a", ã: "a", å: "a",
  é: "e", è: "e", ë: "e", ê: "e",
  í: "i", ì: "i", ï: "i", î: "i",
  ó: "o", ò: "o", ö: "o", ô: "o", õ: "o",
  ú: "u", ù: "u", ü: "u", û: "u",
  ñ: "n",
};

function stripAccents(s: string): string {
  let out = "";
  for (const ch of s) {
    const lower = ch.toLowerCase();
    out += ACCENTS[lower] ?? (ch.charCodeAt(0) < 128 ? lower : ch);
  }
  return out;
}

export function normalizeHeader(h: string): string {
  let t = stripAccents(h.trim()).replace(/[ \-./():;\t"']/g, "_");
  while (t.includes("__")) t = t.replace(/__/g, "_");
  return t.replace(/^_+|_+$/g, "");
}

const HEADER_KEYS = [
  "nombre", "name", "codigo", "barcode", "ean", "sku", "precio", "price", "costo", "cost",
  "stock", "categoria", "marca", "proveedor", "articulo", "producto", "descripcion",
];

function scoreRowAsHeader(row: string[]): number {
  let score = 0;
  let nonEmpty = 0;
  for (const cell of row) {
    const raw = cell.trim();
    if (!raw) continue;
    nonEmpty += 1;
    const norm = normalizeHeader(raw);
    if (!norm) continue;
    if (/^\d{10,}$/.test(raw)) continue;
    for (const k of HEADER_KEYS) if (norm === k || norm.includes(k)) score += 2;
    if (norm.length <= 40) score += 1;
  }
  if (nonEmpty >= 2) score += 1;
  return score;
}

function resolveHeaderRow(sheet: Spreadsheet): { headers: string[]; rows: string[][]; note: string | null } {
  const all = [sheet.headers, ...sheet.rows];
  const scan = Math.min(all.length, 15);
  let best = 0;
  let bestScore = scoreRowAsHeader(all[0]);
  for (let i = 1; i < scan; i++) {
    const s = scoreRowAsHeader(all[i]);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return {
    headers: all[best],
    rows: all.slice(best + 1),
    note: best === 0 ? null : `Encabezados detectados en la fila ${best + 1} del archivo.`,
  };
}

function fieldIndexFuzzy(headers: Map<string, number>, aliases: string[], contains: string[]): Col {
  for (const a of aliases) {
    const i = headers.get(a);
    if (i !== undefined) return i;
  }
  // El encabezado más corto que coincida: un título «codigo;nombre;marca…» no se queda con todo.
  let best: [number, number] | null = null;
  for (const [h, i] of headers) {
    for (const sub of contains) {
      if (h === sub || h.includes(sub)) {
        if (!best || h.length < best[0]) best = [h.length, i];
      }
    }
  }
  return best ? best[1] : null;
}

function fieldIndexCost(headers: Map<string, number>): Col {
  for (const a of ["costo_iva", "costo_con_iva", "costoiva", "precio_costo_iva", "cost_iva"]) {
    const i = headers.get(a);
    if (i !== undefined) return i;
  }
  return fieldIndexFuzzy(
    headers,
    ["cost", "costo", "costo_compra", "precio_costo", "compra"],
    ["costo", "cost", "compra"],
  );
}

function mapColumns(headers: Map<string, number>): ColumnMap {
  let tax: Col = null;
  for (const a of ["tax_rate", "alicuota", "alicuota_iva", "porcentaje_iva", "iva_pct", "iva"]) {
    const i = headers.get(a);
    if (i !== undefined) {
      tax = i;
      break;
    }
  }
  return {
    name: fieldIndexFuzzy(
      headers,
      ["name", "nombre", "producto", "articulo", "item", "denominacion", "detalle"],
      ["nombre", "descrip", "product", "articul", "item", "denomin", "detalle"],
    ),
    barcode: fieldIndexFuzzy(
      headers,
      [
        "barcode", "codigo", "codigo_barras", "cod_barras", "cod_barra", "ean", "ean13", "barra",
        "gtin", "upc", "codigo_de_barras", "cod_producto", "codigo_producto",
      ],
      ["barcode", "codigo", "barras", "ean", "gtin", "upc"],
    ),
    sku: fieldIndexFuzzy(
      headers,
      ["sku", "codigo_interno", "cod_interno", "id_producto", "cod_articulo"],
      ["sku", "interno", "articulo"],
    ),
    price: fieldIndexFuzzy(
      headers,
      ["price", "precio", "precio_venta", "pvp", "venta", "importe", "precio_publico"],
      ["precio", "price", "pvp", "venta", "importe"],
    ),
    cost: fieldIndexCost(headers),
    stock: fieldIndexFuzzy(
      headers,
      ["stock", "cantidad", "existencia", "existencias", "inventario", "qty"],
      ["stock", "cantidad", "existenc", "invent"],
    ),
    min_stock: fieldIndexFuzzy(
      headers,
      ["min_stock", "stock_minimo", "minimo", "stock_min"],
      ["minimo", "min_stock"],
    ),
    category: fieldIndexFuzzy(
      headers,
      ["category", "categoria", "rubro", "familia", "linea", "tipo", "seccion"],
      ["categoria", "category", "rubro", "familia", "linea", "seccion"],
    ),
    cat1: fieldIndexFuzzy(headers, ["cat1", "categoria_1", "rubro_1"], ["cat1", "categoria_1"]),
    cat2: fieldIndexFuzzy(headers, ["cat2", "categoria_2", "rubro_2"], ["cat2", "categoria_2"]),
    cat3: fieldIndexFuzzy(headers, ["cat3", "categoria_3", "rubro_3"], ["cat3", "categoria_3"]),
    brand: fieldIndexFuzzy(headers, ["brand", "marca"], ["marca", "brand"]),
    supplier: fieldIndexFuzzy(headers, ["supplier", "proveedor", "proveedores"], ["proveedor", "supplier"]),
    unit: fieldIndexFuzzy(headers, ["unit", "unidad", "um"], ["unidad", "unit"]),
    tax,
  };
}

function applyPositionalFallback(cols: ColumnMap, headerCount: number, notes: string[]) {
  if (cols.name != null || cols.barcode != null || cols.sku != null) return;
  if (headerCount >= 2) {
    cols.name = 0;
    cols.barcode = 1;
    notes.push(
      "No reconocimos los títulos de columna: usamos la 1.ª columna como nombre y la 2.ª como código.",
    );
    if (headerCount >= 3 && cols.price == null) cols.price = 2;
    if (headerCount >= 4 && cols.cost == null) cols.cost = 3;
    if (headerCount >= 5 && cols.stock == null) cols.stock = 4;
  } else if (headerCount === 1) {
    cols.name = 0;
    notes.push("Una sola columna: se tomó como nombre del producto.");
  }
}

function formatHeadersHint(raw: string[]): string {
  const shown = raw
    .map((h) => h.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((h) => `«${h}»`);
  return shown.length === 0
    ? "El archivo no tiene títulos de columna en la primera fila."
    : `Columnas leídas: ${shown.join(", ")}`;
}

/** 1.234,56 (formato argentino), 1234.56 o 1234,56. */
export function parseImportNumber(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  let normalized = t;
  if (t.includes(".") && t.includes(",")) normalized = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/,/g) ?? []).length === 1 && !t.includes(".")) normalized = t.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && normalized.trim() !== "" ? n : 0;
}

function cell(row: string[], idx: Col): string {
  return idx == null ? "" : (row[idx] ?? "").trim();
}

function categoryAndDescription(row: string[], cols: ColumnMap): [string | null, string | null] {
  const c1 = cell(row, cols.cat1);
  const single = cell(row, cols.category);
  const primary = c1 || single;
  const sub = [cell(row, cols.cat2), cell(row, cols.cat3)].filter(Boolean);
  return [primary || null, sub.length ? sub.join(" / ") : null];
}

export function prepareProductImport(
  sheet: Spreadsheet,
  opts: { marginPercent: number | null; categoriesFilter?: Set<string> | null },
): PreparedImport {
  const resolved = resolveHeaderRow(sheet);
  const notes: string[] = [];
  if (resolved.note) notes.push(resolved.note);

  const headers = new Map<string, number>();
  resolved.headers.forEach((h, i) => {
    const norm = normalizeHeader(h);
    if (norm) headers.set(norm, i);
  });
  const cols = mapColumns(headers);
  applyPositionalFallback(cols, resolved.headers.length, notes);

  const margin = opts.marginPercent;
  if (margin != null && cols.price == null) {
    notes.push("Sin columna de precio: se calculará venta = costo × (1 + margen%).");
  }
  const colName = (idx: Col) => (idx == null ? "—" : resolved.headers[idx] ?? "—");
  notes.push(
    `Columnas: código=${colName(cols.barcode)}, nombre=${colName(cols.name)}, marca=${colName(cols.brand)}, costo=${colName(cols.cost)}, precio=${colName(cols.price)}.`,
  );

  if (cols.name == null && cols.barcode == null && cols.sku == null) {
    throw new Error(
      `No pudimos identificar nombre ni código de producto.\n${formatHeadersHint(resolved.headers)}\n\n` +
        "Poné al menos una columna con título parecido a nombre, código, EAN o SKU " +
        "(también sirve Código, Descripción, etc.). Las demás columnas son opcionales.",
    );
  }

  const rows: ImportRow[] = [];
  let skipped = 0;
  let marginApplied = 0;
  for (const record of resolved.rows) {
    const name = cell(record, cols.name);
    const barcode = cell(record, cols.barcode) || null;
    const sku = cell(record, cols.sku) || null;
    const displayName = name || (barcode ? `Producto ${barcode}` : sku ? `Producto ${sku}` : "");
    if (!displayName) {
      skipped += 1;
      continue;
    }
    const [category, description] = categoryAndDescription(record, cols);
    if (opts.categoriesFilter) {
      const key = (category ?? "").trim().toLowerCase();
      if (!key || !opts.categoriesFilter.has(key)) {
        skipped += 1;
        continue;
      }
    }
    const cost = cols.cost == null ? 0 : parseImportNumber(cell(record, cols.cost));
    let price = cols.price == null ? 0 : parseImportNumber(cell(record, cols.price));
    if (price <= 0 && margin != null && cost > 0 && margin >= 0) {
      price = Math.round(cost * (1 + margin / 100) * 100) / 100;
      marginApplied += 1;
    }
    rows.push({
      barcode,
      sku,
      name: displayName,
      description,
      price,
      cost,
      stock: cols.stock == null ? 0 : parseImportNumber(cell(record, cols.stock)),
      min_stock: cols.min_stock == null ? 0 : parseImportNumber(cell(record, cols.min_stock)),
      category,
      brand: cell(record, cols.brand) || null,
      supplier: cell(record, cols.supplier) || null,
      unit: cell(record, cols.unit) || "unidad",
      tax_rate: cols.tax == null ? 21 : parseImportNumber(cell(record, cols.tax)),
    });
  }

  return {
    rows,
    skipped,
    notes,
    marginNote:
      marginApplied > 0 && margin != null
        ? `Precio de venta calculado con margen ${margin}% sobre el costo en ${marginApplied} productos.`
        : null,
  };
}
