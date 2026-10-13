import { getSetting, setSetting } from "./settings";
import { normalizeHttpUrl, usableHttpUrl } from "../lib/externalAppUrl";

export const CLINIC_BILLING_APP_URL = "clinic_billing_app_url";
export const CLINIC_RECORDS_APP_URL = "clinic_records_app_url";

export interface ClinicExternalApps {
  billing: string | null;
  records: string | null;
}

export async function getClinicExternalApps(): Promise<ClinicExternalApps> {
  const [billing, records] = await Promise.all([
    getSetting(CLINIC_BILLING_APP_URL),
    getSetting(CLINIC_RECORDS_APP_URL),
  ]);
  return {
    billing: usableHttpUrl(billing),
    records: usableHttpUrl(records),
  };
}

export async function saveClinicExternalApps(billingRaw: string, recordsRaw: string): Promise<void> {
  const billing = normalizeHttpUrl(billingRaw);
  const records = normalizeHttpUrl(recordsRaw);
  if (billing === null || records === null) {
    throw new Error("El enlace tiene que empezar con http:// o https://.");
  }
  await setSetting(CLINIC_BILLING_APP_URL, billing);
  await setSetting(CLINIC_RECORDS_APP_URL, records);
}
