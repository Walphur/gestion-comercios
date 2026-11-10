import { NATIVE_COMMANDS } from "../native";

/**
 * Comandos de Rust que src/db dispara en la PC. Los que tocan la base están en native.ts;
 * los avisos a Tienda Nube, portales y taller todavía no corren en la web.
 */
const IGNORED_ON_WEB = new Set([
  "tn_enqueue_stock_push_many",
  "queue_workshop_export",
  "workshop_portal_push",
  "owner_portal_push",
]);

export function convertFileSrc(path: string): string {
  return path;
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const handler = NATIVE_COMMANDS[cmd];
  if (handler) return (await handler(args ?? {})) as T;
  if (IGNORED_ON_WEB.has(cmd)) return null as T;
  throw new Error(`«${cmd}» todavía no está disponible en WalQo Web.`);
}
