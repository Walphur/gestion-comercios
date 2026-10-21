import { getLicenseStatus } from "./license";
import {
  freePlanLimits,
  isFreePlan,
  PRICE_BASIC_MONTHLY_ARS,
  PRICE_PRO_MONTHLY_ARS,
  formatPriceArs,
  type FreePlanLimits,
} from "../config/pricing";
import { getDb } from "../db/index";
import { getSetting } from "../db/settings";

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

/** Topes del plan gratis para el rubro guardado en esta PC. */
export async function currentFreePlanLimits(): Promise<FreePlanLimits> {
  return freePlanLimits(await getSetting("rubro").catch(() => null));
}

/** Corta si en el plan gratis no entran `count` productos nuevos. */
export async function assertCanCreateProducts(count: number): Promise<void> {
  if (count <= 0) return;
  const status = await getLicenseStatus();
  if (!isFreePlan(status.plan)) return;
  const [limits, n] = await Promise.all([currentFreePlanLimits(), countActiveProducts()]);
  if (n + count > limits.maxProducts) {
    const extra =
      limits.itemsLabel === "servicios" ? " (cuentan también los productos y los insumos)" : "";
    throw new Error(
      `Plan gratis: máximo ${limits.maxProducts} ${limits.itemsLabel}${extra}. Pasá a WalQo Completo (${formatPriceArs(PRICE_BASIC_MONTHLY_ARS)}/mes) para cargar sin límite.`,
    );
  }
}

export async function assertCanCreateProduct(): Promise<void> {
  await assertCanCreateProducts(1);
}

export async function assertCanRecordSale(): Promise<void> {
  const status = await getLicenseStatus();
  if (!isFreePlan(status.plan)) return;
  const [limits, n] = await Promise.all([currentFreePlanLimits(), countSalesThisMonth()]);
  if (n >= limits.maxSalesPerMonth) {
    throw new Error(
      `Plan gratis: máximo ${limits.maxSalesPerMonth} ventas este mes. Pasá a WalQo Completo (${formatPriceArs(PRICE_BASIC_MONTHLY_ARS)}/mes) o Pro (${formatPriceArs(PRICE_PRO_MONTHLY_ARS)}/mes).`,
    );
  }
}
