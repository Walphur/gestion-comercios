import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

/** Límite del worker (`sanitizeLogoDataUrl`) — dejar margen bajo 140_000. */
const MAX_LOGO_DATA_URL_CHARS = 130_000;

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

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No se pudo leer la imagen del logo"));
      img.src = objUrl;
    });
    return img;
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

/** Redimensiona/comprime hasta entrar en el límite del portal web. */
async function compressLogoToDataUrl(
  blob: Blob,
  maxChars: number,
): Promise<string | null> {
  const img = await loadImageFromBlob(blob);
  let maxSide = 640;
  for (let attempt = 0; attempt < 4; attempt++) {
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    for (const type of ["image/webp", "image/jpeg"] as const) {
      for (const quality of [0.85, 0.72, 0.58, 0.45]) {
        const out = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), type, quality),
        );
        if (!out) continue;
        const dataUrl = await blobToDataUrl(out);
        if (dataUrl && dataUrl.length <= maxChars) return dataUrl;
      }
    }
    maxSide = Math.round(maxSide * 0.7);
  }
  return null;
}

/**
 * Logo en data URL para subir al portal web.
 * Comprime automáticamente si el archivo original es grande (>~90 KB).
 */
export async function getBusinessLogoDataUrl(
  maxChars = MAX_LOGO_DATA_URL_CHARS,
): Promise<string | null> {
  const url = await getBusinessLogoUrl();
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;

    // Archivos chicos: usar tal cual si caben en el límite del worker.
    if (blob.size <= 90_000) {
      const raw = await blobToDataUrl(blob);
      if (raw && raw.startsWith("data:image/") && raw.length <= maxChars) return raw;
    }

    return await compressLogoToDataUrl(blob, maxChars);
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
