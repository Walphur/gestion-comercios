/**
 * Lee un Excel (.xlsx) o CSV en el navegador, como src-tauri/src/spreadsheet.ts en la PC:
 * primera hoja, primera fila como encabezados y celdas como texto.
 */
import { strFromU8, unzipSync } from "fflate";
import type { Spreadsheet } from "../lib/productImport";
import { readFileText } from "./files";

const XLS_MESSAGE =
  "En WalQo Web no se pueden leer archivos .xls viejos. Abrilo en Excel y guardalo como .xlsx o CSV.";

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const commas = (first.match(/,/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

/** CSV con comillas, saltos de línea dentro de comillas y filas de distinto largo. */
function parseCsvRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  record.push(field);
  if (record.length > 1 || record[0] !== "") records.push(record);
  return records.map((r) => r.map((c) => c.trim()));
}

function parseCsv(text: string): Spreadsheet {
  const records = parseCsvRecords(text, detectDelimiter(text));
  const headers = records[0] ?? [];
  if (headers.length === 1 && headers[0].includes(";")) {
    throw new Error(
      "El CSV parece usar punto y coma (;) pero no se pudo separar en columnas. " +
        "Guardalo con separador coma (,) o volvé a exportarlo.",
    );
  }
  const rows = records
    .slice(1)
    .map((r) => Array.from({ length: Math.max(headers.length, r.length) }, (_, i) => r[i] ?? ""));
  return { headers, rows };
}

function xml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

const byTag = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS("*", tag));

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

function numberText(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw.trim();
}

function parseXlsx(bytes: Uint8Array): Spreadsheet {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        f.name === "xl/workbook.xml" ||
        f.name === "xl/_rels/workbook.xml.rels" ||
        f.name === "xl/sharedStrings.xml" ||
        f.name.startsWith("xl/worksheets/sheet"),
    });
  } catch {
    throw new Error("No se pudo abrir el Excel. Probá guardarlo de nuevo como .xlsx o CSV.");
  }
  const workbook = files["xl/workbook.xml"];
  if (!workbook) throw new Error("No se pudo abrir el Excel. Probá guardarlo de nuevo como .xlsx o CSV.");

  const firstSheet = byTag(xml(strFromU8(workbook)), "sheet")[0];
  if (!firstSheet) throw new Error("El archivo Excel no tiene hojas.");
  const relId =
    firstSheet.getAttribute("r:id") ??
    firstSheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  let sheetPath = "xl/worksheets/sheet1.xml";
  const rels = files["xl/_rels/workbook.xml.rels"];
  if (rels && relId) {
    const rel = byTag(xml(strFromU8(rels)), "Relationship").find((r) => r.getAttribute("Id") === relId);
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = files[sheetPath];
  if (!sheet) throw new Error("El archivo Excel no tiene hojas.");

  const shared = files["xl/sharedStrings.xml"]
    ? byTag(xml(strFromU8(files["xl/sharedStrings.xml"])), "si").map((si) =>
        byTag(si, "t")
          .filter((t) => t.parentElement?.localName !== "rPh")
          .map((t) => t.textContent ?? "")
          .join(""),
      )
    : [];

  const cells = new Map<number, Map<number, string>>();
  let minRow = Infinity;
  let maxRow = -1;
  let minCol = Infinity;
  let maxCol = -1;
  let rowSeq = -1;
  for (const rowEl of byTag(xml(strFromU8(sheet)), "row")) {
    const r = Number(rowEl.getAttribute("r") ?? 0) - 1;
    rowSeq = r >= 0 ? r : rowSeq + 1;
    let colSeq = -1;
    for (const c of byTag(rowEl, "c")) {
      const ref = c.getAttribute("r");
      colSeq = ref ? columnIndex(ref) : colSeq + 1;
      const type = c.getAttribute("t") ?? "n";
      const v = byTag(c, "v")[0]?.textContent ?? "";
      let text: string;
      if (type === "s") text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = byTag(c, "t").map((t) => t.textContent ?? "").join("");
      else if (type === "b") text = v === "1" ? "1" : "0";
      else if (type === "e") text = "";
      else if (type === "str") text = v;
      else text = v === "" ? "" : numberText(v);
      text = text.trim();
      if (!text) continue;
      if (!cells.has(rowSeq)) cells.set(rowSeq, new Map());
      cells.get(rowSeq)!.set(colSeq, text);
      minRow = Math.min(minRow, rowSeq);
      maxRow = Math.max(maxRow, rowSeq);
      minCol = Math.min(minCol, colSeq);
      maxCol = Math.max(maxCol, colSeq);
    }
  }
  if (maxRow < 0) throw new Error("El archivo Excel está vacío.");

  const width = maxCol - minCol + 1;
  const line = (r: number) => Array.from({ length: width }, (_, i) => cells.get(r)?.get(minCol + i) ?? "");
  const rows: string[][] = [];
  for (let r = minRow + 1; r <= maxRow; r++) {
    if (cells.has(r)) rows.push(line(r));
  }
  return { headers: line(minRow), rows };
}

export async function readSpreadsheet(file: File): Promise<Spreadsheet> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) {
    return parseXlsx(new Uint8Array(await file.arrayBuffer()));
  }
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw new Error(XLS_MESSAGE);
  }
  return parseCsv(await readFileText(file));
}
