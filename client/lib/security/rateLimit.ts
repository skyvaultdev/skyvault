const rateMap = new Map<string, { count: number; last: number }>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateMap.get(key);

  if (!entry || now - entry.last > windowMs) {
    rateMap.set(key, { count: 1, last: now });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count++;
  return true;
}