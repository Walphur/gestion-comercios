/**
 * Fotos de productos en WalQo Web (en la PC: carpeta product_images, product_images.rs).
 * El navegador las comprime antes de subir (grande hasta 1200 px y miniatura) y acá se guardan
 * en _walqo_photos; products.image_path y product_photos guardan el nombre, como en la PC.
 * No viajan en la copia de seguridad: quedan en la cuenta.
 */
import { currentStorage } from "./context";

type Args = Record<string, unknown>;

const MAX_FULL_CHARS = 200_000;
const MAX_THUMB_CHARS = 40_000;
/** Por comercio (~100 KB cada una): 4 fotos para 300 productos y algo más. */
const MAX_PHOTOS = 1500;
/** Elegidas y nunca guardadas en un producto (formulario cancelado): se borran al día. */
const UNUSED_KEEP_SEC = 86_400;
const NAME_RE = /^w[0-9a-f]{16}\.(webp|jpg)$/;
const DATA_URL_RE = /^data:(image\/(?:webp|jpeg));base64,([A-Za-z0-9+/]+=*)$/;

const nowSec = () => Math.floor(Date.now() / 1000);

export function ensurePhotoTable(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS _walqo_photos (
    name TEXT PRIMARY KEY, mime TEXT NOT NULL, full BLOB NOT NULL, thumb BLOB NOT NULL,
    bytes INTEGER NOT NULL, created_at INTEGER NOT NULL)`);
}

function decode(dataUrl: unknown, max: number): { mime: string; bytes: Uint8Array } | null {
  if (typeof dataUrl !== "string" || dataUrl.length > max) return null;
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes };
}

function toDataUrl(mime: string, buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

function photoName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  return NAME_RE.test(name) ? name : null;
}

function exists(name: string): boolean {
  return currentStorage().sql.exec("SELECT 1 FROM _walqo_photos WHERE name = ?", name).toArray().length > 0;
}

function inUse(name: string): boolean {
  return (
    currentStorage()
      .sql.exec(
        `SELECT 1 FROM products WHERE image_path = ?1
         UNION ALL SELECT 1 FROM product_photos WHERE file_name = ?1 LIMIT 1`,
        name,
      )
      .toArray().length > 0
  );
}

function purgeUnused(): void {
  currentStorage().sql.exec(
    `DELETE FROM _walqo_photos WHERE created_at < ?1
       AND name NOT IN (SELECT image_path FROM products WHERE image_path IS NOT NULL)
       AND name NOT IN (SELECT file_name FROM product_photos)`,
    nowSec() - UNUSED_KEEP_SEC,
  );
}

/** La foto elegida ya está subida: guardarla en el producto es usar su nombre. */
function attach(args: Args): string {
  const name = photoName(args.sourcePath);
  if (!name || !exists(name)) throw new Error("No se encontró la imagen. Volvé a elegirla.");
  return name;
}

function readPhotos(names: unknown, column: "full" | "thumb"): (string | null)[] {
  const list = Array.isArray(names) ? names.slice(0, 200) : [];
  const sql = currentStorage().sql;
  return list.map((raw) => {
    const name = photoName(raw);
    if (!name) return null;
    const row = sql
      .exec<{ mime: string; data: ArrayBuffer }>(`SELECT mime, ${column} AS data FROM _walqo_photos WHERE name = ?`, name)
      .toArray()[0];
    return row ? toDataUrl(row.mime, row.data) : null;
  });
}

export const PHOTO_COMMANDS: Record<string, (args: Args) => Promise<unknown>> = {
  async web_photo_upload(args) {
    const full = decode(args.full, MAX_FULL_CHARS);
    const thumb = decode(args.thumb, MAX_THUMB_CHARS);
    if (!full || !thumb) throw new Error("Esa foto no sirve. Usá PNG, JPG o WebP.");
    purgeUnused();
    const sql = currentStorage().sql;
    const count = Number(sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM _walqo_photos").one().n);
    if (count >= MAX_PHOTOS) {
      throw new Error(`Llegaste al tope de ${MAX_PHOTOS} fotos de WalQo Web. Sacá fotos de productos que ya no usás.`);
    }
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
    const name = `w${id}.${full.mime === "image/webp" ? "webp" : "jpg"}`;
    sql.exec(
      "INSERT INTO _walqo_photos (name, mime, full, thumb, bytes, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      name,
      full.mime,
      full.bytes,
      thumb.bytes,
      full.bytes.length + thumb.bytes.length,
      nowSec(),
    );
    return name;
  },

  async web_product_photos(args) {
    return readPhotos(args.names, args.size === "full" ? "full" : "thumb");
  },

  /** Miniatura para la carta (buildMenuPortalProducts): la PC devuelve la ruta del archivo. */
  async get_product_image_abs_path(args) {
    return readPhotos([args.imagePath], "thumb")[0];
  },

  async save_product_image(args) {
    return attach(args);
  },
  async save_product_photo(args) {
    return attach(args);
  },

  /** La PC borra {id}.{ext}; acá la foto se borra cuando ningún producto la usa. */
  async remove_product_image() {
    return null;
  },
  async remove_product_photo_file(args) {
    const name = photoName(args.fileName);
    if (name && !inUse(name)) currentStorage().sql.exec("DELETE FROM _walqo_photos WHERE name = ?", name);
    return null;
  },

  /** Cambia si cambia la foto: así la tienda sabe cuáles volver a subir. */
  async product_photo_stamps(args) {
    const list = Array.isArray(args.names) ? args.names.slice(0, 2000) : [];
    const sql = currentStorage().sql;
    return list.map((raw) => {
      const name = photoName(raw);
      if (!name) return null;
      const row = sql
        .exec<{ bytes: number; created_at: number }>("SELECT bytes, created_at FROM _walqo_photos WHERE name = ?", name)
        .toArray()[0];
      return row ? `${row.bytes}-${row.created_at}` : null;
    });
  },
};
