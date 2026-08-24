/** Hash determinístico del payload IA para cache e invalidación. */

function stableSortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stableSortKeys);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = stableSortKeys(obj[key]);
  }
  return out;
}

export function canonicalizePayload(payload: unknown): string {
  return JSON.stringify(stableSortKeys(payload));
}

export async function hashIaPayload(payload: unknown): Promise<string> {
  const canonical = canonicalizePayload(payload);
  const data = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
