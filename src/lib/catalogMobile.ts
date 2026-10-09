import { invoke } from "@tauri-apps/api/core";

export interface CatalogMobileStatus {
  linked: boolean;
  pair_code: string | null;
  pair_expires_at: string | null;
  phone_url: string;
  last_sync_at: string | null;
  last_error: string | null;
  phones: number;
  conflicts: number;
}

export function catalogMobileStatus() {
  return invoke<CatalogMobileStatus>("catalog_mobile_get_status");
}

export function catalogMobilePair() {
  return invoke<CatalogMobileStatus>("catalog_mobile_pair");
}

export function catalogMobileRevoke() {
  return invoke<CatalogMobileStatus>("catalog_mobile_revoke");
}

export function catalogMobileSyncNow() {
  return invoke<CatalogMobileStatus>("catalog_mobile_sync_now");
}
