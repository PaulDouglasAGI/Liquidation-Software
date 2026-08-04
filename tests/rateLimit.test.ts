import { describe, expect, it } from "vitest";
import { RateLimiter, clientIp, retryAfterSeconds } from "@/lib/rateLimit";

/** A limiter driven by a clock we control, so nothing depends on wall time. */
function makeLimiter(limit = 3, windowMs = 1000, maxKeys?: number) {
  let t = 1_000_000;
  const rl = new RateLimiter({ limit, windowMs, now: () => t, maxKeys });
  return { rl, advance: (ms: number) => (t += ms) };
}

describe("RateLimiter", () => {
  it("allows up to the limit then blocks", () => {
    const { rl } = makeLimiter(3, 1000);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
  });

  it("counts down remaining attempts", () => {
    const { rl } = makeLimiter(3, 1000);
    expect(rl.check("a").remaining).toBe(2);
    expect(rl.check("a").remaining).toBe(1);
    expect(rl.check("a").remaining).toBe(0);
    expect(rl.check("a").remaining).toBe(0); // stays pinned once blocked
  });

  it("keeps keys independent — one user's failures don't lock out another", () => {
    const { rl } = makeLimiter(2, 1000);
    rl.check("alice");
    rl.check("alice");
    expect(rl.check("alice").allowed).toBe(false);
    expect(rl.check("bob").allowed).toBe(true);
  });

  it("frees up once the window slides past the old attempts", () => {
    const { rl, advance } = makeLimiter(2, 1000);
    rl.check("a");
    rl.check("a");
    expect(rl.check("a").allowed).toBe(false);
    advance(1001);
    expect(rl.check("a").allowed).toBe(true);
  });

  it("slides rather than resetting wholesale", () => {
    const { rl, advance } = makeLimiter(2, 1000);
    rl.check("a"); // t=0
    advance(600);
    rl.check("a"); // t=600
    expect(rl.check("a").allowed).toBe(false);
    advance(500); // t=1100: the first attempt aged out, the second has not
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
  });

  it("reports how long until the caller may retry", () => {
    const { rl, advance } = makeLimiter(1, 1000);
    rl.check("a");
    advance(300);
    const r = rl.check("a");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBe(700); // 1000 window - 300 elapsed
  });

  it("reset clears a key, so a correct password lifts the lockout", () => {
    const { rl } = makeLimiter(2, 1000);
    rl.check("a");
    rl.check("a");
    expect(rl.check("a").allowed).toBe(false);
    rl.reset("a");
    expect(rl.check("a").allowed).toBe(true);
  });

  it("peek reports status without consuming an attempt", () => {
    const { rl } = makeLimiter(2, 1000);
    rl.check("a");
    expect(rl.peek("a").remaining).toBe(1);
    expect(rl.peek("a").remaining).toBe(1); // unchanged by peeking
    expect(rl.check("a").allowed).toBe(true);
  });

  it("forgets keys once their attempts age out, so memory doesn't creep", () => {
    const { rl, advance } = makeLimiter(2, 1000);
    rl.check("a");
    expect(rl.size).toBe(1);
    advance(1001);
    rl.peek("a");
    expect(rl.size).toBe(0);
  });

  it("a flood of unique keys cannot clear an existing lockout", () => {
    // Security property: evicting live entries to cap memory would let an
    // attacker flush a victim's lockout by minting keys (one per made-up
    // email) and then resume guessing. Locked keys must survive the flood.
    const { rl } = makeLimiter(2, 60_000, 10);
    rl.check("victim@shop.com");
    rl.check("victim@shop.com");
    expect(rl.check("victim@shop.com").allowed).toBe(false);

    for (let i = 0; i < 500; i++) rl.check(`attacker-${i}@spam.test`);

    expect(rl.check("victim@shop.com").allowed).toBe(false);
  });

  it("still reclaims keys once their attempts age out", () => {
    const { rl, advance } = makeLimiter(2, 1000, 10);
    for (let i = 0; i < 50; i++) rl.check(`k${i}`);
    expect(rl.size).toBe(50);
    advance(1001);
    rl.check("trigger-sweep");
    // Everything expired, so the map collapses back down on its own.
    expect(rl.size).toBeLessThanOrEqual(1);
  });
});

describe("retryAfterSeconds", () => {
  it("rounds up and never returns 0", () => {
    expect(retryAfterSeconds(1500)).toBe(2);
    expect(retryAfterSeconds(1)).toBe(1);
    expect(retryAfterSeconds(0)).toBe(1);
  });
});

describe("clientIp", () => {
  it("takes the first hop of X-Forwarded-For", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" });
    expect(clientIp(h)).toBe("203.0.113.5");
  });

  it("falls back to X-Real-IP, then to a constant bucket", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("does not crash on a malformed header", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "  ,  " }))).toBe("unknown");
  });
});
