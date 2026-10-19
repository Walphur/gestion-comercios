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
  booking_url: string | null;
  booking_slug_taken: string | null;
}

/** Same rule as the server: letters and digits, starting with a letter, 3 to 30. */
export function cleanBookingSlug(raw: string) {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 30);
}

export function bookingSlugError(slug: string) {
  if (!/^[A-Za-z]/.test(slug)) return "Empezá el nombre con una letra.";
  if (slug.length < 3) return "Escribí al menos 3 letras o números.";
  return "";
}

export function catalogMobileSetSlug(slug: string) {
  return invoke<CatalogMobileStatus>("catalog_mobile_set_slug", { slug });
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
