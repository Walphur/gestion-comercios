import { formatDateShort, formatMoney, formatQty } from "./format";

/** Texto plano del presupuesto para abrir el WhatsApp del cliente (app normal o Business). */
export function buildQuoteWhatsAppMessage(input: {
  businessName: string;
  customerName: string | null;
  quoteNumber: string;
  items: { name: string; qty: number; line_total: number }[];
  total: number;
  currency: string;
  validUntil: string | null;
  notes: string | null;
}): string {
  const who = input.customerName?.trim();
  const hello = who
    ? `Hola ${who}, te paso el presupuesto ${input.quoteNumber} de ${input.businessName}.`
    : `Hola, te paso el presupuesto ${input.quoteNumber} de ${input.businessName}.`;
  const lines = input.items
    .filter((it) => it.name.trim())
    .map(
      (it) =>
        `- ${it.name.trim()} x${formatQty(it.qty)}: ${formatMoney(it.line_total, input.currency)}`,
    );
  const parts = [hello, "", ...lines, "", `Total: ${formatMoney(input.total, input.currency)}`];
  if (input.validUntil) parts.push(`Válido hasta ${formatDateShort(input.validUntil)}`);
  if (input.notes?.trim()) parts.push("", input.notes.trim());
  return parts.join("\n");
}
