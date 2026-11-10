/**
 * Archivos para Excel con las mismas columnas que src-tauri/src/export_products.rs y
 * export_sales.rs. Devuelven el texto; el navegador lo descarga con BOM UTF-8.
 */
import { getDb } from "../../../src/db/index";

export interface CsvExport {
  contents: string;
  count: number;
}

type Row = Record<string, unknown>;

const str = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => Number(v ?? 0) || 0;
const money = (v: unknown) => n(v).toFixed(2);

function cellComma(s: string): string {
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function cellSemi(s: string): string {
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
  mercado_pago: "Mercado Pago",
  fiado: "Fiado",
  cuenta_corriente: "Fiado",
};

function paymentLabel(method: string): string {
  const key = method.toLowerCase();
  if (PAYMENT_LABELS[key]) return PAYMENT_LABELS[key];
  if (!key) return "—";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function splitDateTime(createdAt: string): [string, string] {
  const parts = createdAt.split(" ");
  return parts.length >= 2 ? [parts[0], parts[1]] : [createdAt, ""];
}

function nowLabel(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function businessName(): Promise<string> {
  const db = await getDb();
  const [row] = await db.select<{ value: string | null }[]>("SELECT value FROM settings WHERE key = 'business_name'");
  return row?.value || "Mi comercio";
}

export async function productsCsv(): Promise<CsvExport> {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT p.barcode, p.name, b.name AS brand, s.name AS supplier, c.name AS category,
            p.price, p.cost, p.stock, p.min_stock, p.sku
     FROM products p
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.active = 1
     ORDER BY p.name`,
  );
  const lines = ["barcode,nombre,marca,proveedor,categoria,precio,costo,stock,stock_minimo,sku"];
  for (const r of rows) {
    lines.push(
      [
        cellComma(str(r.barcode)), cellComma(str(r.name)), cellComma(str(r.brand)),
        cellComma(str(r.supplier)), cellComma(str(r.category)),
        n(r.price), n(r.cost), n(r.stock), n(r.min_stock), cellComma(str(r.sku)),
      ].join(","),
    );
  }
  return { contents: `${lines.join("\n")}\n`, count: rows.length };
}

function header(title: string, business: string, days: number): string[] {
  return [title, `Comercio;${cellSemi(business)}`, `Generado;${nowLabel()}`, `Período;últimos ${days} días`, ""];
}

export async function salesCsv(daysRaw: number): Promise<CsvExport> {
  const days = Math.max(1, Math.trunc(daysRaw) || 1);
  const since = `-${days} days`;
  const db = await getDb();
  const lines = header("Walqo - Resumen de ventas", await businessName(), days);

  lines.push("RESUMEN POR MEDIO DE PAGO", "Medio de pago;Operaciones;Total");
  const byPayment = await db.select<Row[]>(
    `SELECT payment_method, COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS sum_total
     FROM sales
     WHERE voided = 0 AND date(created_at) >= date('now', 'localtime', ?1)
     GROUP BY payment_method
     ORDER BY sum_total DESC`,
    [since],
  );
  let grandTotal = 0;
  let grandCount = 0;
  for (const r of byPayment) {
    grandTotal += n(r.sum_total);
    grandCount += n(r.cnt);
    lines.push(`${cellSemi(paymentLabel(str(r.payment_method)))};${n(r.cnt)};${money(r.sum_total)}`);
  }
  lines.push(`TOTAL GENERAL;${grandCount};${money(grandTotal)}`, "");

  lines.push("RESUMEN POR DÍA", "Fecha;Operaciones;Total");
  const byDay = await db.select<Row[]>(
    `SELECT date(created_at) AS d, COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS sum_total
     FROM sales
     WHERE voided = 0 AND date(created_at) >= date('now', 'localtime', ?1)
     GROUP BY date(created_at)
     ORDER BY d ASC`,
    [since],
  );
  for (const r of byDay) lines.push(`${cellSemi(str(r.d))};${n(r.cnt)};${money(r.sum_total)}`);
  lines.push("");

  lines.push(
    "DETALLE DE VENTAS",
    "Fecha;Hora;Nº venta;Caja;Subtotal;Descuento %;Total;Medio de pago;Pagado;Vuelto;Cliente;Vendedor",
  );
  const sales = await db.select<Row[]>(
    `SELECT s.id, s.created_at, s.subtotal, s.discount_pct, s.total, s.payment_method,
            s.paid, s.change_due, COALESCE(c.name, '') AS customer, COALESCE(u.display_name, 'Cajero') AS seller,
            COALESCE(s.device_name, s.device_code, '') AS register
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', ?1)
     ORDER BY s.created_at ASC`,
    [since],
  );
  for (const r of sales) {
    const [fecha, hora] = splitDateTime(str(r.created_at));
    lines.push(
      [
        cellSemi(fecha), cellSemi(hora), n(r.id), cellSemi(str(r.register) || "—"),
        money(r.subtotal), money(r.discount_pct), money(r.total),
        cellSemi(paymentLabel(str(r.payment_method))), money(r.paid), money(r.change_due),
        cellSemi(str(r.customer) || "—"), cellSemi(str(r.seller)),
      ].join(";"),
    );
  }
  return { contents: `${lines.join("\n")}\n`, count: sales.length };
}

export async function salesDetailCsv(daysRaw: number): Promise<CsvExport> {
  const days = Math.max(1, Math.trunc(daysRaw) || 1);
  const since = `-${days} days`;
  const db = await getDb();
  const lines = header("Walqo - Detalle por producto", await businessName(), days);

  const [totals] = await db.select<Row[]>(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(si.line_total), 0) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', ?1)`,
    [since],
  );
  lines.push("RESUMEN", `Líneas de venta;${n(totals?.cnt)}`, `Importe total;${money(totals?.total)}`, "");

  lines.push(
    "DETALLE POR PRODUCTO",
    "Fecha;Hora;Nº venta;Producto;Cantidad;Precio unit.;Descuento %;Total línea;Medio de pago;Vendedor",
  );
  const items = await db.select<Row[]>(
    `SELECT s.created_at, s.id AS sale_id, si.name, si.qty, si.unit_price, si.discount_pct, si.line_total,
            s.payment_method, COALESCE(u.display_name, 'Cajero') AS seller
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.voided = 0 AND date(s.created_at) >= date('now', 'localtime', ?1)
     ORDER BY s.created_at ASC, si.id ASC`,
    [since],
  );
  for (const r of items) {
    const [fecha, hora] = splitDateTime(str(r.created_at));
    lines.push(
      [
        cellSemi(fecha), cellSemi(hora), n(r.sale_id), cellSemi(str(r.name)),
        money(r.qty), money(r.unit_price), money(r.discount_pct), money(r.line_total),
        cellSemi(paymentLabel(str(r.payment_method))), cellSemi(str(r.seller)),
      ].join(";"),
    );
  }
  return { contents: `${lines.join("\n")}\n`, count: items.length };
}
