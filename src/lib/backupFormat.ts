import type { BackupResult } from "./tauri";

export function formatBackupMessage(result: BackupResult): string {
  const local = result.local_path?.trim();
  if (local && result.cloud_path?.trim()) {
    return `Copia guardada en ${local} (también en la nube).`;
  }
  if (local) {
    return `Copia guardada en ${local}`;
  }
  return "Copia de seguridad guardada correctamente.";
}
