import { describe, expect, it } from "vitest";
import { basisNote, valueInventory, type Holding } from "@/lib/valuationMath";
import type { RecoveryStat } from "@/lib/bidMath";

const rates = { EBAY: 13.25, AMAZON: 15, FACEBOOK: 5, OTHER: 0 };
const noHistory = { byCategory: [] as RecoveryStat[], byBrand: [] as RecoveryStat[] };

const held = (o: Partial<Holding> = {}): Holding => ({
  category: "POWER_TOOLS", brand: null, status: "LISTED",
  ourCost: 30, sellPrice: 100, msrp: 200, platform: "EBAY", ...o,
});

// No sell-through or fee haircut, so the arithmetic is checkable by hand.
const plain = { sellThroughPct: 100 };
const noFees = { EBAY: 0, AMAZON: 0, FACEBOOK: 0, OTHER: 0 };

describe("valueInventory — what the shelves are worth", () => {
  it("totals the money tied up and the retail alongside it", () => {
    const v = valueInventory([held(), held()], noHistory, noFees, plain);
    expect(v.units).toBe(2);
    expect(v.costBasis).toBe(60);
    expect(v.retailValue).toBe(400);
    expect(v.askingValue).toBe(200);
  });

  it("falls back to the asking price when there is no history", () => {
    const v = valueInventory([held()], noHistory, noFees, plain);
    expect(v.expectedNet).toBe(100); // the asking price, not MSRP
    expect(v.expectedProfit).toBe(70); // 100 - 30 cost
    expect(v.basis).toBe("assumption");
    expect(v.confidencePct).toBe(0);
  });

  it("prefers our own recovery history once a category has enough sales", () => {
    const history = {
      byCategory: [{ key: "POWER_TOOLS", soldCount: 12, avgRecoveryPct: 40, avgDaysToSell: 20 }],
      byBrand: [] as RecoveryStat[],
    };
    const v = valueInventory([held()], history, noFees, plain);
    // 40% of a $200 MSRP = $80, NOT the $100 we happen to be asking.
    expect(v.expectedNet).toBe(80);
    expect(v.confidencePct).toBe(100);
  });

  it("ignores a category whose history is too thin to trust", () => {
    const thin = {
      byCategory: [{ key: "POWER_TOOLS", soldCount: 1, avgRecoveryPct: 90, avgDaysToSell: 5 }],
      byBrand: [] as RecoveryStat[],
    };
    const v = valueInventory([held()], thin, noFees, plain);
    expect(v.expectedNet).toBe(100); // asking price, not the 1-sale outlier
    expect(v.confidencePct).toBe(0);
  });

  it("prefers brand history over category history", () => {
    const history = {
      byCategory: [{ key: "POWER_TOOLS", soldCount: 20, avgRecoveryPct: 40, avgDaysToSell: 20 }],
      byBrand: [{ key: "Milwaukee", soldCount: 8, avgRecoveryPct: 60, avgDaysToSell: 10 }],
    };
    const v = valueInventory([held({ brand: "Milwaukee" })], history, noFees, plain);
    expect(v.expectedNet).toBe(120); // 60% of 200, the brand rate
  });

  it("applies sell-through and platform fees to reach a bankable number", () => {
    // 1 unit asking $100, 85% sell-through = $85 gross, less 13.25% eBay fees
    const v = valueInventory([held()], noHistory, rates, { sellThroughPct: 85 });
    expect(v.expectedRevenue).toBe(85);
    expect(v.expectedFees).toBeCloseTo(11.26, 2);
    expect(v.expectedNet).toBeCloseTo(73.74, 2);
    expect(v.expectedProfit).toBeCloseTo(43.74, 2);
  });

  it("reports return on the money tied up", () => {
    const v = valueInventory([held()], noHistory, noFees, plain);
    expect(v.expectedRoiPct).toBeCloseTo(233.3, 1); // 70 profit on 30 cost
  });

  it("values an item with neither price nor MSRP at cost, never at zero", () => {
    const v = valueInventory([held({ sellPrice: null, msrp: null })], noHistory, noFees, plain);
    expect(v.expectedNet).toBe(30);
    expect(v.expectedProfit).toBe(0);
  });

  it("is all zeros on an empty warehouse, not NaN", () => {
    const v = valueInventory([], noHistory, rates);
    expect(v.units).toBe(0);
    expect(v.costBasis).toBe(0);
    expect(v.expectedMarginPct).toBeNull();
    expect(v.expectedRoiPct).toBeNull();
    expect(v.confidencePct).toBe(0);
  });

  it("sums money in cents so a large warehouse cannot drift", () => {
    const many = Array.from({ length: 300 }, () => held({ ourCost: 0.1, sellPrice: 0.1, msrp: null }));
    const v = valueInventory(many, noHistory, noFees, plain);
    expect(v.costBasis).toBe(30);
    expect(v.expectedNet).toBe(30);
  });

  it("breaks the total down by category and by status", () => {
    const v = valueInventory(
      [held({ category: "POWER_TOOLS" }), held({ category: "HAND_TOOLS" }), held({ status: "IN_STOCK" })],
      noHistory, noFees, plain
    );
    expect(v.byCategory.map((c) => c.key).sort()).toEqual(["HAND_TOOLS", "POWER_TOOLS"]);
    expect(v.byStatus.find((s) => s.status === "IN_STOCK")?.units).toBe(1);
    // Category totals reconcile to the whole.
    expect(Math.round(v.byCategory.reduce((a, c) => a + c.expectedNet, 0) * 100) / 100).toBe(v.expectedNet);
  });
});

describe("basis — the figure must never look more certain than it is", () => {
  const history = (n: number) => ({
    byCategory: [{ key: "POWER_TOOLS", soldCount: n, avgRecoveryPct: 40, avgDaysToSell: 20 }],
    byBrand: [] as RecoveryStat[],
  });

  it("says 'assumption' when almost nothing is backed by sales", () => {
    const v = valueInventory([held(), held(), held(), held()], noHistory, rates);
    expect(v.basis).toBe("assumption");
    expect(basisNote(v)).toContain("no category has 3+ sales yet");
  });

  it("says 'history' only once the sample is big enough to mean something", () => {
    const v = valueInventory([held(), held()], history(50), rates);
    expect(v.basis).toBe("history");
    expect(v.salesBacking).toBe(50);
    expect(basisNote(v)).toContain("50 sales");
  });

  it("refuses to claim certainty from a handful of sales", () => {
    // The trap: 100% of units covered, but by only 3 sales. Reporting that as
    // "from your sales data" would dress a guess up as a measurement.
    const v = valueInventory([held(), held()], history(3), rates);
    expect(v.confidencePct).toBe(100);
    expect(v.salesBacking).toBe(3);
    expect(v.basis).not.toBe("history");
    expect(basisNote(v)).toContain("only 3 sales");
    expect(basisNote(v)).toContain("indicative");
  });

  it("says 'blended' when it is a mix, and says the figures will firm up", () => {
    // Half the units are in a category we have sold, half are not.
    const v = valueInventory(
      [held(), held(), held({ category: "APPLIANCES" }), held({ category: "APPLIANCES" })],
      history(50), rates
    );
    expect(v.basis).toBe("blended");
    expect(v.confidencePct).toBe(50);
    expect(basisNote(v)).toContain("firm up");
  });

  it("explains an empty warehouse rather than showing a bare zero", () => {
    expect(basisNote(valueInventory([], noHistory, rates))).toContain("No unsold stock");
  });

  it("labels a category as estimate when any part of it is guesswork", () => {
    // One unit priced, one with nothing to go on: the group is not "your sales".
    const v = valueInventory(
      [held(), held({ sellPrice: null, msrp: null })], history(50), rates
    );
    expect(v.byCategory[0].source).toBe("fallback");
  });
});
