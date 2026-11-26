/**
 * Sliding-window request limiter kept in server memory.
 *
 * Each server instance keeps its own counts, so this slows abuse rather than stopping it outright
 * (the same trade-off as /api/track). A firm limit would need a shared store such as Redis.
 */
export type Limiter = {
  /** Records a hit for `key`. Returns 0 when allowed, or the seconds until the next request is allowed. */
  hit(key: string, now?: number): number;
};

export function createLimiter(max: number, windowMs: number, maxKeys = 5000): Limiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key: string, now = Date.now()) {
      const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= windowMs) hits.delete(k);
      }
      return 0;
    },
  };
}
