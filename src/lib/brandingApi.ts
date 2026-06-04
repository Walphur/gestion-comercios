import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

export async function pickBusinessLogoFile(): Promise<string | null> {
  return invoke<string | null>("pick_business_logo");
}

export async function saveBusinessLogo(sourcePath: string): Promise<string> {
  return invoke<string>("save_business_logo", { sourcePath });
}

export async function getBusinessLogoPath(): Promise<string | null> {
  return invoke<string | null>("get_business_logo_path");
}

export async function removeBusinessLogo(): Promise<void> {
  return invoke("remove_business_logo");
}

export async function getBusinessLogoUrl(): Promise<string | null> {
  const path = await getBusinessLogoPath();
  if (!path) return null;
  return convertFileSrc(path);
}

export async function pickAndSaveBusinessLogo(): Promise<string | null> {
  const picked = await pickBusinessLogoFile();
  if (!picked) return null;
  const saved = await saveBusinessLogo(picked);
  return convertFileSrc(saved);
}
