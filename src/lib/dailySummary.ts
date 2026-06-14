import { getTodaySalesByPayment } from "../db/reports";
import { getTodaySummary } from "../db/sales";
import { formatMoney } from "./format";
import { openWhatsAppShare } from "./openExternal";

export async function buildDailySummaryMessage(
  businessName: string,
  currency: string,
): Promise<string> {
  const [summary, byPay] = await Promise.all([getTodaySummary(), getTodaySalesByPayment()]);
  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const lines = [
    `Resumen del dia - ${businessName}`,
    today,
    "",
    `Ventas: ${summary.todayCount}`,
    `Total: ${formatMoney(summary.todayTotal, currency)}`,
  ];

  if (byPay.length > 0) {
    lines.push("", "Por medio de pago:");
    for (const p of byPay) {
      lines.push(`- ${p.payment_method}: ${formatMoney(p.total, currency)} (${p.count})`);
    }
  }

  lines.push("", "Gestión Comercios - Waltech");
  return lines.join("\n");
}

export async function shareDailySummary(
  businessName: string,
  currency: string,
): Promise<{ copied: boolean }> {
  const message = await buildDailySummaryMessage(businessName, currency);
  return openWhatsAppShare(message);
}
