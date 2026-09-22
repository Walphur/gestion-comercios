import { openWhatsApp } from "./openExternal";
import { getSetting } from "../db/settings";
import { getSale, getSaleItems, markOrderReady } from "../db/sales";

function orderTypeLabel(t: string | null | undefined): string {
  if (t === "delivery") return "delivery";
  if (t === "takeaway") return "retiro";
  return "pedido";
}

/** Mensaje corto: pedido listo. Abre WhatsApp del cliente (wa.me). */
export async function notifyOrderReadyWhatsApp(saleId: number): Promise<{
  opened: boolean;
  message: string;
}> {
  const [sale, items, businessName] = await Promise.all([
    getSale(saleId),
    getSaleItems(saleId),
    getSetting("business_name"),
  ]);
  if (!sale) throw new Error("Venta no encontrada.");

  const phone = sale.pickup_phone?.trim();
  if (!phone) {
    throw new Error("Este pedido no tiene teléfono. Cargalo al cobrar para poder avisar.");
  }

  const biz = (businessName || "nuestro local").trim() || "nuestro local";
  const name = sale.pickup_name?.trim();
  const greet = name ? `Hola ${name}!` : "Hola!";
  const kind = orderTypeLabel(sale.order_type);
  const preview = items
    .slice(0, 3)
    .map((i) => i.name)
    .join(", ");
  const more = items.length > 3 ? "…" : "";

  const lines = [
    greet,
    "",
    `Tu pedido #${saleId} de *${biz}* está listo`,
    kind === "delivery" ? "para entregar." : "para retirar.",
  ];
  if (preview) {
    lines.push("");
    lines.push(`Incluye: ${preview}${more}`);
  }
  lines.push("");
  lines.push("¡Gracias!");

  const message = lines.join("\n");
  const r = await openWhatsApp(phone, message);
  await markOrderReady(saleId);
  return { opened: true, message: r.copied ? "copied" : "ok" };
}
