export interface PurchaseGuideLine {
  name: string;
  qty: number;
  unitCost: number;
  salePrice: number;
  supplierCode?: string;
}

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseNum(raw: string): number {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  if (s.includes(",")) return parseFloat(s.replace(",", "."));
  return parseFloat(s);
}

function colIndex(headers: string[], names: string[]): number {
  const norm = headers.map(normHeader);
  for (const name of names) {
    const i = norm.indexOf(normHeader(name));
    if (i >= 0) return i;
  }
  return -1;
}

function supplierCodeFromCell(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  return s.replace(/^CF:\s*/i, "").trim() || undefined;
}

/** CSV generado por Factura con IA (barcode/sku vacíos, cantidades y costos listos). */
export function parsePurchaseGuideCsv(text: string): PurchaseGuideLine[] {
  const raw = text.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    throw new Error("El archivo está vacío o no tiene filas de productos.");
  }

  const headers = parseCsvRow(lines[0]);
  const idxName = colIndex(headers, ["nombre", "name", "descripcion", "producto"]);
  const idxStock = colIndex(headers, ["stock", "cantidad", "cant", "qty"]);
  const idxCost = colIndex(headers, ["costo", "cost"]);
  const idxPrice = colIndex(headers, ["precio", "price", "venta"]);
  const idxProv = colIndex(headers, ["proveedor", "codigo_proveedor", "codigo factura"]);

  if (idxName < 0) {
    throw new Error("No encontramos la columna «nombre» en el CSV.");
  }
  if (idxStock < 0) {
    throw new Error("No encontramos la columna «stock» en el CSV.");
  }

  const out: PurchaseGuideLine[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvRow(line);
    const name = (cells[idxName] ?? "").trim();
    if (!name) continue;

    const qty = parseNum(cells[idxStock] ?? "0");
    if (qty <= 0) continue;

    const unitCost = idxCost >= 0 ? parseNum(cells[idxCost] ?? "0") : 0;
    const salePrice = idxPrice >= 0 ? parseNum(cells[idxPrice] ?? "0") : 0;
    const supplierCode =
      idxProv >= 0 ? supplierCodeFromCell(cells[idxProv] ?? "") : undefined;

    out.push({ name, qty, unitCost, salePrice, supplierCode });
  }

  if (out.length === 0) {
    throw new Error("No hay productos con cantidad en el archivo.");
  }
  return out;
}
