import { openWhatsApp } from "./openExternal";
import { getSetting } from "../db/settings";
import { getSale, getSaleItems, markOrderReady } from "../db/sales";
import { formatMoney } from "./format";
import {
  loadOrderReadyTemplate,
  renderOrderReadyTemplate,
} from "./orderReadyTemplate";

function orderTypePhrase(t: string | null | undefined): string {
  if (t === "delivery") return "para entregar";
  if (t === "takeaway") return "para retirar";
  return "para retirar";
}

/** Mensaje pedido listo. Abre WhatsApp (wa.me). */
export async function notifyOrderReadyWhatsApp(saleId: number): Promise<{
  opened: boolean;
  message: string;
}> {
  const [sale, items, businessName, template] = await Promise.all([
    getSale(saleId),
    getSaleItems(saleId),
    getSetting("business_name"),
    loadOrderReadyTemplate(),
  ]);
  if (!sale) throw new Error("Venta no encontrada.");

  const phone = sale.pickup_phone?.trim();
  if (!phone) {
    throw new Error("Este pedido no tiene teléfono. Cargalo al cobrar para poder avisar.");
  }

  const biz = (businessName || "nuestro local").trim() || "nuestro local";
  const name = sale.pickup_name?.trim() || "cliente";
  const currency = (await getSetting("currency"))?.trim() || "$";

  const itemLines = items
    .filter((i) => i.name !== "Propina")
    .slice(0, 8)
    .map((i) => `• ${i.name} × ${i.qty}`)
    .join("\n");
  const extra = items.filter((i) => i.name !== "Propina").length > 8 ? "\n• …" : "";

  let message = renderOrderReadyTemplate(template, {
    nombre: name,
    negocio: biz,
    pedido: String(saleId),
    tipo: orderTypePhrase(sale.order_type),
    items: itemLines ? `${itemLines}${extra}` : "—",
    total: formatMoney(sale.total, currency),
  });

  const addr = sale.delivery_address?.trim();
  const rider = sale.delivery_rider?.trim();
  if (sale.order_type === "delivery" && (addr || rider)) {
    const bits: string[] = [];
    if (addr) bits.push(`Dirección: ${addr}`);
    if (rider) bits.push(`Va con: ${rider}`);
    message = `${message}\n\n${bits.join("\n")}`;
  }

  const r = await openWhatsApp(phone, message);
  try {
    await markOrderReady(saleId);
  } catch (e) {
    // WhatsApp ya se abrió; no bloquear al cajero si falla el mark (ej. sync LAN).
    console.error("markOrderReady", e);
  }
  return { opened: true, message: r.copied ? "copied" : "ok" };
}

/** Avisa al cadete por WhatsApp con el detalle del delivery. */
export async function notifyCadeteWhatsApp(saleId: number): Promise<{
  opened: boolean;
  message: string;
}> {
  const [sale, items, businessName] = await Promise.all([
    getSale(saleId),
    getSaleItems(saleId),
    getSetting("business_name"),
  ]);
  if (!sale) throw new Error("Venta no encontrada.");
  if (sale.order_type !== "delivery") {
    throw new Error("Solo aplica a pedidos delivery.");
  }

  const phone = sale.delivery_rider_phone?.trim() || null;
  if (!phone) {
    throw new Error(
      "Este cadete no tiene WhatsApp cargado. Editá el usuario en Empleados o asigná otro cadete.",
    );
  }

  const biz = (businessName || "nuestro local").trim() || "nuestro local";
  const rider = sale.delivery_rider?.trim() || "cadete";
  const customer = sale.pickup_name?.trim() || "cliente";
  const customerPhone = sale.pickup_phone?.trim();
  const addr = sale.delivery_address?.trim() || "sin dirección";
  const currency = (await getSetting("currency"))?.trim() || "$";

  const itemLines = items
    .filter((i) => i.name !== "Propina")
    .slice(0, 10)
    .map((i) => `• ${i.name} × ${i.qty}`)
    .join("\n");

  const message = [
    `Hola ${rider} 👋`,
    `Pedido #${saleId} de *${biz}*`,
    ``,
    `Cliente: ${customer}${customerPhone ? ` (${customerPhone})` : ""}`,
    `Dirección: ${addr}`,
    ``,
    itemLines || "—",
    ``,
    `Total: ${formatMoney(sale.total, currency)}`,
  ].join("\n");

  const r = await openWhatsApp(phone, message);
  return { opened: true, message: r.copied ? "copied" : "ok" };
}
