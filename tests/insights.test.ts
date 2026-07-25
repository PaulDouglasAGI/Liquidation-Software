import { describe, expect, it } from "vitest";
import {
  avg,
  monthlyTrend,
  repriceSuggestions,
  returnRate,
  velocity,
  velocityByBrand,
  velocityByCategory,
} from "@/lib/insightsMath";
import type { ListedRow, SoldRow } from "@/lib/insightsMath";

const rates = { EBAY: 13.25, AMAZON: 15, FACEBOOK: 5, OTHER: 0 };
const day = 86_400_000;

const sold = (o: Partial<SoldRow> = {}): SoldRow => ({
  category: "POWER_TOOLS",
  brand: "Dewalt",
  dateListed: new Date(2026, 5, 1),
  dateSold: new Date(2026, 5, 11), // 10 days later
  soldPrice: 200,
  msrp: 400,
  ourCost: 100,
  feesAndShip: 26.5,
  ...o,
});

const listed = (o: Partial<ListedRow> = {}): ListedRow => ({
  id: "i1",
  sku: "ITM-PAL001-001",
  name: "Dewalt Drill",
  dateListed: new Date(2026, 5, 1),
  sellPrice: 200,
  ourCost: 50,
  platform: "EBAY",
  ...o,
});

describe("avg", () => {
  it("averages, and is null on empty rather than NaN", () => {
    expect(avg([1, 2, 3])).toBe(2);
    expect(avg([])).toBeNull();
  });
});

describe("velocity", () => {
  it("computes days to sell, recovery %, and sale/cost multiple", () => {
    const v = velocity("All", [sold()]);
    expect(v.soldCount).toBe(1);
    expect(v.avgDaysToSell).toBe(10);
    expect(v.avgRecoveryPct).toBe(50); // 200 of a 400 MSRP
    expect(v.avgMultiple).toBe(2); // 200 sold on 100 cost
  });

  it("ignores items missing the dates/prices each metric needs", () => {
    const v = velocity("All", [
      sold(),
      sold({ dateListed: null }), // no listing date -> excluded from days
      sold({ msrp: null }), // no MSRP -> excluded from recovery
      sold({ ourCost: 0 }), // no cost -> excluded from multiple
    ]);
    expect(v.soldCount).toBe(4); // still counted as sales
    expect(v.avgDaysToSell).toBe(10);
    expect(v.avgRecoveryPct).toBe(50);
    expect(v.avgMultiple).toBe(2);
  });

  it("never reports negative days when dates are out of order", () => {
    const v = velocity("All", [
      sold({ dateListed: new Date(2026, 5, 11), dateSold: new Date(2026, 5, 1) }),
    ]);
    expect(v.avgDaysToSell).toBe(0);
  });

  it("nulls every metric when there is nothing to average", () => {
    expect(velocity("All", [])).toEqual({
      key: "All",
      soldCount: 0,
      avgDaysToSell: null,
      avgRecoveryPct: null,
      avgMultiple: null,
    });
  });
});

describe("velocityByCategory / velocityByBrand", () => {
  it("splits by category, busiest first", () => {
    const rows = velocityByCategory([
      sold({ category: "APPLIANCES" }),
      sold({ category: "POWER_TOOLS" }),
      sold({ category: "POWER_TOOLS" }),
    ]);
    expect(rows.map((r) => [r.key, r.soldCount])).toEqual([
      ["POWER_TOOLS", 2],
      ["APPLIANCES", 1],
    ]);
  });

  it("hides one-off brands as statistically meaningless", () => {
    const rows = velocityByBrand([
      sold({ brand: "Dewalt" }),
      sold({ brand: "Dewalt" }),
      sold({ brand: "Ryobi" }), // single sale -> below the 2-sale floor
    ]);
    expect(rows.map((r) => r.key)).toEqual(["Dewalt"]);
  });

  it("skips items with no brand at all", () => {
    expect(velocityByBrand([sold({ brand: null }), sold({ brand: null })])).toEqual([]);
  });

  it("caps the brand table", () => {
    const rows = Array.from({ length: 30 }, (_, n) => [
      sold({ brand: `B${n}` }),
      sold({ brand: `B${n}` }),
    ]).flat();
    expect(velocityByBrand(rows)).toHaveLength(10);
  });
});

describe("monthlyTrend", () => {
  const now = new Date(2026, 6, 15); // July 2026

  it("returns six months ending with the current one", () => {
    const m = monthlyTrend([], now);
    expect(m).toHaveLength(6);
    expect(m[0].month).toBe("Feb 26");
    expect(m[5].month).toBe("Jul 26");
  });

  it("counts a sale into its own month and nets fees out of profit", () => {
    const m = monthlyTrend([sold({ dateSold: new Date(2026, 6, 10) })], now);
    const july = m[5];
    expect(july.itemsSold).toBe(1);
    expect(july.revenue).toBe(200);
    expect(july.cogs).toBe(126.5); // 100 cost + 26.50 fees/shipping
    expect(july.profit).toBe(73.5);
  });

  it("excludes sales outside the window", () => {
    const m = monthlyTrend([sold({ dateSold: new Date(2025, 0, 1) })], now);
    expect(m.reduce((a, r) => a + r.itemsSold, 0)).toBe(0);
  });

  it("puts a month-boundary sale in the right bucket", () => {
    // 23:59 on Jun 30 belongs to June, not July
    const m = monthlyTrend([sold({ dateSold: new Date(2026, 5, 30, 23, 59) })], now);
    expect(m[4].month).toBe("Jun 26");
    expect(m[4].itemsSold).toBe(1);
    expect(m[5].itemsSold).toBe(0);
  });
});

describe("repriceSuggestions", () => {
  const now = new Date(2026, 6, 15);
  const listedDaysAgo = (d: number) => new Date(now.getTime() - d * day);

  it("leaves fresh stock alone", () => {
    const out = repriceSuggestions([listed({ dateListed: listedDaysAgo(10) })], 30, rates, now);
    expect(out).toEqual([]);
  });

  it("cuts 10% once past the aging threshold", () => {
    const [s] = repriceSuggestions([listed({ dateListed: listedDaysAgo(35) })], 30, rates, now);
    expect(s.cutPct).toBe(10);
    expect(s.currentPrice).toBe(200);
    expect(s.suggestedPrice).toBe(180);
    expect(s.daysListed).toBe(35);
  });

  it("cuts 20% past twice the threshold", () => {
    const [s] = repriceSuggestions([listed({ dateListed: listedDaysAgo(70) })], 30, rates, now);
    expect(s.cutPct).toBe(20);
    expect(s.suggestedPrice).toBe(160);
  });

  it("never suggests a price below the fee-aware cost floor", () => {
    // cost 100 on eBay needs ~115.27 to break even after the 13.25% cut
    const [s] = repriceSuggestions(
      [listed({ dateListed: listedDaysAgo(70), sellPrice: 120, ourCost: 100 })],
      30,
      rates,
      now
    );
    expect(s.suggestedPrice).toBe(s.costFloor);
    expect(s.suggestedPrice).toBeCloseTo(115.27, 2);
    // selling at the floor still returns the cost after fees
    expect(s.suggestedPrice * (1 - 0.1325)).toBeGreaterThanOrEqual(100 - 0.01);
  });

  it("drops items already at or under their floor instead of suggesting a raise", () => {
    const out = repriceSuggestions(
      [listed({ dateListed: listedDaysAgo(70), sellPrice: 110, ourCost: 100 })],
      30,
      rates,
      now
    );
    expect(out).toEqual([]);
  });

  it("uses the item's own platform fee rate for the floor", () => {
    const [amz] = repriceSuggestions(
      [listed({ dateListed: listedDaysAgo(70), sellPrice: 500, ourCost: 100, platform: "AMAZON" })],
      30,
      rates,
      now
    );
    expect(amz.costFloor).toBeCloseTo(117.65, 2); // 100 / (1 - 0.15)
  });

  it("assumes eBay when a listing has no platform set", () => {
    const [s] = repriceSuggestions(
      [listed({ dateListed: listedDaysAgo(70), sellPrice: 500, ourCost: 100, platform: null })],
      30,
      rates,
      now
    );
    expect(s.costFloor).toBeCloseTo(115.27, 2);
  });

  it("skips listings with no date or no price", () => {
    const out = repriceSuggestions(
      [
        listed({ id: "a", dateListed: null }),
        listed({ id: "b", dateListed: listedDaysAgo(70), sellPrice: null }),
      ],
      30,
      rates,
      now
    );
    expect(out).toEqual([]);
  });

  it("lists the stalest stock first", () => {
    const out = repriceSuggestions(
      [
        listed({ id: "a", dateListed: listedDaysAgo(40) }),
        listed({ id: "b", dateListed: listedDaysAgo(90) }),
        listed({ id: "c", dateListed: listedDaysAgo(60) }),
      ],
      30,
      rates,
      now
    );
    expect(out.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("treats the threshold day itself as aging", () => {
    const out = repriceSuggestions([listed({ dateListed: listedDaysAgo(30) })], 30, rates, now);
    expect(out).toHaveLength(1);
    expect(out[0].cutPct).toBe(10);
  });
});

describe("returnRate", () => {
  it("is the share of closed outcomes that came back", () => {
    expect(returnRate(9, 1)).toBe(10);
    expect(returnRate(0, 5)).toBe(100);
    expect(returnRate(5, 0)).toBe(0);
  });

  it("is null before anything has closed, rather than 0/0", () => {
    expect(returnRate(0, 0)).toBeNull();
  });
});
