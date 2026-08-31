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

/** Logo en base64 para subir al portal web (máx. ~120 KB). */
export async function getBusinessLogoDataUrl(maxBytes = 120_000): Promise<string | null> {
  const url = await getBusinessLogoUrl();
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > maxBytes) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function pickAndSaveBusinessLogo(): Promise<string | null> {
  const picked = await pickBusinessLogoFile();
  if (!picked) return null;
  const saved = await saveBusinessLogo(picked);
  return convertFileSrc(saved);
}
