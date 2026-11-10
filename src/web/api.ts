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
  return (
    localStorage.getItem(TOKEN_KEY) ?? (import.meta.env.VITE_WALQO_WEB_TOKEN as string | undefined) ?? ""
  );
}

export function setWebToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${webToken()}` },
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
  if (!data.ok) throw new WebApiError(data.error.message, data.error.name);
  return data.value as T;
}
