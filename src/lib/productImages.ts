import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { blobToDataUrl, compressImageToDataUrl } from "./imageCompress";

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

/**
 * Foto de producto como data URL comprimida para subir a la carta web.
 */
export async function resolveProductImageDataUrl(
  imagePath: string | null | undefined,
  maxChars = 28_000,
): Promise<string | null> {
  const url = await resolveProductImageUrl(imagePath);
  if (!url) return null;
  // WalQo Web: la carta se arma en el servidor, que devuelve la miniatura ya comprimida.
  if (url.startsWith("data:image/")) return url.length <= maxChars ? url : null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    if (blob.size <= 18_000) {
      const raw = await blobToDataUrl(blob);
      if (raw && raw.startsWith("data:image/") && raw.length <= maxChars) return raw;
    }
    return await compressImageToDataUrl(blob, maxChars);
  } catch {
    return null;
  }
}

/** Foto grande para la galería de la tienda web (hasta 1200 px, WebP o JPEG). */
export async function resolveProductPhotoForWeb(
  imagePath: string,
  maxChars: number,
): Promise<string | null> {
  const url = await resolveProductImageUrl(imagePath);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return await compressImageToDataUrl(blob, maxChars, 1200);
  } catch {
    return null;
  }
}

export async function pickProductImageFiles(): Promise<string[]> {
  return invoke<string[]>("pick_product_images");
}

export async function saveProductPhotoFile(productId: number, sourcePath: string): Promise<string> {
  return invoke<string>("save_product_photo", { productId, sourcePath });
}

export async function removeProductPhotoFile(fileName: string): Promise<void> {
  return invoke("remove_product_photo_file", { fileName });
}

export async function productPhotoStamps(names: string[]): Promise<(string | null)[]> {
  if (names.length === 0) return [];
  return invoke<(string | null)[]>("product_photo_stamps", { names });
}

export function previewProductImage(sourcePath: string): string {
  return convertFileSrc(sourcePath);
}

const PRODUCT_IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif"];

export const PRODUCT_IMAGE_TYPE_ERROR = "Esa foto no sirve. Usá PNG, JPG o WebP.";

export function isAllowedProductImage(path: string): boolean {
  const file = path.split(/[/\\]/).pop() ?? "";
  const ext = file.includes(".") ? file.split(".").pop()?.toLowerCase() ?? "" : "";
  return PRODUCT_IMAGE_EXTS.includes(ext);
}

export async function pickAndPreviewProductImage(): Promise<{
  sourcePath: string;
  previewUrl: string;
} | null> {
  const picked = await pickProductImageFile();
  if (!picked) return null;
  return { sourcePath: picked, previewUrl: convertFileSrc(picked) };
}
