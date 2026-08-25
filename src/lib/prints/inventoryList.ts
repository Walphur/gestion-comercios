import { formatMoney, formatQty } from "../format";
import { escapeHtml, printHtml } from "../printHtml";
import type { Product } from "../../types";

/** Listado imprimible del inventario actual (lo que hace el botón Inventario útil). */
export function printInventoryList(
  businessName: string,
  currency: string,
  products: Product[],
): void {
  const rows = products
    .map(
      (p) => `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.barcode || p.sku || "—")}</td>
      <td>${escapeHtml(p.category_name || "—")}</td>
      <td class="num">${escapeHtml(formatQty(p.stock ?? 0))}</td>
      <td class="num">${escapeHtml(formatQty(p.min_stock ?? 0))}</td>
      <td class="num">${escapeHtml(formatMoney((p.cost ?? 0) * (p.stock ?? 0), currency))}</td>
    </tr>`,
    )
    .join("");

  const body = `
    <h1>${escapeHtml(businessName)}</h1>
    <p class="muted">Listado de inventario · ${products.length} productos</p>
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Código</th>
          <th>Categoría</th>
          <th class="num">Stock</th>
          <th class="num">Mín.</th>
          <th class="num">Valor costo</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="6">Sin productos</td></tr>`}</tbody>
    </table>
  `;
  printHtml("Inventario", body);
}
