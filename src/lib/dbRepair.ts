import { repairDatabase } from "./tauri";
import { withRustDb } from "./rustDb";
import { confirmAction } from "./confirm";
import { formatDbError, isDbCorruptionError } from "./dbError";

/** Ofrece reparar la base cuando falla borrar/guardar por índice dañado (Excel grande). */
export async function offerDbRepairOnCorruption(e: unknown): Promise<void> {
  if (!isDbCorruptionError(e)) {
    alert(formatDbError(e));
    return;
  }
  const ok = await confirmAction({
    title: "No se pudo eliminar",
    message: "El índice de búsqueda quedó dañado (común tras importar Excel con miles de filas).",
    detail: "¿Reparar ahora? Después tenés que cerrar la app por completo (X) y volver a abrirla.",
    confirmLabel: "Reparar ahora",
  });
  if (!ok) {
    alert(formatDbError(e));
    return;
  }
  try {
    const msg = await withRustDb(() => repairDatabase());
    alert(`${msg}\n\nCerrá la app por completo y volvé a abrirla. Luego probá eliminar de nuevo.`);
  } catch (re) {
    alert(formatDbError(re));
  }
}
