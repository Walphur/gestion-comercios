import { getLicenseStatus } from "./license";
import {
  FREE_MAX_PRODUCTS,
  FREE_MAX_SALES_PER_MONTH,
  isFreePlan,
  PRICE_BASIC_MONTHLY_ARS,
  PRICE_PRO_MONTHLY_ARS,
  formatPriceArs,
} from "../config/pricing";
import { getDb } from "../db/index";

export async function countActiveProducts(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM products WHERE active = 1",
  );
  return rows[0]?.n ?? 0;
}

export async function countSalesThisMonth(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM sales
     WHERE COALESCE(voided, 0) = 0
       AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')`,
  );
  return rows[0]?.n ?? 0;
}

export async function assertCanCreateProduct(): Promise<void> {
  const status = await getLicenseStatus();
  if (!isFreePlan(status.plan)) return;
  const n = await countActiveProducts();
  if (n >= FREE_MAX_PRODUCTS) {
    throw new Error(
      `Plan gratis: máximo ${FREE_MAX_PRODUCTS} productos. Pasá a Estándar (${formatPriceArs(PRICE_BASIC_MONTHLY_ARS)}/mes) para ilimitados.`,
    );
  }
}

export async function assertCanRecordSale(): Promise<void> {
  const status = await getLicenseStatus();
  if (!isFreePlan(status.plan)) return;
  const n = await countSalesThisMonth();
  if (n >= FREE_MAX_SALES_PER_MONTH) {
    throw new Error(
      `Plan gratis: máximo ${FREE_MAX_SALES_PER_MONTH} ventas este mes. Pasá a Estándar (${formatPriceArs(PRICE_BASIC_MONTHLY_ARS)}/mes) o Pro+ (${formatPriceArs(PRICE_PRO_MONTHLY_ARS)}/mes).`,
    );
  }
}
