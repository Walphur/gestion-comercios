import type { BackupResult } from "./tauri";

export function formatBackupMessage(_result: BackupResult): string {
  return "Copia de seguridad guardada correctamente.";
}
