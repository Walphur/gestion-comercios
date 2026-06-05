import { getVersion } from "@tauri-apps/api/app";

/** Versión del build (package.json / tauri.conf). */
export const PACKAGE_VERSION = "0.1.37";

let cached: string | null = null;

/** Versión instalada en esta PC (Tauri) o fallback en desarrollo web. */
export async function resolveAppVersion(): Promise<string> {
  if (cached) return cached;
  try {
    cached = await getVersion();
  } catch {
    cached = PACKAGE_VERSION;
  }
  return cached;
}
