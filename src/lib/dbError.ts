/** Mensaje claro cuando SQLite está dañada. */
export function formatDbError(e: unknown): string {
  const raw =
    e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
  const lower = raw.toLowerCase();
  if (lower.includes("malformed") || lower.includes("corrupt") || lower.includes("disk image")) {
    return (
      "No se pudo guardar el cambio: el índice de búsqueda de la base quedó dañado.\n\n" +
      "Suele pasar después de importar un Excel grande con miles de productos (tu catálogo propio). " +
      "No es el catálogo supermercado.\n\n" +
      "Solución: Administración → Sistema → «Reparar», cerrá la app por completo (X) y volvé a abrirla. " +
      "Si sigue: «Restaurar .bak»."
    );
  }
  return raw;
}

export function isDbCorruptionError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("malformed") || msg.includes("corrupt") || msg.includes("disk image");
}
