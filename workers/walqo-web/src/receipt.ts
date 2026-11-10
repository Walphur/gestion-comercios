/**
 * Datos del ticket de venta, con las consultas de src-tauri/src/receipt.rs.
 * En la web lo imprime el navegador (src/lib/prints/saleReceipt.ts).
 */
import { getDb } from "../../../src/db/index";
import type { SaleReceiptData } from "../../../src/lib/prints/saleReceipt";

async function setting(key: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.select<{ value: string | null }[]>("SELECT value FROM settings WHERE key = ?1", [key]);
  return row?.value ?? null;
}

export async function printerSettings(): Promise<{ enabled: boolean; width: number }> {
  const width = Number.parseInt((await setting("printer_width")) ?? "", 10);
  return { enabled: (await setting("printer_enabled")) === "1", width: Number.isFinite(width) ? width : 42 };
}

export async function loadSaleReceipt(saleId: number): Promise<SaleReceiptData> {
  const db = await getDb();
  const [sale] = await db.select<
    { total: number; payment_method: string; paid: number | null; change_due: number | null; created_at: string; installments: number | null; note: string | null }[]
  >(
    "SELECT total, payment_method, paid, change_due, created_at, installments, note FROM sales WHERE id = ?1 AND voided = 0",
    [saleId],
  );
  if (!sale) throw new Error(`Venta ${saleId} no encontrada`);
  const installments = Number(sale.installments ?? 0);
  const paymentMethod =
    installments > 1 && sale.payment_method === "crédito"
      ? `${sale.payment_method} - ${installments} cuotas`
      : sale.payment_method;

  const items = await db.select<{ name: string; qty: number; unit_price: number; line_total: number }[]>(
    "SELECT name, qty, unit_price, line_total FROM sale_items WHERE sale_id = ?1 ORDER BY id",
    [saleId],
  );
  const warranties = await db.select<{ name: string; identifier: string; identifier_kind: string; warranty_until: string | null }[]>(
    `SELECT COALESCE(p.name, '') AS name, u.identifier, u.identifier_kind, u.warranty_until
     FROM product_units u LEFT JOIN products p ON p.id = u.product_id
     WHERE u.sale_id = ?1 AND u.status = 'sold' ORDER BY u.id`,
    [saleId],
  );

  return {
    businessName: (await setting("business_name")) || "Mi comercio",
    saleId,
    createdAt: sale.created_at,
    paymentMethod,
    total: Number(sale.total),
    paid: sale.paid == null ? null : Number(sale.paid),
    changeDue: sale.change_due == null ? null : Number(sale.change_due),
    note: sale.note?.trim() || null,
    items: items.map((i) => ({
      name: i.name,
      qty: Number(i.qty),
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.line_total),
    })),
    warranties: warranties.map((w) => ({
      name: w.name,
      code: w.identifier,
      kind: w.identifier_kind,
      until: w.warranty_until,
    })),
  };
}
