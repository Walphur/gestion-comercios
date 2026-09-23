import { getDb } from "./index";
import { getSetting, setSetting } from "./settings";

export const FISCAL_LIMIT_DAILY_KEY = "fiscal_limit_daily_ars";
export const FISCAL_LIMIT_MONTHLY_KEY = "fiscal_limit_monthly_ars";

export interface FiscalLimitSettings {
  dailyLimit: number;
  monthlyLimit: number;
}

export interface FiscalInvoicedTotals {
  today: number;
  month: number;
}

export async function getFiscalLimitSettings(): Promise<FiscalLimitSettings> {
  const [d, m] = await Promise.all([
    getSetting(FISCAL_LIMIT_DAILY_KEY),
    getSetting(FISCAL_LIMIT_MONTHLY_KEY),
  ]);
  return {
    dailyLimit: Math.max(0, Number(d) || 0),
    monthlyLimit: Math.max(0, Number(m) || 0),
  };
}

export async function saveFiscalLimitSettings(
  patch: Partial<FiscalLimitSettings>,
): Promise<void> {
  if (patch.dailyLimit !== undefined) {
    await setSetting(FISCAL_LIMIT_DAILY_KEY, String(Math.max(0, patch.dailyLimit)));
  }
  if (patch.monthlyLimit !== undefined) {
    await setSetting(FISCAL_LIMIT_MONTHLY_KEY, String(Math.max(0, patch.monthlyLimit)));
  }
}

/** Suma totales de ventas con comprobante fiscal emitido (CAE) en el día / mes local. */
export async function getFiscalInvoicedTotals(): Promise<FiscalInvoicedTotals> {
  const db = await getDb();
  const rows = await db.select<{ today: number; month: number }[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN date(fd.created_at) = date('now', 'localtime') THEN s.total ELSE 0 END), 0) AS today,
       COALESCE(SUM(CASE WHEN strftime('%Y-%m', fd.created_at) = strftime('%Y-%m', 'now', 'localtime') THEN s.total ELSE 0 END), 0) AS month
     FROM fiscal_documents fd
     JOIN sales s ON s.id = fd.sale_id
     WHERE s.voided = 0
       AND fd.cae IS NOT NULL
       AND TRIM(fd.cae) != ''`,
  );
  return {
    today: Number(rows[0]?.today) || 0,
    month: Number(rows[0]?.month) || 0,
  };
}

export function fiscalLimitRemaining(invoiced: number, limit: number): number | null {
  if (limit <= 0) return null;
  return Math.max(0, limit - invoiced);
}
