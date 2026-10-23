// In-memory limiter for login attempts. Per server instance, which is enough to
// slow down password guessing on a single-tenant install.
const attempts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  for (const [k, e] of attempts) if (now > e.resetAt) attempts.delete(k);

  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetAt: now + WINDOW_MS };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= MAX_ATTEMPTS,
    remaining: Math.max(0, MAX_ATTEMPTS - entry.count),
    resetAt: entry.resetAt,
  };
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}
