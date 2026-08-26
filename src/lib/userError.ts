/** Mensajes de error orientados al comerciante (sin términos técnicos). */

export const MSG_SAVE_FAILED = "No se pudieron guardar los cambios.";
export const MSG_DELETE_FAILED = "No se pudo eliminar el producto.";
export const PRODUCT_DELETE_ERROR = MSG_DELETE_FAILED;

export function formatProductDeleteError(_e: unknown): string {
  return MSG_DELETE_FAILED;
}
export const MSG_OPERATION_FAILED = "No se pudo completar la operación.";
export const MSG_TRY_AGAIN = "Intentá nuevamente. Si el problema continúa, contactá a soporte.";
export const MSG_DB_BUSY =
  "La base de datos está ocupada (otra operación en curso). Esperá un segundo e intentá de nuevo.";

function rawMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (typeof o.error === "string" && o.error.trim()) return o.error;
  }
  return String(e);
}

/** Quita prefijos técnicos de Rust/Tauri para mostrar el texto útil. */
function stripTechnicalPrefix(raw: string): string {
  return raw
    .replace(/^error\s*returned\s*from\s*[^:]+:\s*/i, "")
    .replace(/^(configuración|estado inválido|base de datos|HTTP|protocolo|red|IO|JSON):\s*/i, "")
    .replace(/^error:\s*/i, "")
    .trim();
}

export function isDataIntegrityError(e: unknown): boolean {
  const lower = rawMessage(e).toLowerCase();
  return (
    lower.includes("malformed") ||
    lower.includes("corrupt") ||
    lower.includes("disk image")
  );
}

export function isDbBusyError(e: unknown): boolean {
  const lower = rawMessage(e).toLowerCase();
  return (
    lower.includes("database is locked") ||
    lower.includes("database is busy") ||
    lower.includes("sqlite_busy") ||
    lower.includes("sqlite_locked") ||
    lower.includes("within a transaction") ||
    lower.includes("cannot start a transaction") ||
    lower.includes("estado inconsistente") ||
    (lower.includes("busy") && lower.includes("database"))
  );
}

export function formatUserError(e: unknown): string {
  const raw0 = rawMessage(e);
  const raw = stripTechnicalPrefix(raw0);
  const lower = raw.toLowerCase();

  // Log técnico para soporte (no se muestra al usuario).
  console.error("[userError]", raw0);

  if (isDbBusyError(e)) {
    if (lower.includes("inconsistente") || lower.includes("within a transaction")) {
      return "La base quedó trabada por un fallo anterior. Cerrá la app por completo, volvé a abrirla e intentá de nuevo.";
    }
    return MSG_DB_BUSY;
  }
  if (lower.includes("abrí el turno de caja")) return raw;
  if (lower.includes("seleccioná un cliente")) return raw;
  if (lower.includes("crédito") || lower.includes("fiado")) return raw;
  if (lower.includes("marcá la orden") || lower.includes("lista")) return raw;
  if (lower.includes("ya se registró la venta")) return raw;
  if (lower.includes("orden ya está cerrada") || lower.includes("ya está cerrada")) return raw;
  if (lower.includes("no fue posible eliminar")) return MSG_DELETE_FAILED;

  // Sync LAN / snapshot: mensajes operativos en español → mostrar tal cual.
  if (
    lower.includes("caso a") ||
    lower.includes("catálogo") ||
    lower.includes("snapshot") ||
    lower.includes("checksum") ||
    lower.includes("ya fue importado") ||
    lower.includes("pc vacía") ||
    lower.includes("pc vacia") ||
    lower.includes("ventas registradas") ||
    lower.includes("descarga cancelada") ||
    lower.includes("compartiendo")
  ) {
    return raw.length <= 280 ? raw : raw.slice(0, 277) + "…";
  }

  if (isDataIntegrityError(e)) {
    return `La base de datos parece dañada. ${MSG_TRY_AGAIN}`;
  }
  if (lower.includes("no such column") || lower.includes("no such table")) {
    return "La base de datos necesita actualizarse. Cerrá y volvé a abrir la app; si persiste, contactá a soporte.";
  }

  if (
    lower.includes("error sending request") ||
    lower.includes("connection refused") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("download ") ||
    lower.includes("manifest ")
  ) {
    return "No se pudo descargar el catálogo por LAN. Revisá que el servidor siga en «Compartir catálogo», misma clave y Wi‑Fi estable.";
  }

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

  // Mensajes cortos en español: mostrarlos tal cual.
  if (raw.length <= 200 && !/\bat\s/.test(raw) && !lower.includes("[object")) {
    return raw;
  }

  return `${MSG_OPERATION_FAILED} ${MSG_TRY_AGAIN}`;
}
