import { activateLicense } from "./license";
import { setSetting } from "../db/settings";
import type { Rubro } from "../types";

export interface AccountSessionData {
  email: string;
  name: string;
  business_name?: string;
  rubro?: string;
  license_key?: string;
}

/** Guarda la sesión de cuenta WalQo en settings locales y activa licencia si hay. */
export async function applyAccountSession(
  data: AccountSessionData,
  refreshLicense?: () => Promise<unknown>,
): Promise<void> {
  const email = data.email.trim().toLowerCase();
  await setSetting("account_email", email);
  await setSetting("account_name", data.name.trim());
  await setSetting("account_verified", "1");
  await setSetting("account_prompt_done", "1");

  const business = data.business_name?.trim();
  if (business) {
    await setSetting("business_name", business);
    await setSetting("first_run_setup_done", "1");
  }

  const rubro = data.rubro?.trim();
  if (rubro) {
    await setSetting("rubro", rubro as Rubro);
  }

  if (data.license_key) {
    await setSetting("account_license_key", data.license_key);
    try {
      await activateLicense(data.license_key);
      await refreshLicense?.();
    } catch {
      /* queda en mail / banner plan gratis */
    }
  }
}
