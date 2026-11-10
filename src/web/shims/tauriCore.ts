import { WebApiError, webCall, webToken } from "../api";
import { BROWSER_COMMANDS, PRE_SESSION_COMMANDS } from "../browserCommands";

/** Reemplazo de invoke(): primero lo que resuelve el navegador, después el servidor. */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const local = BROWSER_COMMANDS[cmd];
  if (local) return (await local(args ?? {})) as T;
  if (!webToken()) {
    const pre = PRE_SESSION_COMMANDS[cmd];
    if (pre) return (await pre(args ?? {})) as T;
    throw new WebApiError("Iniciá sesión con tu cuenta de WalQo.", "AuthError");
  }
  return webCall<T>("/v1/native", { cmd, args: args ?? {} });
}

export function convertFileSrc(path: string): string {
  return path;
}
