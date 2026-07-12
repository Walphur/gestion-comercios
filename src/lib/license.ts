import { invoke } from "@tauri-apps/api/core";

export interface LicenseStatus {
  active: boolean;
  plan: string;
  pro_enabled: boolean;
  max_devices: number;
  machine_id: string;
  key_mask: string | null;
  message: string | null;
  needs_activation: boolean;
  offline_grace_days_left: number | null;
  billing: string;
  expires_at: number | null;
  days_until_expiry: number | null;
  is_trial: boolean;
  trial_days_left: number | null;
  trial_offer_pending: boolean;
}

export function getLicenseStatus(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("license_get_status");
}

export function getMachineId(): Promise<string> {
  return invoke<string>("license_get_machine_id");
}

export function activateLicense(key: string): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("license_activate", { key });
}

export function refreshLicense(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("license_refresh");
}

export function startTrialLicense(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("license_start_trial");
}

export function skipTrialOffer(): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("license_skip_trial_offer");
}

export function planLabel(plan: string): string {
  if (plan === "pro") return "Pro";
  if (plan === "basic") return "Básico";
  if (plan === "trial") return "Prueba gratuita";
  return "Sin licencia";
}
