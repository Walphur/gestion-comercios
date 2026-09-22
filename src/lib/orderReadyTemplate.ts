import { getSetting, setSetting } from "../db/settings";

export const ORDER_READY_MSG_KEY = "gastronomia_order_ready_message";

/** Placeholders: {{nombre}} {{negocio}} {{pedido}} {{tipo}} {{items}} {{total}} */
export const DEFAULT_ORDER_READY_TEMPLATE = `Hola *{{nombre}}*!

Tu pedido *#{{pedido}}* de *{{negocio}}* está listo {{tipo}}.

*Detalle:*
{{items}}

Total: *{{total}}*

¡Gracias por elegirnos!`;

export interface OrderReadyTemplateVars {
  nombre: string;
  negocio: string;
  pedido: string;
  tipo: string;
  items: string;
  total: string;
}

export function renderOrderReadyTemplate(
  template: string,
  vars: OrderReadyTemplateVars,
): string {
  return template
    .split("{{nombre}}").join(vars.nombre)
    .split("{{negocio}}").join(vars.negocio)
    .split("{{pedido}}").join(vars.pedido)
    .split("{{tipo}}").join(vars.tipo)
    .split("{{items}}").join(vars.items)
    .split("{{total}}").join(vars.total)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function loadOrderReadyTemplate(): Promise<string> {
  const raw = await getSetting(ORDER_READY_MSG_KEY);
  const t = raw?.trim();
  return t || DEFAULT_ORDER_READY_TEMPLATE;
}

export async function saveOrderReadyTemplate(template: string): Promise<void> {
  const t = template.trim() || DEFAULT_ORDER_READY_TEMPLATE;
  await setSetting(ORDER_READY_MSG_KEY, t);
}
