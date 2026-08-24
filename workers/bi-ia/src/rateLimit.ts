const WINDOW_MS = 86_400_000;
const LIMITS: Record<string, number> = {
  trial: 10,
  basic: 20,
  pro: 40,
};

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, plan: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const limit = LIMITS[plan] ?? LIMITS.basic ?? 20;
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

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
