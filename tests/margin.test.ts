import { describe, expect, it } from "vitest";
import { parseMoney } from "@/lib/parse";
import { marginLabel, marginPct } from "@/lib/format";

/**
 * The client previews and the server MUST read a typed price identically.
 * They did not: previews used parseFloat, the API used parseMoney, and they
 * disagreed on exactly the things people type into a price box.
 */
describe("money typed into a price box", () => {
  const typed = (s: string) => ({ preview: parseMoney(s), saved: parseMoney(s) });

  it("reads a comma-grouped price as the number it looks like", () => {
    // parseFloat("1,299.00") is 1. The preview showed a catastrophic loss
    // while the server correctly saved $1,299.
    expect(parseFloat("1,299.00")).toBe(1); // the old behaviour, for the record
    expect(parseMoney("1,299.00")).toBe(1299);
    const { preview, saved } = typed("1,299.00");
    expect(preview).toBe(saved);
  });

  it("accepts a leading currency symbol instead of giving up", () => {
    expect(Number.isNaN(parseFloat("$8.99"))).toBe(true); // margin used to blank
    expect(parseMoney("$8.99")).toBe(8.99);
  });

  it("rounds sub-cent input the way the column will store it", () => {
    expect(parseMoney("10.005")).toBe(10.01);
    expect(parseMoney("0.004")).toBe(0);
  });

  it("still rejects things that are not numbers", () => {
    for (const s of ["abc", "", "   ", "1O.99"]) expect(parseMoney(s)).toBeNull();
  });

  it("still rejects negative money", () => {
    expect(parseMoney("-5")).toBeNull();
  });
});

describe("marginPct — arithmetic stays exact", () => {
  it("is a share of the sale price, not of cost", () => {
    expect(marginPct(10, 4)).toBeCloseTo(60, 6);
    expect(marginPct(8.99, 3)).toBeCloseTo(66.63, 2);
  });

  it("goes negative below cost", () => {
    expect(marginPct(5, 10)).toBeCloseTo(-100, 6);
  });

  it("has no answer for a zero or missing price", () => {
    expect(marginPct(0, 5)).toBeNull();
    expect(marginPct(null, 5)).toBeNull();
  });
});

describe("marginLabel — small prices must stay readable", () => {
  it("prints ordinary margins normally", () => {
    expect(marginLabel(66.63)).toBe("66.6%");
    expect(marginLabel(-100)).toBe("-100.0%");
    expect(marginLabel(0)).toBe("0.0%");
  });

  it("stops printing five-digit percentages", () => {
    // A $0.99 unit carrying $153.13 of allocated pallet cost is a correct
    // -15,368%. The number told nobody anything the dollar figure beside it
    // did not, and made every cheap item look broken.
    const runaway = marginPct(0.99, 153.13)!;
    expect(Math.round(runaway)).toBe(-15368);
    expect(marginLabel(runaway)).toBe("way below cost");
  });

  it("keeps the boundary tight so real numbers are not swallowed", () => {
    expect(marginLabel(-999)).toBe("-999.0%");
    expect(marginLabel(-999.5)).toBe("way below cost");
    expect(marginLabel(999)).toBe("999.0%");
    expect(marginLabel(1000)).toBe(">999%");
  });

  it("honours the caller's precision", () => {
    expect(marginLabel(66.63, 0)).toBe("67%");
  });

  it("has something to say about nothing", () => {
    expect(marginLabel(null)).toBe("—");
    expect(marginLabel(NaN)).toBe("—");
    expect(marginLabel(Infinity)).toBe("—");
  });
});
