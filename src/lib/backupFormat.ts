import type { BackupResult } from "./tauri";

export function formatBackupMessage(result: BackupResult): string {
  const lines = [`Backup local: ${result.local_path}`];
  if (result.cloud_path) {
    lines.push(`Copia en nube: ${result.cloud_path}`);
  }
  return lines.join("\n");
}
