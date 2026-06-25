/** Mensaje amigable cuando falla eliminar un producto. */
export const PRODUCT_DELETE_ERROR =
  "No fue posible eliminar el producto. Intentá nuevamente.";

export function formatProductDeleteError(e: unknown): string {
  const raw =
    e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
  if (raw.includes(PRODUCT_DELETE_ERROR)) return PRODUCT_DELETE_ERROR;
  return PRODUCT_DELETE_ERROR;
}

/** Mensaje genérico para otros errores de base (sin exponer corrupción al usuario). */
export function formatDbError(e: unknown): string {
  const raw =
    e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
  const lower = raw.toLowerCase();
  if (
    lower.includes("malformed") ||
    lower.includes("corrupt") ||
    lower.includes("disk image")
  ) {
    return "No se pudo completar la operación. Intentá nuevamente.";
  }
  return raw;
}
