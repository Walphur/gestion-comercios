import { setStaffSession, WebApiError, webCall, webToken } from "../api";
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
  const pending = webCall<T>("/v1/native", { cmd, args: args ?? {} });
  // webCall ya armó los headers: se puede soltar el empleado sin esperar la respuesta.
  if (cmd === "web_staff_logout") setStaffSession("");
  const result = await pending;
  if (cmd === "verify_user_pin" && result && typeof result === "object") {
    const { staff_session, ...user } = result as Record<string, unknown>;
    setStaffSession(typeof staff_session === "string" ? staff_session : "");
    return user as T;
  }
  return result;
}

export function convertFileSrc(path: string): string {
  return path;
}
