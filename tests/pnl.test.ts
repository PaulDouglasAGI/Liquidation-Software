import { describe, expect, it } from "vitest";
import { aggregatePnl, bucketKey, localDate, parseRange } from "@/lib/pnlMath";
import type { PnlExpenseRow, PnlSoldRow } from "@/lib/pnlMath";

const sale = (o: Partial<PnlSoldRow> = {}): PnlSoldRow => ({
  soldPrice: 100,
  ourCost: 40,
  feesAmount: 13.25,
  shippingCost: 6,
  dateSold: new Date(2026, 6, 20, 14, 0, 0),
  category: "POWER_TOOLS",
  platform: "EBAY",
  palletCode: "PAL-2026-001",
  ...o,
});

const expense = (o: Partial<PnlExpenseRow> = {}): PnlExpenseRow => ({
  id: "e1",
  date: new Date(2026, 6, 15),
  category: "FUEL",
  description: "Truck fuel",
  amount: 50,
  ...o,
});

describe("aggregatePnl — the money math", () => {
  it("nets revenue against cost, fees, and shipping", () => {
    const r = aggregatePnl([sale()], [], "pallet");
    expect(r.totals.revenue).toBe(100);
    expect(r.totals.cogs).toBe(40);
    expect(r.totals.fees).toBe(13.25);
    expect(r.totals.shipping).toBe(6);
    expect(r.totals.netProfit).toBe(40.75); // 100 - 40 - 13.25 - 6
    expect(r.totals.netMarginPct).toBeCloseTo(40.75, 10);
  });

  it("reproduces the verified end-to-end case (200 - 120 - 26.50 = 53.50)", () => {
    const r = aggregatePnl(
      [sale({ soldPrice: 200, ourCost: 120, feesAmount: 26.5, shippingCost: null })],
      [],
      "pallet"
    );
    expect(r.totals.netProfit).toBe(53.5);
    expect(r.totals.netMarginPct).toBeCloseTo(26.75, 2);
    expect(r.groups[0].key).toBe("PAL-2026-001");
  });

  it("treats missing fees/shipping/price as zero rather than NaN", () => {
    const r = aggregatePnl(
      [sale({ soldPrice: null, feesAmount: null, shippingCost: null, ourCost: 10 })],
      [],
      "pallet"
    );
    expect(r.totals.revenue).toBe(0);
    expect(r.totals.netProfit).toBe(-10); // cost with nothing recovered
    expect(r.totals.netMarginPct).toBeNull(); // no revenue -> margin undefined
  });

  it("subtracts operating expenses to reach the bottom line", () => {
    const r = aggregatePnl([sale()], [expense({ amount: 50 })], "pallet");
    expect(r.totals.netProfit).toBe(40.75);
    expect(r.expenseTotal).toBe(50);
    expect(r.net).toBe(-9.25); // 40.75 - 50, a losing month
  });

  it("sums many expenses without float drift", () => {
    const rows = Array.from({ length: 10 }, (_, n) => expense({ id: `e${n}`, amount: 0.1 }));
    expect(aggregatePnl([], rows, "pallet").expenseTotal).toBe(1);
  });

  it("sums repeated cent-level sales exactly (no 0.1+0.2 drift)", () => {
    const rows = Array.from({ length: 3 }, () =>
      sale({ soldPrice: 0.1, ourCost: 0, feesAmount: 0, shippingCost: 0 })
    );
    expect(aggregatePnl(rows, [], "pallet").totals.revenue).toBe(0.3);
  });

  it("empty input yields zeroed totals, not NaN", () => {
    const r = aggregatePnl([], [], "pallet");
    expect(r.totals).toMatchObject({ count: 0, revenue: 0, netProfit: 0, netMarginPct: null });
    expect(r.net).toBe(0);
    expect(r.groups).toEqual([]);
  });

  it("group totals sum back to the overall total", () => {
    const r = aggregatePnl(
      [
        sale({ palletCode: "PAL-2026-001", soldPrice: 100, ourCost: 40 }),
        sale({ palletCode: "PAL-2026-002", soldPrice: 250, ourCost: 90 }),
        sale({ palletCode: "PAL-2026-002", soldPrice: 50, ourCost: 10 }),
      ],
      [],
      "pallet"
    );
    expect(r.groups).toHaveLength(2);
    const summed = r.groups.reduce((a, g) => a + g.netProfit, 0);
    expect(summed).toBeCloseTo(r.totals.netProfit, 10);
    expect(r.totals.count).toBe(3);
  });

  it("sorts money groupings by revenue, biggest first", () => {
    const r = aggregatePnl(
      [
        sale({ palletCode: "SMALL", soldPrice: 10 }),
        sale({ palletCode: "BIG", soldPrice: 900 }),
      ],
      [],
      "pallet"
    );
    expect(r.groups.map((g) => g.key)).toEqual(["BIG", "SMALL"]);
  });

  it("sorts time groupings chronologically, not by size", () => {
    const r = aggregatePnl(
      [
        sale({ dateSold: new Date(2026, 6, 20), soldPrice: 10 }),
        sale({ dateSold: new Date(2026, 5, 20), soldPrice: 900 }),
      ],
      [],
      "month"
    );
    expect(r.groups.map((g) => g.key)).toEqual(["2026-06", "2026-07"]);
  });
});

describe("bucketKey", () => {
  const s = sale();
  it("groups by pallet, category, and platform", () => {
    expect(bucketKey("pallet", s)).toBe("PAL-2026-001");
    expect(bucketKey("category", s)).toBe("Power Tools");
    expect(bucketKey("platform", s)).toBe("eBay");
  });

  it("labels missing platform rather than dropping the sale", () => {
    expect(bucketKey("platform", sale({ platform: null }))).toBe("Unassigned");
  });

  it("buckets by local day/month, not UTC", () => {
    // 8pm local on the 20th must not roll into the 21st
    const late = sale({ dateSold: new Date(2026, 6, 20, 20, 0, 0) });
    expect(bucketKey("day", late)).toBe("2026-07-20");
    expect(bucketKey("month", late)).toBe("2026-07");
  });

  it("weeks start on Monday, including for Sunday sales", () => {
    // 2026-07-20 is a Monday; 2026-07-26 the Sunday that ends that week
    expect(bucketKey("week", sale({ dateSold: new Date(2026, 6, 20) }))).toBe("Week of 2026-07-20");
    expect(bucketKey("week", sale({ dateSold: new Date(2026, 6, 26) }))).toBe("Week of 2026-07-20");
    expect(bucketKey("week", sale({ dateSold: new Date(2026, 6, 27) }))).toBe("Week of 2026-07-27");
  });

  it("falls back to the reference date when a sale has no date", () => {
    const now = new Date(2026, 0, 5);
    expect(bucketKey("day", sale({ dateSold: null }), now)).toBe("2026-01-05");
  });
});

describe("localDate", () => {
  it("zero-pads month and day", () => {
    expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("parseRange", () => {
  it("covers the whole end day so same-day sales are included", () => {
    const { from, to } = parseRange("2026-07-01", "2026-07-31");
    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(from.getDate()).toBe(1);
    expect(to.getDate()).toBe(31);
  });

  it("defaults to the last 30 days starting at midnight", () => {
    const { from, to } = parseRange();
    expect(from.getHours()).toBe(0);
    expect(to.getTime() - from.getTime()).toBeGreaterThan(29 * 86_400_000);
  });
});
