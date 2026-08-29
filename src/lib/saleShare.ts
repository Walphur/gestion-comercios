import { getSetting } from "../db/settings";
import { getCustomer } from "../db/customers";
import { getSale, getSaleItems } from "../db/sales";
import type { Customer, Sale, SaleItem } from "../types";

export interface SaleShareData {
  sale: Sale;
  items: SaleItem[];
  businessName: string;
  customer: Customer | null;
}

export async function loadSaleShareData(saleId: number): Promise<SaleShareData | null> {
  const [sale, items, businessName] = await Promise.all([
    getSale(saleId),
    getSaleItems(saleId),
    getSetting("business_name"),
  ]);
  if (!sale) return null;
  const customer = sale.customer_id ? await getCustomer(sale.customer_id) : null;
  return {
    sale,
    items,
    businessName: businessName?.trim() || "Mi comercio",
    customer,
  };
}

function money(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Texto para WhatsApp: detalle de compra (no factura fiscal). */
export function buildSaleWhatsAppMessage(data: SaleShareData, customerName?: string): string {
  const { sale, items, businessName } = data;
  const greet = customerName?.trim() ? `Hola ${customerName.trim()}!` : "Hola!";
  const lines = [
    greet,
    "",
    `Tu compra en *${businessName}*`,
    formatWhen(sale.created_at),
    "",
  ];
  for (const it of items) {
    lines.push(`• ${it.name} × ${it.qty} — ${money(it.line_total)}`);
  }
  lines.push("");
  lines.push(`*Total: ${money(sale.total)}*`);
  if (sale.payment_method) {
    lines.push(`Pago: ${sale.payment_method}`);
  }
  lines.push("");
  lines.push("Detalle para tu referencia (no es factura fiscal).");
  lines.push("Gracias por tu compra.");
  return lines.join("\n");
}
