/**
 * Archivos en el navegador. Donde la PC devuelve una ruta del disco, la web devuelve una
 * referencia «web-file:…» al archivo elegido; los comandos que reciben esa ruta lo leen de acá.
 */
const picked = new Map<string, File>();
let sequence = 0;

/** Abre el selector de archivos. null si se cancela. */
export function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      const ref = `web-file:${++sequence}/${file.name}`;
      picked.set(ref, file);
      resolve(ref);
    };
    // Chrome 109 (el último de Windows 7) no tiene el evento «cancel»: si vuelve el foco y no
    // llegó ningún archivo, se cerró el selector sin elegir.
    const onFocus = () => window.setTimeout(() => finish(input.files?.[0] ?? null), 1000);

    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    window.addEventListener("focus", onFocus);
    input.click();
  });
}

export function pickedFile(ref: string): File {
  const file = picked.get(ref);
  if (!file) throw new Error("Volvé a elegir el archivo.");
  return file;
}

/** Texto de un archivo, en UTF-8 o, si no lo es, en la codificación de Excel en Windows. */
export async function readFileText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("windows-1252").decode(body);
  }
}

export function downloadFile(name: string, parts: BlobPart[], type: string): void {
  const url = URL.createObjectURL(new Blob(parts, { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Con BOM UTF-8 para que Excel muestre bien los acentos, como write_csv_export en la PC. */
export function downloadCsv(name: string, contents: string): void {
  downloadFile(name, ["\uFEFF", contents], "text/csv;charset=utf-8");
}

/** Nombre seguro para descargar, como pick_export_csv_path en la PC. */
export function safeCsvName(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N}_.-]/gu, "_");
  return safe.toLowerCase().endsWith(".csv") ? safe : `${safe}.csv`;
}

export function fileNameOf(ref: string): string {
  return ref.split("/").pop() ?? ref;
}
