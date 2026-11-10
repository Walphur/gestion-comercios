/**
 * Licencia de WalQo Web con las reglas de src-tauri/src/license.rs: prueba Pro, plan gratis,
 * Completo/Pro y vencimiento. La licencia y la prueba quedan en _walqo_meta, que el navegador
 * no puede tocar (ver BLOCKED_SQL en sql.ts).
 */
import { trialLengthDays } from "../../../src/config/trialPromo";
import { currentEnv, currentStorage } from "./context";
import { fetchWebAccount, LicenseApiError, type WebAccountInfo, type WebLicenseInfo } from "./licenseApi";
import { readMeta, writeMeta } from "./meta";

const EXPIRED_FREE_MESSAGE =
  "Tu suscripción venció. Seguís en plan gratis, con tope de productos y de ventas por mes. Cuando se registre el pago, WalQo vuelve solo a tu plan.";
const PRO_MODULES_OFF = '{"quotes":false,"appointments":false,"delivery_notes":false,"service_orders":false}';

type Args = Record<string, unknown>;

const nowSec = () => Math.floor(Date.now() / 1000);

function trialPromoName(startedSec: number): string | null {
  return trialLengthDays(startedSec * 1000) > 7 ? "Promo Cyber" : null;
}

function baseStatus() {
  const now = nowSec();
  return {
    active: false,
    plan: "none",
    pro_enabled: false,
    max_devices: 0,
    machine_id: "web",
    key_mask: null as string | null,
    message: null as string | null,
    needs_activation: false,
    offline_grace_days_left: null,
    billing: "none",
    expires_at: null as number | null,
    days_until_expiry: null as number | null,
    is_trial: false,
    trial_days_left: null as number | null,
    trial_offer_pending: false,
    trial_length_days: trialLengthDays(now * 1000),
    trial_promo: trialPromoName(now),
    max_products: null as number | null,
    catalog_super: false,
  };
}

export type LicenseStatus = ReturnType<typeof baseStatus>;

function inactive(message: string): LicenseStatus {
  return { ...baseStatus(), message, needs_activation: true };
}

function free(message?: string): LicenseStatus {
  return {
    ...baseStatus(),
    active: true,
    plan: "free",
    max_devices: 1,
    billing: "free",
    message: message ?? "Plan gratis · con tope de productos y de ventas por mes",
  };
}

function writeSettingIfChanged(key: string, value: string) {
  const sql = currentStorage().sql;
  const row = sql.exec<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", key).toArray()[0];
  if (row?.value === value) return;
  sql.exec(
    "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
    key,
    value,
  );
}

function setProEnabled(enabled: boolean) {
  writeSettingIfChanged("pro_plan_enabled", enabled ? "1" : "0");
  if (!enabled) writeSettingIfChanged("pro_modules", PRO_MODULES_OFF);
}

function storedLicense(): WebLicenseInfo | null {
  const raw = readMeta("license");
  return raw ? (JSON.parse(raw) as WebLicenseInfo) : null;
}

export function storedAccount(): WebAccountInfo | null {
  const raw = readMeta("account");
  return raw ? (JSON.parse(raw) as WebAccountInfo) : null;
}

function paidAndValid(lic: WebLicenseInfo | null): lic is WebLicenseInfo {
  return !!lic && lic.plan !== "free" && !lic.revoked && !(lic.exp > 0 && nowSec() > lic.exp);
}

function trialStartedAt(): number | null {
  const ts = Number(readMeta("trial_started_at") ?? 0);
  return ts > 0 ? ts : null;
}

function fromTrial(started: number): LicenseStatus {
  const expires = started + trialLengthDays(started * 1000) * 86_400;
  const daysLeft = Math.max(0, Math.floor((expires - nowSec()) / 86_400));
  return {
    ...baseStatus(),
    active: true,
    plan: "trial",
    pro_enabled: true,
    max_devices: 1,
    message: `Prueba gratuita · ${daysLeft} día(s) restante(s)`,
    billing: "trial",
    expires_at: expires,
    days_until_expiry: daysLeft,
    is_trial: true,
    trial_days_left: daysLeft,
    trial_length_days: trialLengthDays(started * 1000),
    trial_promo: trialPromoName(started),
  };
}

function evaluateTrial(): LicenseStatus {
  const started = trialStartedAt();
  if (started) {
    if (nowSec() >= started + trialLengthDays(started * 1000) * 86_400) {
      setProEnabled(false);
      return free(
        "Tu prueba Pro terminó. Seguís en plan gratis, con tope de productos y de ventas por mes. Activá WalQo Completo o Pro cuando quieras.",
      );
    }
    setProEnabled(true);
    return fromTrial(started);
  }
  if (readMeta("trial_offer_shown") !== "1") {
    const days = trialLengthDays();
    return {
      ...baseStatus(),
      message: `Probá WalQo ${days} días con Pro+ (taller, ARCA y más), o seguí en plan gratis.`,
      needs_activation: true,
      trial_offer_pending: true,
    };
  }
  setProEnabled(false);
  return free();
}

function fromLicense(lic: WebLicenseInfo, message: string | null = null): LicenseStatus {
  const pro = lic.plan === "pro";
  setProEnabled(pro);
  return {
    ...baseStatus(),
    active: true,
    plan: lic.plan,
    pro_enabled: pro,
    max_devices: lic.max_devices,
    key_mask: lic.key_mask,
    message,
    billing: lic.billing || "perpetual",
    expires_at: lic.exp > 0 ? lic.exp : null,
    days_until_expiry: lic.exp > 0 ? Math.max(0, Math.floor((lic.exp - nowSec()) / 86_400)) : null,
    max_products: lic.max_products,
    catalog_super: lic.catalog_super,
  };
}

export function currentLicenseStatus(): LicenseStatus {
  const lic = storedLicense();
  if (lic && lic.plan !== "free") {
    if (lic.revoked) return inactive("Esta licencia fue revocada");
    if (lic.exp > 0 && nowSec() > lic.exp) {
      setProEnabled(false);
      return free(EXPIRED_FREE_MESSAGE);
    }
    return fromLicense(lic);
  }
  return evaluateTrial();
}

/** Guarda la cuenta y su licencia al entrar. Una licencia paga vigente no se pisa con la gratis. */
export function saveAccount(account: WebAccountInfo, license: WebLicenseInfo, force = false) {
  writeMeta("account", JSON.stringify(account));
  if (!force && license.plan === "free" && paidAndValid(storedLicense())) return;
  writeMeta("license", JSON.stringify(license));
}

async function fetchAndStore(licenseKey: string | null, force = false): Promise<void> {
  const account = storedAccount();
  if (!account) throw new Error("Iniciá sesión de nuevo.");
  const fresh = await fetchWebAccount(currentEnv(), { email: account.email, licenseKey });
  saveAccount(fresh.account, fresh.license, force);
}

export const LICENSE_COMMANDS: Record<string, (args: Args) => Promise<unknown>> = {
  async license_get_status() {
    return currentLicenseStatus();
  },

  /** Sin conexión o sin lugar para otro equipo se sigue con lo último que se supo. */
  async license_refresh() {
    try {
      await fetchAndStore(storedLicense()?.key ?? null, true);
    } catch (error) {
      if (error instanceof LicenseApiError && error.code === "INVALID_KEY") {
        await fetchAndStore(null, true).catch(() => undefined);
      }
    }
    return currentLicenseStatus();
  },

  async license_activate(args) {
    const key = String(args.key ?? "").trim().toUpperCase();
    if (key.length < 8) return inactive("Clave de licencia inválida");
    try {
      await fetchAndStore(key);
    } catch (error) {
      return inactive((error as Error).message);
    }
    const status = currentLicenseStatus();
    return status.active && status.plan !== "free" && !status.is_trial
      ? { ...status, message: "Licencia activada correctamente" }
      : status;
  },

  async license_start_trial() {
    if (paidAndValid(storedLicense())) return currentLicenseStatus();
    if (!trialStartedAt()) {
      writeMeta("trial_started_at", String(nowSec()));
      writeMeta("trial_offer_shown", "1");
    }
    return currentLicenseStatus();
  },

  async license_skip_trial_offer() {
    if (paidAndValid(storedLicense())) return currentLicenseStatus();
    writeMeta("trial_offer_shown", "1");
    const status = currentLicenseStatus();
    if (status.is_trial) return status;
    const days = trialLengthDays();
    return {
      ...status,
      message: `Plan gratis activado, con tope de productos y de ventas por mes. Probá Pro ${days} días o activá una licencia cuando quieras.`,
    };
  },

  async license_get_machine_id() {
    return "web";
  },

  /** Igual que recover_admin_pin en license.rs: con la clave de licencia del comercio. */
  async license_recover_admin_pin(args) {
    const pin = String(args.newPin ?? "").trim();
    if (!/^\d{4,12}$/.test(pin)) throw new Error("El PIN nuevo debe tener entre 4 y 12 dígitos.");
    const normalize = (key: string) => key.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const provided = normalize(String(args.licenseKey ?? ""));
    if (!provided) throw new Error("Ingresá la clave de licencia.");
    const sql = currentStorage().sql;
    const accountKey =
      sql.exec<{ value: string | null }>("SELECT value FROM settings WHERE key = 'account_license_key'").toArray()[0]
        ?.value ?? "";
    const known = [storedLicense()?.key ?? "", accountKey].map(normalize).filter(Boolean);
    if (!known.includes(provided)) throw new Error("La clave de licencia no coincide con la de este comercio.");
    const updated = sql
      .exec(
        `UPDATE users SET pin = ?1, active = 1, updated_at = datetime('now','-3 hours')
         WHERE id = 1 OR lower(username) = 'admin'`,
        pin,
      )
      .rowsWritten;
    if (updated === 0) throw new Error("No se encontró el usuario administrador.");
    return null;
  },
};
