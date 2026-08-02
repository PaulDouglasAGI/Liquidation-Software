import { describe, expect, it } from "vitest";
import { DEFAULT_ASSUMPTIONS, estimateBid, profitAtBid } from "@/lib/bidMath";
import type { ManifestLine, RecoveryStat } from "@/lib/bidMath";

const rates = { EBAY: 13.25, AMAZON: 15, FACEBOOK: 5, OTHER: 0 };

const history = {
  byCategory: [
    { key: "POWER_TOOLS", soldCount: 40, avgRecoveryPct: 40, avgDaysToSell: 20 },
    { key: "APPLIANCES", soldCount: 10, avgRecoveryPct: 25, avgDaysToSell: 90 },
  ] as RecoveryStat[],
  byBrand: [{ key: "Dewalt", soldCount: 12, avgRecoveryPct: 55, avgDaysToSell: 10 }] as RecoveryStat[],
};

const line = (o: Partial<ManifestLine> = {}): ManifestLine => ({
  name: "Drill", category: "POWER_TOOLS", brand: null, qty: 10, msrp: 100, ...o,
});

// No sell-through/fee/shipping haircut, so the arithmetic is checkable by hand.
const plain = { sellThroughPct: 100, targetMarginPct: 0, shippingPerUnit: 0, platform: "OTHER" };

describe("estimateBid — recovery lookup", () => {
  it("uses our own category history", () => {
    const est = estimateBid([line()], history, rates, plain);
    expect(est.lines[0].recoveryPct).toBe(40);
    expect(est.lines[0].recoverySource).toBe("category");
    expect(est.lines[0].grossValue).toBe(400); // 10 x 100 x 40%
  });

  it("prefers brand history over category when it exists", () => {
    const est = estimateBid([line({ brand: "Dewalt" })], history, rates, plain);
    expect(est.lines[0].recoverySource).toBe("brand");
    expect(est.lines[0].recoveryPct).toBe(55);
  });

  it("falls back for categories we have never sold", () => {
    const est = estimateBid([line({ category: "UNSEEN" })], history, rates, {
      ...plain, fallbackRecoveryPct: 30,
    });
    expect(est.lines[0].recoverySource).toBe("fallback");
    expect(est.lines[0].recoveryPct).toBe(30);
  });

  it("ignores a brand with too few sales to be meaningful", () => {
    const thin = { ...history, byBrand: [{ key: "Ryobi", soldCount: 1, avgRecoveryPct: 90, avgDaysToSell: 5 }] };
    const est = estimateBid([line({ brand: "Ryobi" })], thin, rates, plain);
    expect(est.lines[0].recoverySource).toBe("category"); // not the 90% outlier
  });
});

describe("estimateBid — the money chain", () => {
  it("applies sell-through, fees, and the target margin in order", () => {
    // 10 units x $100 MSRP x 40% recovery = $400 gross
    // x 80% sell-through = $320 revenue
    // - 13.25% eBay fees ($42.40) = $277.60 net
    // - 35% target margin on revenue ($112) = $165.60 max bid
    const est = estimateBid([line()], history, rates, {
      sellThroughPct: 80, targetMarginPct: 35, shippingPerUnit: 0, platform: "EBAY",
    });
    expect(est.expectedRevenue).toBe(320);
    expect(est.expectedFees).toBe(42.4);
    expect(est.netBeforeCost).toBe(277.6);
    expect(est.maxBid).toBe(165.6);
  });

  it("subtracts postage per sellable unit", () => {
    const est = estimateBid([line()], history, rates, {
      sellThroughPct: 100, targetMarginPct: 0, shippingPerUnit: 5, platform: "OTHER",
    });
    expect(est.sellableUnits).toBe(10);
    expect(est.expectedShipping).toBe(50);
    expect(est.netBeforeCost).toBe(350); // 400 - 0 fees - 50 postage
  });

  it("never suggests a negative bid on a worthless manifest", () => {
    const est = estimateBid([line({ msrp: 1 })], history, rates, {
      sellThroughPct: 100, targetMarginPct: 90, shippingPerUnit: 100, platform: "EBAY",
    });
    expect(est.maxBid).toBe(0);
  });

  it("reports retail value alongside realistic value", () => {
    const est = estimateBid([line()], history, rates, plain);
    expect(est.totalMsrp).toBe(1000); // the number on the manifest
    expect(est.expectedRevenue).toBe(400); // what it is worth to us
  });

  it("handles an empty manifest without dividing by zero", () => {
    const est = estimateBid([], history, rates, plain);
    expect(est.totalUnits).toBe(0);
    expect(est.maxBid).toBe(0);
    expect(est.estimatedDaysToSell).toBeNull();
    expect(est.confidencePct).toBe(0);
    expect(est.warnings.join(" ")).toContain("no units");
  });

  it("contributes nothing for lines with no MSRP, and says so", () => {
    const est = estimateBid([line({ msrp: null })], history, rates, plain);
    expect(est.expectedRevenue).toBe(0);
    expect(est.warnings.join(" ")).toContain("no MSRP");
  });
});

describe("estimateBid — confidence and time", () => {
  it("weights days-to-sell by unit count, not line count", () => {
    // 90 fast units vs 10 slow ones should look fast overall
    const est = estimateBid(
      [line({ qty: 90 }), line({ qty: 10, category: "APPLIANCES" })],
      history, rates, plain
    );
    expect(est.estimatedDaysToSell).toBeCloseTo(27, 0); // (90*20 + 10*90)/100
  });

  it("confidence is the share of units backed by real history", () => {
    const est = estimateBid([line({ qty: 75 }), line({ qty: 25, category: "UNSEEN" })], history, rates, plain);
    expect(est.confidencePct).toBe(75);
  });

  it("warns loudly when most of the manifest is guesswork", () => {
    const est = estimateBid([line({ category: "UNSEEN" })], history, rates, plain);
    expect(est.confidencePct).toBe(0);
    expect(est.warnings.join(" ")).toContain("fallback");
  });

  it("warns when the money would be tied up for months", () => {
    const est = estimateBid([line({ category: "APPLIANCES" })], history, rates, plain);
    expect(est.warnings.join(" ")).toContain("days to sell");
  });
});

describe("profitAtBid", () => {
  it("reports profit, margin, and ROI for an actual bid", () => {
    const est = estimateBid([line()], history, rates, plain); // net 400
    const p = profitAtBid(est, 100);
    expect(p.profit).toBe(300);
    expect(p.marginPct).toBe(75);
    expect(p.roiPct).toBe(300);
  });

  it("goes negative when you overpay", () => {
    const est = estimateBid([line()], history, rates, plain);
    expect(profitAtBid(est, 500).profit).toBe(-100);
  });

  it("no ROI on a free pallet rather than dividing by zero", () => {
    const est = estimateBid([line()], history, rates, plain);
    expect(profitAtBid(est, 0).roiPct).toBeNull();
  });
});

describe("DEFAULT_ASSUMPTIONS", () => {
  it("are conservative enough to be a safe starting point", () => {
    expect(DEFAULT_ASSUMPTIONS.sellThroughPct).toBeLessThanOrEqual(90);
    expect(DEFAULT_ASSUMPTIONS.targetMarginPct).toBeGreaterThanOrEqual(25);
  });
});
