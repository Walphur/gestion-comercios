import { webCall } from "../api";
import { BROWSER_COMMANDS } from "../browserCommands";

/** Reemplazo de invoke(): primero lo que resuelve el navegador, después el servidor. */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const local = BROWSER_COMMANDS[cmd];
  if (local) return (await local(args ?? {})) as T;
  return webCall<T>("/v1/native", { cmd, args: args ?? {} });
}

export function convertFileSrc(path: string): string {
  return path;
}
