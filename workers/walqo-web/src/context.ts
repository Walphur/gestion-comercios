import { AsyncLocalStorage } from "node:async_hooks";

interface StoreScope {
  storage: DurableObjectStorage;
  env: Env;
}

/**
 * Varios comercios pueden compartir el mismo isolate, y src/db guarda la conexión
 * en una variable de módulo: cada consulta toma la base del comercio de este pedido.
 */
export const storeContext = new AsyncLocalStorage<StoreScope>();

function currentScope(): StoreScope {
  const scope = storeContext.getStore();
  if (!scope) throw new Error("No hay un comercio activo para esta consulta.");
  return scope;
}

export function currentStorage(): DurableObjectStorage {
  return currentScope().storage;
}

export function currentEnv(): Env {
  return currentScope().env;
}
