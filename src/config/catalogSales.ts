import { formatPriceArs, PRICE_CATALOG_SUPER_MONTHLY_ARS } from "./pricing";
import { SUPPORT_WHATSAPP } from "./support";

/** Mismo WhatsApp que soporte — venta del CSV catálogo supermercado. */
export const CATALOG_SALES_WHATSAPP = SUPPORT_WHATSAPP;

export function catalogSalesWhatsAppMessage(): string {
  return [
    `Hola! Uso Gestión Comercios y quiero comprar el catálogo de supermercado (+200.000 productos).`,
    `Vi que sale ${formatPriceArs(PRICE_CATALOG_SUPER_MONTHLY_ARS)}/mes. ¿Cómo pago y me pasás el CSV?`,
  ].join("\n");
}
