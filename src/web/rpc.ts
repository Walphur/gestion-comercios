import { WebApiError, webCall } from "./api";

/**
 * En la PC, src/db/products.ts pide subir la tienda web al cambiar un producto; en la web esas
 * funciones corren en el servidor, sin ventana: el aviso sale de acá.
 */
function changesStore(module: string, fn: string): boolean {
  if (module === "productPhotos") return fn === "saveProductGallery";
  return module === "products" && /^(create|update|delete|duplicate|bulk|saveProductListPrice)/.test(fn);
}

/**
 * En WalQo Web cada función async de src/db corre en el servidor (scripts/web/vite-db-rpc.mjs).
 * Si el error es una clase exportada por ese módulo (p. ej. OverpaymentError), se rearma
 * para que los `instanceof` de la interfaz sigan funcionando.
 */
export function rpcFunction(module: string, fn: string, real: Record<string, unknown>) {
  return async (...args: unknown[]) => {
    try {
      const value = await webCall("/v1/rpc", { m: module, f: fn, a: args });
      if (changesStore(module, fn)) {
        void import("../lib/menuPortalPush").then((m) => m.scheduleMenuPortalPush());
      }
      return value;
    } catch (error) {
      if (error instanceof WebApiError) {
        const ErrorClass = real[error.remoteName];
        if (typeof ErrorClass === "function" && ErrorClass.prototype instanceof Error) {
          const rebuilt = Object.create(ErrorClass.prototype) as Error;
          rebuilt.message = error.message;
          rebuilt.name = error.remoteName;
          throw rebuilt;
        }
      }
      throw error;
    }
  };
}
