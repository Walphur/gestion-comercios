/** Datos internos del comercio en la web (cuenta, licencia, prueba): tabla _walqo_meta. */
import { currentStorage } from "./context";

export function readMeta(key: string): string | null {
  const row = currentStorage()
    .sql.exec<{ value: string }>("SELECT value FROM _walqo_meta WHERE key = ?", key)
    .toArray()[0];
  return row?.value ?? null;
}

export function deleteMeta(key: string): void {
  currentStorage().sql.exec("DELETE FROM _walqo_meta WHERE key = ?", key);
}

export function writeMeta(key: string, value: string): void {
  currentStorage().sql.exec(
    "INSERT INTO _walqo_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
    key,
    value,
  );
}
