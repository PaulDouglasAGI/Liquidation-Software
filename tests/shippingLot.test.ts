import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHIPPING_RATES,
  billableWeight,
  dimensionalWeight,
  estimateShipping,
  marginAfterShipping,
} from "@/lib/shippingMath";
import {
  bundleDiscountPct,
  groupByCategory,
  lotTitle,
  priceLot,
  rankBundleCandidates,
} from "@/lib/lotMath";
import type { LotCandidate } from "@/lib/lotMath";

describe("dimensional weight", () => {
  it("is volume over the carrier divisor", () => {
    // 12x12x12 = 1728 / 139 = 12.43 lb
    expect(dimensionalWeight({ weightLbs: 5, lengthIn: 12, widthIn: 12, heightIn: 12 })).toBeCloseTo(12.43, 2);
  });

  it("is null when any dimension is missing", () => {
    expect(dimensionalWeight({ weightLbs: 5, lengthIn: 12, widthIn: null, heightIn: 12 })).toBeNull();
  });
});

describe("billableWeight — carriers bill the greater of the two", () => {
  it("uses dim weight for a light bulky box", () => {
    expect(billableWeight({ weightLbs: 3, lengthIn: 20, widthIn: 20, heightIn: 20 })).toBeCloseTo(57.55, 2);
  });

  it("uses actual weight for a small heavy box", () => {
    expect(billableWeight({ weightLbs: 40, lengthIn: 6, widthIn: 6, heightIn: 6 })).toBe(40);
  });

  it("falls back to weight alone when dimensions are unknown", () => {
    expect(billableWeight({ weightLbs: 10, lengthIn: null, widthIn: null, heightIn: null })).toBe(10);
  });

  it("is null when we know nothing at all", () => {
    expect(billableWeight({ weightLbs: null, lengthIn: null, widthIn: null, heightIn: null })).toBeNull();
  });
});

describe("estimateShipping", () => {
  it("charges base plus per-pound above the first", () => {
    const e = estimateShipping({ weightLbs: 11, lengthIn: null, widthIn: null, heightIn: null });
    expect(e.cost).toBe(17); // 8.50 + 10 x 0.85
    expect(e.oversize).toBe(false);
  });

  it("adds the oversize surcharge past the threshold", () => {
    const e = estimateShipping({ weightLbs: 60, lengthIn: null, widthIn: null, heightIn: null });
    expect(e.oversize).toBe(true);
    expect(e.cost).toBe(8.5 + 59 * 0.85 + 25);
  });

  it("flags an estimate made without dimensions as approximate", () => {
    const e = estimateShipping({ weightLbs: 5, lengthIn: null, widthIn: null, heightIn: null });
    expect(e.approximate).toBe(true);
  });

  it("is not approximate once dimensions are known", () => {
    expect(estimateShipping({ weightLbs: 5, lengthIn: 10, widthIn: 10, heightIn: 10 }).approximate).toBe(false);
  });

  it("returns null cost rather than guessing with no data", () => {
    const e = estimateShipping({ weightLbs: null, lengthIn: null, widthIn: null, heightIn: null });
    expect(e.cost).toBeNull();
  });

  it("has sane defaults", () => {
    expect(DEFAULT_SHIPPING_RATES.baseFee).toBeGreaterThan(0);
  });
});

describe("marginAfterShipping — the number that decides if a listing is worth it", () => {
  it("subtracts cost, fees, and postage", () => {
    const m = marginAfterShipping(100, 40, 13.25, 12);
    expect(m.net).toBe(34.75);
    expect(m.marginPct).toBe(34.8);
  });

  it("can reveal a listing that only looked profitable", () => {
    const m = marginAfterShipping(30, 15, 13.25, 14);
    expect(m.net!).toBeLessThan(0);
  });

  it("is null with no price", () => {
    expect(marginAfterShipping(null, 10, 13, 5).net).toBeNull();
  });
});

// ---------------------------------------------------------------- lots -----

const cand = (o: Partial<LotCandidate> = {}): LotCandidate => ({
  id: "i1", sku: "S1", name: "Drill", ourCost: 10, sellPrice: 40,
  daysListed: 90, category: "POWER_TOOLS", ...o,
});

describe("bundleDiscountPct", () => {
  it("deepens with lot size — volume is worth paying for", () => {
    expect(bundleDiscountPct(3)).toBe(15);
    expect(bundleDiscountPct(5)).toBe(25);
    expect(bundleDiscountPct(10)).toBe(35);
    expect(bundleDiscountPct(25)).toBe(45);
  });
});

describe("priceLot", () => {
  it("discounts the summed asking prices", () => {
    const items = Array.from({ length: 5 }, (_, n) => cand({ id: `i${n}`, sku: `S${n}` }));
    const p = priceLot(items, 0);
    expect(p.totalIndividualPrice).toBe(200);
    expect(p.discountPct).toBe(25);
    expect(p.suggestedPrice).toBe(150);
    expect(p.belowCost).toBe(false);
  });

  it("never prices below the fee-aware cost floor", () => {
    // 5 items costing 35 each = 175 cost; 25% off 200 = 150, under the floor
    const items = Array.from({ length: 5 }, (_, n) => cand({ id: `i${n}`, sku: `S${n}`, ourCost: 35 }));
    const p = priceLot(items, 13.25);
    expect(p.belowCost).toBe(true);
    expect(p.suggestedPrice).toBeGreaterThan(175);
    // selling at the floor still returns the goods cost after fees
    expect(p.suggestedPrice * (1 - 0.1325)).toBeGreaterThanOrEqual(175 - 0.01);
  });

  it("reports profit net of fees at the suggested price", () => {
    const items = Array.from({ length: 5 }, (_, n) => cand({ id: `i${n}`, sku: `S${n}` }));
    const p = priceLot(items, 10); // price 150, cost 50, fees 15
    expect(p.netAtSuggested).toBe(85);
  });

  it("honours an explicit discount over the automatic one", () => {
    const items = Array.from({ length: 5 }, (_, n) => cand({ id: `i${n}`, sku: `S${n}` }));
    expect(priceLot(items, 0, 50).suggestedPrice).toBe(100);
  });

  it("handles an empty selection without NaN", () => {
    const p = priceLot([], 13.25);
    expect(p.itemCount).toBe(0);
    expect(p.suggestedPrice).toBe(0);
    expect(p.totalCost).toBe(0);
  });

  it("sums money in cents so long lots do not drift", () => {
    const items = Array.from({ length: 10 }, (_, n) => cand({ id: `i${n}`, sku: `S${n}`, ourCost: 0.1, sellPrice: 0.1 }));
    expect(priceLot(items, 0).totalCost).toBe(1);
  });
});

describe("rankBundleCandidates", () => {
  it("only offers genuinely stale stock", () => {
    const out = rankBundleCandidates([cand({ sku: "old", daysListed: 90 }), cand({ sku: "fresh", daysListed: 10 })]);
    expect(out.map((i) => i.sku)).toEqual(["old"]);
  });

  it("stalest first", () => {
    const out = rankBundleCandidates([
      cand({ sku: "a", daysListed: 70 }),
      cand({ sku: "b", daysListed: 200 }),
    ]);
    expect(out.map((i) => i.sku)).toEqual(["b", "a"]);
  });

  it("respects a custom staleness threshold", () => {
    expect(rankBundleCandidates([cand({ daysListed: 30 })], 20)).toHaveLength(1);
  });

  it("treats unknown age as fresh rather than bundling it by accident", () => {
    expect(rankBundleCandidates([cand({ daysListed: null })])).toEqual([]);
  });
});

describe("groupByCategory / lotTitle", () => {
  it("keeps a lot coherent to a buyer", () => {
    const g = groupByCategory([cand({ category: "POWER_TOOLS" }), cand({ category: "HARDWARE" }), cand({ category: "POWER_TOOLS" })]);
    expect(g.get("POWER_TOOLS")).toHaveLength(2);
    expect(g.get("HARDWARE")).toHaveLength(1);
  });

  it("writes a sensible title", () => {
    expect(lotTitle("Power Tools", 12)).toBe("Power Tools Lot — 12 items");
    expect(lotTitle("Hardware", 1)).toBe("Hardware Lot — 1 item");
  });
});
