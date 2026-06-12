import { SUPPORT_WHATSAPP } from "./support";

/** Mismo WhatsApp que soporte — venta del CSV catálogo supermercado. */
export const CATALOG_SALES_WHATSAPP = SUPPORT_WHATSAPP;

export function catalogSalesWhatsAppMessage(): string {
  return [
    "Hola! Uso Gestión Comercios y quiero comprar el catálogo de supermercado (+200.000 productos).",
    "¿Cuánto sale y cómo pago?",
  ].join("\n");
}
