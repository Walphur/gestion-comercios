import { invoke } from "@tauri-apps/api/core";
import type { MenuPortalProduct } from "../db/menuPortalData";
import { productPhotoStamps, resolveProductPhotoForWeb } from "./productImages";

/** Cambiar si cambia la compresión, para volver a subir todo. */
const PHOTO_VERSION = "g1";
const MAX_PHOTO_CHARS = 160_000;
const MAX_BATCH_CHARS = 900_000;
const MAX_PER_BATCH = 12;
/** Por subida; lo que falta sigue en la próxima (cada 3 minutos). */
const MAX_UPLOADS_PER_PUSH = 40;

async function photoHash(file: string, stamp: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${PHOTO_VERSION}|${file}|${stamp}`),
  );
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

function photosRequest<T>(payload: Record<string, unknown>): Promise<T> {
  return invoke<T>("menu_portal_orders", { action: "photos", payload });
}

/**
 * Sube a la tienda las fotos que el servidor no tiene (primero los productos con varias fotos)
 * y cambia `photo_files` por los hashes publicados. Sin conexión o sin lugar, la tienda sigue
 * con la miniatura de siempre.
 */
export async function attachMenuPortalPhotos(products: MenuPortalProduct[]): Promise<void> {
  try {
    const files = [...new Set(products.flatMap((p) => p.photo_files ?? []))];
    if (files.length === 0) return;
    const stamps = await productPhotoStamps(files);
    const hashByFile = new Map<string, string>();
    for (let i = 0; i < files.length; i++) {
      const stamp = stamps[i];
      if (stamp) hashByFile.set(files[i], await photoHash(files[i], stamp));
    }

    const listed = await photosRequest<{ hashes?: string[] }>({ action: "list" });
    const have = new Set(Array.isArray(listed.hashes) ? listed.hashes : []);

    const ordered = [
      ...products.filter((p) => (p.photo_files?.length ?? 0) > 1),
      ...products.filter((p) => (p.photo_files?.length ?? 0) === 1),
    ];
    const queued = new Set<string>();
    const missing: { file: string; hash: string }[] = [];
    for (const p of ordered) {
      for (const file of p.photo_files ?? []) {
        const hash = hashByFile.get(file);
        if (!hash || have.has(hash) || queued.has(hash)) continue;
        queued.add(hash);
        missing.push({ file, hash });
      }
    }

    let batch: { h: string; data_url: string }[] = [];
    let batchChars = 0;
    let stop = false;
    let uploads = 0;
    const flush = async () => {
      if (batch.length === 0) return;
      try {
        const res = await photosRequest<{ saved?: string[]; full?: boolean }>({
          action: "put",
          photos: batch,
        });
        for (const h of res.saved ?? []) have.add(h);
        if (res.full) stop = true;
      } catch {
        stop = true;
      }
      batch = [];
      batchChars = 0;
    };
    for (const m of missing) {
      if (stop || uploads >= MAX_UPLOADS_PER_PUSH) break;
      const dataUrl = await resolveProductPhotoForWeb(m.file, MAX_PHOTO_CHARS);
      if (!dataUrl) continue;
      if (batch.length >= MAX_PER_BATCH || batchChars + dataUrl.length > MAX_BATCH_CHARS) await flush();
      if (stop) break;
      batch.push({ h: m.hash, data_url: dataUrl });
      batchChars += dataUrl.length;
      uploads += 1;
    }
    await flush();

    for (const p of products) {
      const hashes = (p.photo_files ?? [])
        .map((f) => hashByFile.get(f))
        .filter((h): h is string => Boolean(h && have.has(h)));
      if (hashes.length) p.photos = hashes;
    }
  } catch {
    /* sin galería: la tienda sigue con la miniatura */
  } finally {
    for (const p of products) delete p.photo_files;
  }
}
