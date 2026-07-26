/**
 * Token-bucket rate limiting for the FREE surface.
 *
 * The paid tools are rate-limited by money: every call costs USD₮0, so flooding
 * them is self-defeating. The free tools have no such brake, and one of them —
 * `register_wallet` — is genuinely expensive: registering an unknown address
 * schedules a backfill over ~200k blocks against the 100-block `getLogs` cap.
 * An unauthenticated caller looping registrations could keep the indexer busy
 * indefinitely at zero cost to itself.
 *
 * Deliberately in-process and dependency-free. On more than one machine each
 * gets its own bucket, so the effective limit is N x the configured rate — still
 * bounded, which is the property that matters. A shared Redis/Postgres counter
 * would buy exactness at the cost of a network round trip on every free call
 * and a new failure mode on the liveness path; not worth it here.
 */

export interface RateLimiterConfig {
  /** Burst size: how many requests a fresh key may make back to back. */
  capacity: number;
  /** Sustained rate once the burst is spent. */
  refillPerSecond: number;
  /**
   * Cap on tracked keys, so a caller cycling source addresses cannot grow the
   * map without bound — the limiter must not become the memory-exhaustion
   * vector it exists to prevent.
   */
  maxKeys?: number;
  now?: () => number;
}

export interface RateLimiter {
  /** Consume one token for `key`. False means the caller is over its limit. */
  take(key: string): boolean;
  /** Seconds until `key` has a token again. 0 when one is available now. */
  retryAfter(key: string): number;
  readonly size: number;
}

interface Bucket {
  tokens: number;
  updated: number;
}

export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const { capacity, refillPerSecond, maxKeys = 10_000, now = Date.now } = config;
  const buckets = new Map<string, Bucket>();

  /** Refill by elapsed time, clamped to capacity. Creates the bucket if absent. */
  const current = (key: string): Bucket => {
    const t = now();
    const existing = buckets.get(key);
    if (!existing) {
      const fresh: Bucket = { tokens: capacity, updated: t };
      // Evict the oldest-touched key rather than refusing to track a new one:
      // refusing would let an attacker pin the table and go unlimited.
      if (buckets.size >= maxKeys) {
        let oldestKey: string | undefined;
        let oldest = Infinity;
        for (const [k, b] of buckets) {
          if (b.updated < oldest) {
            oldest = b.updated;
            oldestKey = k;
          }
        }
        if (oldestKey !== undefined) buckets.delete(oldestKey);
      }
      buckets.set(key, fresh);
      return fresh;
    }
    const elapsed = Math.max(0, t - existing.updated) / 1000;
    existing.tokens = Math.min(capacity, existing.tokens + elapsed * refillPerSecond);
    existing.updated = t;
    return existing;
  };

  return {
    take(key: string): boolean {
      const bucket = current(key);
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
    retryAfter(key: string): number {
      const bucket = current(key);
      if (bucket.tokens >= 1) return 0;
      return Math.ceil((1 - bucket.tokens) / refillPerSecond);
    },
    get size() {
      return buckets.size;
    },
  };
}

/**
 * Identify the caller for limiting purposes.
 *
 * `Fly-Client-IP` is set by fly-proxy and cannot be forged by the client — it is
 * overwritten on every inbound request. `req.ip` is deliberately the fallback
 * rather than the primary: without `trust proxy` it resolves to the proxy's own
 * address in production, which would collapse every caller into one bucket.
 * X-Forwarded-For is not consulted at all, being client-controlled.
 */
export function clientKey(req: {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}): string {
  const fly = req.headers["fly-client-ip"];
  const value = Array.isArray(fly) ? fly[0] : fly;
  return value ?? req.ip ?? "unknown";
}
