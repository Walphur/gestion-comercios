/** Enlace http(s) tal como lo pegaron, o vacío si no hay nada. Null si no es http(s). */
export function normalizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return trimmed;
}

export function usableHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeHttpUrl(value);
  return normalized ? normalized : null;
}
