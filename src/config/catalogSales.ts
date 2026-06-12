/** WhatsApp de Waltech para venta del CSV catálogo supermercado. */
export const CATALOG_SALES_WHATSAPP = "5492665031950";

export function catalogSalesWhatsAppMessage(): string {
  return [
    "Hola! Uso Gestión Comercios y quiero comprar el catálogo de supermercado (+200.000 productos).",
    "¿Cuánto sale y cómo pago?",
  ].join("\n");
}
