import { WebApiError, webCall } from "./api";

/**
 * En WalQo Web cada función async de src/db corre en el servidor (scripts/web/vite-db-rpc.mjs).
 * Si el error es una clase exportada por ese módulo (p. ej. OverpaymentError), se rearma
 * para que los `instanceof` de la interfaz sigan funcionando.
 */
export function rpcFunction(module: string, fn: string, real: Record<string, unknown>) {
  return async (...args: unknown[]) => {
    try {
      return await webCall("/v1/rpc", { m: module, f: fn, a: args });
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
