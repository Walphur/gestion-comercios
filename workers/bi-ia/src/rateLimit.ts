const WINDOW_MS = 86_400_000;

/** Desktop BI (GC1 + machine_id). */
const DESKTOP_LIMITS: Record<string, number> = {
  trial: 10,
  free: 10,
  basic: 20,
  pro: 40,
};

/**
 * Portal IA (PBS1, key = portal:${aid}).
 * PROVISIONAL — centralizado aquí; no reutiliza el bucket desktop.
 * Ajustar cuando exista política definitiva de producto.
 */
export const PORTAL_IA_LIMITS: Record<string, number> = {
  trial: 8,
  free: 8,
  basic: 20,
  pro: 40,
};

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function checkBucket(
  key: string,
  limit: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}

/** Desktop: key tipicamente `${lid}:${machineId}`. */
export function checkRateLimit(
  key: string,
  plan: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const limit = DESKTOP_LIMITS[plan] ?? DESKTOP_LIMITS.basic ?? 20;
  return checkBucket(key, limit);
}

/** Portal: identidad `portal:${aid}` — bucket separado del desktop. */
export function checkPortalRateLimit(
  aid: string,
  plan: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const clean = String(aid || "").trim();
  if (!clean) return { ok: false, retryAfterSec: 60 };
  const limit = PORTAL_IA_LIMITS[plan] ?? PORTAL_IA_LIMITS.basic ?? 20;
  return checkBucket(`portal:${clean}`, limit);
}

export function portalRateLimitKey(aid: string): string {
  return `portal:${String(aid || "").trim()}`;
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
