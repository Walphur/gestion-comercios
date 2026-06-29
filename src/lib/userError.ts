/** Mensajes de error orientados al comerciante (sin términos técnicos). */

export const MSG_SAVE_FAILED = "No se pudieron guardar los cambios.";
export const MSG_DELETE_FAILED = "No se pudo eliminar el producto.";
export const PRODUCT_DELETE_ERROR = MSG_DELETE_FAILED;

export function formatProductDeleteError(_e: unknown): string {
  return MSG_DELETE_FAILED;
}
export const MSG_OPERATION_FAILED = "No se pudo completar la operación.";
export const MSG_TRY_AGAIN = "Intentá nuevamente. Si el problema continúa, contactá a soporte.";

function rawMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

export function isDataIntegrityError(e: unknown): boolean {
  const lower = rawMessage(e).toLowerCase();
  return (
    lower.includes("malformed") ||
    lower.includes("corrupt") ||
    lower.includes("disk image") ||
    lower.includes("database") ||
    lower.includes("sqlite")
  );
}

export function formatUserError(e: unknown): string {
  const raw = rawMessage(e);
  const lower = raw.toLowerCase();

  if (lower.includes("abrí el turno de caja")) return raw;
  if (lower.includes("seleccioná un cliente")) return raw;
  if (lower.includes("crédito") || lower.includes("fiado")) return raw;
  if (lower.includes("no fue posible eliminar")) return MSG_DELETE_FAILED;
  if (isDataIntegrityError(e)) return `${MSG_OPERATION_FAILED} ${MSG_TRY_AGAIN}`;

  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("internet") ||
    lower.includes("offline")
  ) {
    return "Sin conexión a internet. Podés seguir trabajando con los datos locales.";
  }

  if (lower.includes("permission") || lower.includes("denied")) {
    return "No tenés permiso para realizar esta acción.";
  }

  if (
    lower.includes("unique") ||
    lower.includes("duplicate") ||
    lower.includes("ya existe")
  ) {
    return "Ese dato ya existe. Revisá el nombre o el código e intentá de nuevo.";
  }

  if (lower.includes("not found") || lower.includes("no encontrad")) {
    return "No se encontró el registro. Puede haber sido eliminado.";
  }

  if (raw.length > 120 || lower.includes("error:") || lower.includes("at ")) {
    return MSG_OPERATION_FAILED;
  }

  return raw;
}
