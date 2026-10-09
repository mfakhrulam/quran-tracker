const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): { allowed: boolean } {
  const entry = attempts.get(key);
  if (!entry) return { allowed: true };
  if (Date.now() > entry.resetAt) { attempts.delete(key); return { allowed: true }; }
  return { allowed: entry.count < MAX_ATTEMPTS };
}

export function recordFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function resetRateLimit(key: string): void { attempts.delete(key); }
