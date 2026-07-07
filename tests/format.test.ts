import { describe, expect, it } from "vitest";
import { marginPct, money, pct, localDateStr, daysSince } from "@/lib/format";

describe("marginPct", () => {
  it("computes margin from sell price and cost", () => {
    expect(marginPct(100, 60)).toBeCloseTo(40);
    expect(marginPct(50, 50)).toBe(0);
    expect(marginPct(40, 60)).toBeCloseTo(-50);
  });
  it("returns null when there is no usable price", () => {
    expect(marginPct(null, 10)).toBeNull();
    expect(marginPct(0, 10)).toBeNull();
    expect(marginPct(undefined, 10)).toBeNull();
  });
});

describe("money / pct", () => {
  it("formats and dashes out empties", () => {
    expect(money(1234.5)).toBe("$1,234.50");
    expect(money(null)).toBe("—");
    expect(pct(12.345)).toBe("12.3%");
    expect(pct(null)).toBe("—");
  });
});

describe("localDateStr", () => {
  it("formats in local time, zero-padded", () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDateStr(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
  it("returns empty for null", () => {
    expect(localDateStr(null)).toBe("");
  });
});

describe("daysSince", () => {
  it("floors whole days and handles null", () => {
    expect(daysSince(new Date(Date.now() - 3.7 * 86_400_000))).toBe(3);
    expect(daysSince(null)).toBeNull();
  });
});
