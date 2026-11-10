/**
 * Fotos de productos en WalQo Web (reemplaza src/lib/productImages.ts en el build web).
 * Al elegirla, la foto se comprime acá y se sube a la base del comercio (workers/walqo-web/src/photos.ts);
 * el nombre que devuelve el servidor es el que se guarda en el producto, como el archivo en la PC.
 */
import { compressImageToDataUrl } from "../lib/imageCompress";
import { webCall } from "./api";
import { pickFiles } from "./files";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
/** Igual que la galería de la tienda (menuPortalPhotos.ts), para subirla sin volver a comprimir. */
const FULL_CHARS = 160_000;
const THUMB_CHARS = 24_000;
/** La principal más tres extra (MAX_PRODUCT_PHOTOS). */
const MAX_PICK = 4;

export const PRODUCT_IMAGE_TYPE_ERROR = "Esa foto no sirve. Usá PNG, JPG o WebP.";

const native = <T>(cmd: string, args: Record<string, unknown>) => webCall<T>("/v1/native", { cmd, args });

/** Las fotos no cambian de contenido (cada una tiene su nombre): se guardan mientras dure la página. */
const thumbs = new Map<string, Promise<string | null>>();
const previews = new Map<string, string>();
let pending = new Map<string, (url: string | null) => void>();
let flushTimer: number | null = null;

async function flushThumbs() {
  flushTimer = null;
  const batch = pending;
  pending = new Map();
  const names = [...batch.keys()];
  for (let i = 0; i < names.length; i += 50) {
    const chunk = names.slice(i, i + 50);
    const urls = await native<(string | null)[]>("web_product_photos", { names: chunk, size: "thumb" }).catch(
      () => chunk.map(() => null),
    );
    chunk.forEach((name, j) => batch.get(name)?.(urls[j] ?? null));
  }
}

/** Las miniaturas de una lista se piden juntas. */
function loadThumb(name: string): Promise<string | null> {
  let url = thumbs.get(name);
  if (!url) {
    url = new Promise((resolve) => pending.set(name, resolve));
    thumbs.set(name, url);
    flushTimer ??= window.setTimeout(() => void flushThumbs(), 15);
  }
  return url;
}

async function uploadPhoto(file: File): Promise<string> {
  const [full, thumb] = await Promise.all([
    compressImageToDataUrl(file, FULL_CHARS, 1200).catch(() => null),
    compressImageToDataUrl(file, THUMB_CHARS, 320).catch(() => null),
  ]);
  if (!full || !thumb) throw new Error(PRODUCT_IMAGE_TYPE_ERROR);
  const name = await native<string>("web_photo_upload", { full, thumb });
  thumbs.set(name, Promise.resolve(thumb));
  previews.set(name, thumb);
  return name;
}

export async function pickProductImageFile(): Promise<string | null> {
  const [file] = await pickFiles(IMAGE_ACCEPT);
  return file ? uploadPhoto(file) : null;
}

export async function pickProductImageFiles(): Promise<string[]> {
  const files = await pickFiles(IMAGE_ACCEPT, true);
  const names: string[] = [];
  for (const file of files.slice(0, MAX_PICK)) names.push(await uploadPhoto(file));
  return names;
}

export async function saveProductImageFile(productId: number, sourcePath: string): Promise<string> {
  return native<string>("save_product_image", { productId, sourcePath });
}

export async function removeProductImageFile(productId: number): Promise<void> {
  await native("remove_product_image", { productId });
}

export async function saveProductPhotoFile(productId: number, sourcePath: string): Promise<string> {
  return native<string>("save_product_photo", { productId, sourcePath });
}

export async function removeProductPhotoFile(fileName: string): Promise<void> {
  await native("remove_product_photo_file", { fileName });
}

export async function resolveProductImageUrl(imagePath: string | null | undefined): Promise<string | null> {
  const name = imagePath?.trim();
  return name ? loadThumb(name) : null;
}

export async function resolveProductImageDataUrl(
  imagePath: string | null | undefined,
  maxChars = 28_000,
): Promise<string | null> {
  const url = await resolveProductImageUrl(imagePath);
  return url && url.length <= maxChars ? url : null;
}

/** Foto grande para la galería de la tienda web. */
export async function resolveProductPhotoForWeb(imagePath: string, maxChars: number): Promise<string | null> {
  const [full] = await native<(string | null)[]>("web_product_photos", { names: [imagePath], size: "full" }).catch(
    () => [null],
  );
  if (!full) return null;
  if (full.length <= maxChars) return full;
  const blob = await fetch(full).then((r) => r.blob());
  return compressImageToDataUrl(blob, maxChars, 1200).catch(() => null);
}

export async function productPhotoStamps(names: string[]): Promise<(string | null)[]> {
  if (names.length === 0) return [];
  return native<(string | null)[]>("product_photo_stamps", { names });
}

/** La foto recién elegida ya está subida: se muestra su miniatura. */
export function previewProductImage(sourcePath: string): string {
  return previews.get(sourcePath) ?? "";
}

export function isAllowedProductImage(path: string): boolean {
  return /\.(webp|jpg)$/i.test(path);
}

export async function pickAndPreviewProductImage(): Promise<{ sourcePath: string; previewUrl: string } | null> {
  const name = await pickProductImageFile();
  return name ? { sourcePath: name, previewUrl: previewProductImage(name) } : null;
}
