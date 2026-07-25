// In-memory sliding-window rate limiting. Pure and clock-injectable, so the
// behaviour is unit-testable and does not depend on wall time.
//
// Deliberately process-local: this app is a single self-hosted instance, so
// there is no shared store to coordinate with. If it ever runs multi-instance,
// swap the Map for Redis behind this same interface.

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts left in the current window (0 once blocked). */
  remaining: number;
  /** How long until the window frees up, in ms (0 when allowed). */
  retryAfterMs: number;
}

export interface RateLimiterOptions {
  /** Attempts permitted per window. */
  limit: number;
  windowMs: number;
  /** Injectable clock — defaults to Date.now. */
  now?: () => number;
  /** Cap on tracked keys, so a flood of unique keys can't exhaust memory. */
  maxKeys?: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly maxKeys: number;

  constructor(opts: RateLimiterOptions) {
    this.limit = opts.limit;
    this.windowMs = opts.windowMs;
    this.now = opts.now ?? Date.now;
    this.maxKeys = opts.maxKeys ?? 10_000;
  }

  /** Timestamps for a key with anything older than the window dropped. */
  private fresh(key: string, t: number): number[] {
    const cutoff = t - this.windowMs;
    const kept = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);
    if (kept.length) this.hits.set(key, kept);
    else this.hits.delete(key);
    return kept;
  }

  /** Drops keys whose attempts have all aged out. */
  private sweep(t: number) {
    for (const key of [...this.hits.keys()]) this.fresh(key, t);
    // Still over budget after sweeping (a genuine flood): drop oldest-first so
    // the limiter degrades instead of growing without bound.
    if (this.hits.size > this.maxKeys) {
      const excess = this.hits.size - this.maxKeys;
      for (const key of [...this.hits.keys()].slice(0, excess)) this.hits.delete(key);
    }
  }

  /** Whether a key is currently blocked, without recording an attempt. */
  peek(key: string): RateLimitResult {
    const t = this.now();
    const kept = this.fresh(key, t);
    if (kept.length >= this.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: kept[0] + this.windowMs - t };
    }
    return { allowed: true, remaining: this.limit - kept.length, retryAfterMs: 0 };
  }

  /** Records an attempt and reports whether it is allowed. */
  check(key: string): RateLimitResult {
    const t = this.now();
    if (this.hits.size >= this.maxKeys) this.sweep(t);
    const kept = this.fresh(key, t);

    if (kept.length >= this.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: kept[0] + this.windowMs - t };
    }
    kept.push(t);
    this.hits.set(key, kept);
    return { allowed: true, remaining: this.limit - kept.length, retryAfterMs: 0 };
  }

  /** Clears a key — call after a success so a good login isn't penalised. */
  reset(key: string) {
    this.hits.delete(key);
  }

  /** Test/introspection helper. */
  get size() {
    return this.hits.size;
  }
}

/** Seconds value for a Retry-After header. */
export const retryAfterSeconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/**
 * Best-effort client IP from proxy headers.
 *
 * X-Forwarded-For is caller-controlled and therefore spoofable, so this is
 * only ever one half of the login limiter — the per-account limit is what
 * actually protects a specific password from being ground down.
 */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}
