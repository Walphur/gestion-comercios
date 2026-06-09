/** Mensaje claro cuando SQLite está dañada. */
export function formatDbError(e: unknown): string {
  const raw =
    e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
  const lower = raw.toLowerCase();
  if (lower.includes("malformed") || lower.includes("corrupt") || lower.includes("disk image")) {
    return (
      "La base de datos está dañada y no se puede guardar cambios.\n\n" +
      "Andá a Administración → Sistema → «Reparar». Cerrá y abrí la app, e intentá de nuevo. " +
      "Si sigue fallando: Administración → Sistema → «Restaurar .bak» (se pierden cambios recientes)."
    );
  }
  return raw;
}

export function isDbCorruptionError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("malformed") || msg.includes("corrupt") || msg.includes("disk image");
}
