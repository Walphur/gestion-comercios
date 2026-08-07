import JsBarcode from "jsbarcode";
import type { Product } from "../../types";
import { getSetting } from "../../db/settings";
import { formatMoney } from "../format";
import { printHtml, escapeHtml } from "../printHtml";

export const LABEL_WIDTH_MM_KEY = "label_width_mm";
export const LABEL_HEIGHT_MM_KEY = "label_height_mm";
export const LABEL_SHOW_SKU_KEY = "label_show_sku";
export const LABEL_COPIES_KEY = "label_copies";

export interface LabelPrintOptions {
  widthMm: number;
  heightMm: number;
  showSku: boolean;
  copies: number;
}

export async function loadLabelPrintOptions(): Promise<LabelPrintOptions> {
  const [w, h, sku, copies] = await Promise.all([
    getSetting(LABEL_WIDTH_MM_KEY),
    getSetting(LABEL_HEIGHT_MM_KEY),
    getSetting(LABEL_SHOW_SKU_KEY),
    getSetting(LABEL_COPIES_KEY),
  ]);
  return {
    widthMm: Math.min(100, Math.max(30, Number(w) || 50)),
    heightMm: Math.min(80, Math.max(20, Number(h) || 30)),
    showSku: sku !== "0",
    copies: Math.min(20, Math.max(1, Number(copies) || 1)),
  };
}

function barcodeSvg(value: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, value, {
      format: "CODE128",
      displayValue: true,
      fontSize: 11,
      height: 36,
      margin: 0,
      width: 1.4,
      background: "#ffffff",
    });
  } catch {
    return `<div class="label-code">${escapeHtml(value)}</div>`;
  }
  return svg.outerHTML;
}

export async function printProductLabels(
  products: Pick<Product, "name" | "price" | "barcode" | "sku">[],
  currency: string,
  options?: Partial<LabelPrintOptions>,
): Promise<void> {
  if (products.length === 0) throw new Error("No hay productos para imprimir.");
  const opts = { ...(await loadLabelPrintOptions()), ...options };
  const cards: string[] = [];

  for (const p of products) {
    const code = (p.barcode || p.sku || "").trim();
    const barcodeHtml = code
      ? barcodeSvg(code)
      : `<div class="label-code muted">Sin código</div>`;
    const skuLine =
      opts.showSku && p.sku?.trim() && p.sku.trim() !== code
        ? `<div class="label-sku">SKU ${escapeHtml(p.sku.trim())}</div>`
        : "";

    const card = `
      <div class="label-card">
        <div class="label-name">${escapeHtml(p.name)}</div>
        <div class="label-price">${escapeHtml(formatMoney(p.price, currency))}</div>
        ${skuLine}
        <div class="label-barcode">${barcodeHtml}</div>
      </div>`;

    for (let i = 0; i < opts.copies; i++) cards.push(card);
  }

  const extraCss = `
    body { margin: 6mm; }
    .label-sheet {
      display: flex;
      flex-wrap: wrap;
      gap: 3mm;
      align-content: flex-start;
    }
    .label-card {
      width: ${opts.widthMm}mm;
      height: ${opts.heightMm}mm;
      border: 1px dashed #cbd5e1;
      padding: 2mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .label-name {
      font-size: 10px;
      font-weight: 700;
      line-height: 1.2;
      max-height: 2.4em;
      overflow: hidden;
    }
    .label-price {
      font-size: 14px;
      font-weight: 800;
      margin: 1mm 0;
    }
    .label-sku { font-size: 9px; color: #475569; }
    .label-barcode { text-align: center; }
    .label-barcode svg { max-width: 100%; height: auto; }
    .label-code { font-size: 10px; font-family: ui-monospace, monospace; }
    .muted { color: #94a3b8; }
    @media print {
      body { margin: 4mm; }
      .label-card { border-color: #94a3b8; }
    }
  `;

  printHtml("Etiquetas", `<div class="label-sheet">${cards.join("")}</div>`, extraCss);
}
