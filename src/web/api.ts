/** Cliente de WalQo Web: habla con workers/walqo-web, la base del comercio en internet. */
import { decodeWire, encodeWire } from "./wire";

const TOKEN_KEY = "walqo_web_token";

function apiBase(): string {
  const configured = import.meta.env.VITE_WALQO_WEB_API as string | undefined;
  if (configured) return configured.replace(/\/$/, "");
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return local ? "http://127.0.0.1:8790" : "https://walqo-web.walphur.workers.dev";
}

export function webToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

/** Empleado que entró con PIN: solo en memoria, se pierde al recargar igual que el usuario. */
let staffSession = "";

export function setStaffSession(token: string): void {
  staffSession = token;
}

const sessionEndListeners = new Set<() => void>();

/** Avisa cuando la sesión de la cuenta termina (salir o sesión vencida). */
export function onSessionEnd(listener: () => void): () => void {
  sessionEndListeners.add(listener);
  return () => sessionEndListeners.delete(listener);
}

export function setWebToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
  staffSession = "";
  for (const listener of sessionEndListeners) listener();
}

export class WebApiError extends Error {
  constructor(
    message: string,
    readonly remoteName: string,
  ) {
    super(message);
    this.name = remoteName;
  }
}

type CallResult = { ok: true; value: unknown } | { ok: false; error: { name: string; message: string } };

export async function webCall<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${webToken()}`,
  };
  if (staffSession) headers["X-WalQo-Staff"] = staffSession;
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers,
      body: encodeWire(body),
    });
  } catch {
    throw new WebApiError("Sin conexión a internet. Revisá la red e intentá de nuevo.", "NetworkError");
  }
  const text = await res.text().catch(() => "");
  let data: CallResult | null = null;
  try {
    data = decodeWire<CallResult>(text);
  } catch {
    data = null;
  }
  if (!data) throw new WebApiError(`El servidor respondió ${res.status}.`, "Error");
  if (!data.ok) {
    if (res.status === 401 && webToken()) setWebToken(null);
    throw new WebApiError(data.error.message, data.error.name);
  }
  return data.value as T;
}
