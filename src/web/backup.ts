import { todayYmd } from "../lib/format";
import { webCall } from "./api";
import { downloadFile, pickFile, pickedFile } from "./files";

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Descarga la copia de todo el comercio. Devuelve el nombre del archivo. */
export async function downloadBackup(): Promise<string> {
  const backup = await webCall<{ data: string }>("/v1/native", { cmd: "web_backup_create", args: {} });
  const name = `WalQo-copia-${todayYmd()}.json.gz`;
  downloadFile(name, [fromBase64(backup.data)], "application/gzip");
  return name;
}

/** Elige una copia descargada y reemplaza los datos del comercio. null si no se eligió archivo. */
export async function restoreBackupFromFile(): Promise<{ tables: number; rows: number } | null> {
  const ref = await pickFile(".gz,application/gzip");
  if (!ref) return null;
  const bytes = new Uint8Array(await pickedFile(ref).arrayBuffer());
  return webCall("/v1/native", { cmd: "web_backup_restore", args: { data: toBase64(bytes) } });
}
