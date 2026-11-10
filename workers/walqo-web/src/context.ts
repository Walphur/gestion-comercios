import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Varios comercios pueden compartir el mismo isolate, y src/db guarda la conexión
 * en una variable de módulo: cada consulta toma la base del comercio de este pedido.
 */
export const storeContext = new AsyncLocalStorage<DurableObjectStorage>();

export function currentStorage(): DurableObjectStorage {
  const storage = storeContext.getStore();
  if (!storage) throw new Error("No hay un comercio activo para esta consulta.");
  return storage;
}
