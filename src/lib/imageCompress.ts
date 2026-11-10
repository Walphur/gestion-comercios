export function blobToDataUrl(blob: Blob): Promise<string | null> {
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

/** Foto achicada a `startSide` px (o menos) en WebP o JPEG, hasta que entre en `maxChars`. */
export async function compressImageToDataUrl(
  blob: Blob,
  maxChars: number,
  startSide = 720,
): Promise<string | null> {
  const img = await loadImageFromBlob(blob);
  let maxSide = startSide;
  for (let attempt = 0; attempt < 6; attempt++) {
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#f4f1eb";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    for (const type of ["image/webp", "image/jpeg"] as const) {
      for (const quality of [0.86, 0.74, 0.6, 0.46]) {
        const out = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), type, quality),
        );
        // Safari no codifica WebP y devuelve PNG en su lugar: se sigue con JPEG.
        if (!out || out.type !== type) continue;
        const dataUrl = await blobToDataUrl(out);
        if (dataUrl && dataUrl.length <= maxChars) return dataUrl;
      }
    }
    maxSide = Math.round(maxSide * 0.7);
  }
  return null;
}
