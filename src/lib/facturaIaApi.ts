import type { PurchaseGuideLine } from "./parsePurchaseGuideCsv";

export const FACTURA_IA_API = "https://gestion-factura-ia.walphur.workers.dev";

interface ApiItem {
  nombre?: string;
  name?: string;
  codigo?: string;
  sku?: string;
  barcode?: string;
  cantidad?: number;
  stock?: number;
  packs?: number;
  unidades_por_pack?: number;
  costo?: number;
  cost?: number;
  precio?: number;
  price?: number;
  tipo?: string;
}

function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function uint8ToBase64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

/** Comprime la foto (max ~2200px) a JPEG base64 para el Worker. */
export async function compressInvoiceImage(file: File): Promise<{ base64: string; mime: string }> {
  const maxSide = 2200;
  if (file.size <= 3_500_000 && file.type !== "image/png" && file.type.startsWith("image/")) {
    const buf = await file.arrayBuffer();
    return { base64: uint8ToBase64(new Uint8Array(buf)), mime: file.type || "image/jpeg" };
  }

  const img = await createImageBitmap(file);
  try {
    const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * sc));
    c.height = Math.max(1, Math.round(img.height * sc));
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la imagen.");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.88));
    if (!blob) throw new Error("No se pudo comprimir la imagen.");
    const u8 = new Uint8Array(await blob.arrayBuffer());
    return { base64: uint8ToBase64(u8), mime: "image/jpeg" };
  } finally {
    img.close();
  }
}

function mapApiItem(raw: ApiItem): PurchaseGuideLine | null {
  const name = String(raw.nombre || raw.name || "").trim();
  if (!name) return null;

  const mult = Number(raw.unidades_por_pack ?? 1) || 1;
  const isMayor = raw.tipo === "mayorista";
  const packs = Number(raw.packs ?? 1) || 1;
  const qty = isMayor
    ? Math.round(Number(raw.stock ?? raw.cantidad ?? packs * mult) || 0)
    : Math.round(Number(raw.stock ?? raw.cantidad ?? 1) || 0);
  if (qty <= 0) return null;

  const codigo = String(raw.codigo || raw.sku || raw.barcode || "").trim();
  return {
    name,
    qty,
    unitCost: round2(Number(raw.costo ?? raw.cost ?? 0)),
    salePrice: round2(Number(raw.precio ?? raw.price ?? 0)),
    supplierCode: codigo || undefined,
  };
}

export class FacturaIaError extends Error {
  retry: boolean;
  constructor(message: string, retry = false) {
    super(message);
    this.name = "FacturaIaError";
    this.retry = retry;
  }
}

async function readInvoiceOnce(base64: string, mime: string): Promise<PurchaseGuideLine[]> {
  const res = await fetch(FACTURA_IA_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: base64, mime_type: mime }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    items?: ApiItem[];
  };
  if (!res.ok) {
    throw new FacturaIaError(
      data.error || "Servicio no disponible.",
      res.status >= 500 || res.status === 422,
    );
  }
  const lines = (data.items ?? [])
    .map(mapApiItem)
    .filter((x): x is PurchaseGuideLine => x != null);
  if (lines.length === 0) {
    throw new FacturaIaError("No pudimos extraer productos de esa factura.", true);
  }
  return lines;
}

/** Lee la factura con reintentos (igual que la web). */
export async function readInvoiceWithAi(
  base64: string,
  mime: string,
): Promise<PurchaseGuideLine[]> {
  let last: unknown;
  for (let i = 1; i <= 3; i++) {
    try {
      return await readInvoiceOnce(base64, mime);
    } catch (e) {
      last = e;
      const retry = e instanceof FacturaIaError ? e.retry : true;
      if (!retry || i === 3) break;
      await new Promise((r) => setTimeout(r, 600 * i));
    }
  }
  if (last instanceof Error) throw last;
  throw new FacturaIaError("No se pudo leer la factura.", true);
}

export async function readInvoiceFileWithAi(file: File): Promise<PurchaseGuideLine[]> {
  if (file.type === "application/pdf") {
    throw new FacturaIaError("Por ahora subí JPG o PNG.", false);
  }
  const { base64, mime } = await compressInvoiceImage(file);
  return readInvoiceWithAi(base64, mime);
}
