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

export async function pickAndPreviewProductImage(): Promise<{
  sourcePath: string;
  previewUrl: string;
} | null> {
  const picked = await pickProductImageFile();
  if (!picked) return null;
  return { sourcePath: picked, previewUrl: convertFileSrc(picked) };
}
