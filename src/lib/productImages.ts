import { invoke, convertFileSrc } from "@tauri-apps/api/core";

export async function pickProductImageFile(): Promise<string | null> {
  return invoke<string | null>("pick_product_image");
}

export async function saveProductImageFile(
  productId: number,
  sourcePath: string,
): Promise<string> {
  return invoke<string>("save_product_image", { productId, sourcePath });
}

export async function removeProductImageFile(productId: number): Promise<void> {
  return invoke("remove_product_image", { productId });
}

export async function resolveProductImageUrl(
  imagePath: string | null | undefined,
): Promise<string | null> {
  if (!imagePath?.trim()) return null;
  try {
    const abs = await invoke<string | null>("get_product_image_abs_path", {
      imagePath: imagePath.trim(),
    });
    if (!abs) return null;
    return convertFileSrc(abs);
  } catch {
    return null;
  }
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
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = objUrl;
    });
    return img;
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

/** Miniatura JPEG/WebP para la carta pública (presupuesto del portal). */
async function compressProductThumbToDataUrl(
  blob: Blob,
  maxChars: number,
): Promise<string | null> {
  const img = await loadImageFromBlob(blob);
  let maxSide = 420;
  for (let attempt = 0; attempt < 5; attempt++) {
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
    ctx.fillStyle = "#f4f1eb";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    for (const type of ["image/webp", "image/jpeg"] as const) {
      for (const quality of [0.72, 0.58, 0.45, 0.35]) {
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
 * Foto de producto como data URL comprimida para subir a la carta web.
 */
export async function resolveProductImageDataUrl(
  imagePath: string | null | undefined,
  maxChars = 28_000,
): Promise<string | null> {
  const url = await resolveProductImageUrl(imagePath);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    if (blob.size <= 18_000) {
      const raw = await blobToDataUrl(blob);
      if (raw && raw.startsWith("data:image/") && raw.length <= maxChars) return raw;
    }
    return await compressProductThumbToDataUrl(blob, maxChars);
  } catch {
    return null;
  }
}

export async function pickAndPreviewProductImage(): Promise<{
  sourcePath: string;
  previewUrl: string;
} | null> {
  const picked = await pickProductImageFile();
  if (!picked) return null;
  return { sourcePath: picked, previewUrl: convertFileSrc(picked) };
}
