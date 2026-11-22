import { formatMoney, formatQty } from "../format";
import { escapeHtml, printHtml } from "../printHtml";
import { formatBagLooseStock, productSellsLoose } from "../bagLoose";
import type { Product } from "../../types";

/** Columnas disponibles en el listado de inventario / productos. */
export type InventoryColumnId =
  | "name"
  | "code"
  | "category"
  | "brand"
  | "stock"
  | "min"
  | "price"
  | "cost"
  | "costValue";

export interface InventoryColumnDef {
  id: InventoryColumnId;
  label: string;
  num?: boolean;
  /** Solo si canViewStock. */
  needsStock?: boolean;
  /** Solo si canViewCost (dueño / encargado). */
  needsCost?: boolean;
}

export const INVENTORY_COLUMNS: InventoryColumnDef[] = [
  { id: "name", label: "Producto" },
  { id: "code", label: "Código" },
  { id: "category", label: "Categoría" },
  { id: "brand", label: "Marca" },
  { id: "stock", label: "Stock", num: true, needsStock: true },
  { id: "min", label: "Mín.", num: true, needsStock: true },
  { id: "price", label: "Precio venta", num: true },
  { id: "cost", label: "Costo", num: true, needsCost: true },
  { id: "costValue", label: "Valor costo", num: true, needsStock: true, needsCost: true },
];

export const DEFAULT_INVENTORY_COLUMNS: InventoryColumnId[] = [
  "name",
  "code",
  "stock",
  "price",
];

export type InventoryExportFormat = "pdf" | "excel";

export interface InventoryListOptions {
  businessName: string;
  currency: string;
  products: Product[];
  columns: InventoryColumnId[];
  /** Texto del subtítulo (filtros, seleccionados, etc.). */
  scopeLabel?: string;
}

function csvNumber(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");
}

function csvCell(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function stockText(p: Product): string {
  if (p.track_stock === 0) return "—";
  if (productSellsLoose(p)) {
    return formatBagLooseStock(p.stock, p.open_bag_kg ?? 0, formatQty);
  }
  return formatQty(p.stock ?? 0);
}

function cellValue(p: Product, col: InventoryColumnId, currency: string): string {
  switch (col) {
    case "name":
      return p.name || "";
    case "code":
      return p.barcode || p.sku || "—";
    case "category":
      return p.category_name || "—";
    case "brand":
      return p.brand_name || "—";
    case "stock":
      return stockText(p);
    case "min":
      return p.track_stock === 0 ? "—" : formatQty(p.min_stock ?? 0);
    case "price":
      return formatMoney(p.price ?? 0, currency);
    case "cost":
      return formatMoney(p.cost ?? 0, currency);
    case "costValue":
      return p.track_stock === 0
        ? "—"
        : formatMoney((p.cost ?? 0) * (p.stock ?? 0), currency);
    default:
      return "";
  }
}

/** Valor numérico crudo para Excel (coma decimal) cuando aplica. */
function cellCsvValue(p: Product, col: InventoryColumnId, currency: string): string {
  switch (col) {
    case "stock":
      if (p.track_stock === 0) return "—";
      if (productSellsLoose(p)) return stockText(p);
      return csvNumber(p.stock ?? 0);
    case "min":
      return p.track_stock === 0 ? "—" : csvNumber(p.min_stock ?? 0);
    case "price":
      return csvNumber(p.price ?? 0);
    case "cost":
      return csvNumber(p.cost ?? 0);
    case "costValue":
      return p.track_stock === 0 ? "—" : csvNumber((p.cost ?? 0) * (p.stock ?? 0));
    default:
      return cellValue(p, col, currency);
  }
}

export function resolveInventoryColumns(
  selected: InventoryColumnId[],
  opts: { canViewStock: boolean; canViewCost: boolean },
): InventoryColumnDef[] {
  const want = new Set(selected);
  // Nombre siempre va: sin él el listado no se entiende.
  want.add("name");
  return INVENTORY_COLUMNS.filter((c) => {
    if (!want.has(c.id)) return false;
    if (c.needsStock && !opts.canViewStock) return false;
    if (c.needsCost && !opts.canViewCost) return false;
    return true;
  });
}

/** Columnas por defecto según permisos. */
export function defaultInventoryColumns(opts: {
  canViewStock: boolean;
  canViewCost: boolean;
}): InventoryColumnId[] {
  return resolveInventoryColumns(DEFAULT_INVENTORY_COLUMNS, opts).map((c) => c.id);
}

/** Imprime o guarda PDF del listado con las columnas elegidas. */
export function printInventoryList(options: InventoryListOptions): void {
  const cols = options.columns.length
    ? INVENTORY_COLUMNS.filter((c) => options.columns.includes(c.id))
    : INVENTORY_COLUMNS.filter((c) => DEFAULT_INVENTORY_COLUMNS.includes(c.id));
  const { businessName, currency, products, scopeLabel } = options;

  const head = cols
    .map((c) => `<th${c.num ? ' class="num"' : ""}>${escapeHtml(c.label)}</th>`)
    .join("");
  const rows = products
    .map(
      (p) =>
        `<tr>${cols
          .map(
            (c) =>
              `<td${c.num ? ' class="num"' : ""}>${escapeHtml(cellValue(p, c.id, currency))}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  const scope =
    scopeLabel?.trim() ||
    `${products.length.toLocaleString("es-AR")} producto${products.length === 1 ? "" : "s"}`;

  const body = `
    <h1>${escapeHtml(businessName)}</h1>
    <p class="muted">Listado de inventario · ${escapeHtml(scope)}</p>
    <table>
      <thead><tr>${head}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${cols.length}">Sin productos</td></tr>`}</tbody>
    </table>
  `;
  printHtml("Inventario", body);
}

/** CSV con BOM implícito vía writeCsvExport; separador «;» para Excel en español. */
export function inventoryListCsv(options: InventoryListOptions): string {
  const cols = options.columns.length
    ? INVENTORY_COLUMNS.filter((c) => options.columns.includes(c.id))
    : INVENTORY_COLUMNS.filter((c) => DEFAULT_INVENTORY_COLUMNS.includes(c.id));
  const { businessName, currency, products, scopeLabel } = options;
  const lines: string[][] = [
    ["WalQo - Listado de inventario"],
    ["Comercio", businessName],
    [
      "Alcance",
      scopeLabel?.trim() ||
        `${products.length} producto${products.length === 1 ? "" : "s"}`,
    ],
    [],
    cols.map((c) => c.label),
  ];
  for (const p of products) {
    lines.push(cols.map((c) => cellCsvValue(p, c.id, currency)));
  }
  return lines.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
