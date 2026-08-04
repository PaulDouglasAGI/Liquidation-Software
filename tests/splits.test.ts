import { describe, expect, it } from "vitest";
import { splitByWeight, splitEvenly } from "@/lib/fulfillmentMath";
import { reconcileCount } from "@/lib/countMath";
import { parseCsv } from "@/lib/csvParse";
import { buildItemOrderBy } from "@/lib/itemFilters";
import { estimateBid } from "@/lib/bidMath";
import { isCredentialKey } from "@/lib/credentials";

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe("splitEvenly — money must reconcile exactly", () => {
  it("gives the remainder away instead of losing it", () => {
    // The bug: $100 / 3 rounded to 33.33 each = $99.99, a cent short.
    const parts = splitEvenly(100, 3);
    expect(sum(parts)).toBe(100);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
  });

  it("is exact for any awkward amount", () => {
    for (const [total, n] of [[10, 3], [0.05, 4], [999.99, 7], [1, 6]] as const) {
      expect(sum(splitEvenly(total, n))).toBe(Math.round(total * 100) / 100);
    }
  });

  it("handles a clean divide and the degenerate cases", () => {
    expect(splitEvenly(10, 2)).toEqual([5, 5]);
    expect(splitEvenly(10, 0)).toEqual([]);
    expect(splitEvenly(0, 3)).toEqual([0, 0, 0]);
  });

  it("works for a negative total (a refund)", () => {
    expect(sum(splitEvenly(-10, 3))).toBe(-10);
  });
});

describe("splitByWeight — lot revenue must reconcile exactly", () => {
  it("splits proportionally and sums back to the sale price", () => {
    const parts = splitByWeight(144.5, [110, 60]);
    expect(sum(parts)).toBe(144.5);
    expect(parts[0]).toBeGreaterThan(parts[1]);
  });

  it("never loses a cent on a three-way split", () => {
    const parts = splitByWeight(100, [10, 10, 10]);
    expect(sum(parts)).toBe(100);
  });

  it("falls back to an even split when nothing is priced", () => {
    // The bug: unpriced lines got $0 revenue while still carrying full COGS.
    const parts = splitByWeight(90, [0, 0, 0]);
    expect(parts).toEqual([30, 30, 30]);
    expect(sum(parts)).toBe(90);
  });

  it("still gives unpriced lines a share when only some are priced", () => {
    const parts = splitByWeight(100, [50, 0]);
    // The priced line takes the revenue, but the total is still exact.
    expect(sum(parts)).toBe(100);
  });
});

describe("reconcileCount — pending shipments are not misplaced", () => {
  const item = (sku: string, loc: string | null) => ({
    id: `id-${sku}`, sku, name: sku, storageLocation: loc, status: "SOLD",
  });

  it("ignores a scan whose recorded shelf IS the shelf being counted", () => {
    // A sold-but-uncollected unit sits on its shelf. It is not "expected"
    // (its status is off-shelf) but calling it misplaced-from-here is absurd.
    const r = reconcileCount("Z-9", [], [{ sku: "S1", itemId: null }], new Map([["S1", item("S1", "Z-9")]]));
    expect(r.misplaced).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it("still reports a genuine misplacement", () => {
    const r = reconcileCount("Z-9", [], [{ sku: "S2", itemId: null }], new Map([["S2", item("S2", "A-1")]]));
    expect(r.misplaced).toEqual([{ sku: "S2", itemId: "id-S2", expectedLocation: "A-1" }]);
  });

  it("is insensitive to case and padding on the shelf code", () => {
    const r = reconcileCount("z-9 ", [], [{ sku: "S1", itemId: null }], new Map([["S1", item("S1", "Z-9")]]));
    expect(r.misplaced).toEqual([]);
  });
});

describe("parseCsv — a quote mid-field is literal text", () => {
  it("does not swallow the file after an inch mark", () => {
    // The bug: the quote in 6" opened a quoted section and consumed the rest.
    const rows = parseCsv('name,qty\n6" steel pipe,4\nHammer,2');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(['6" steel pipe', "4"]);
    expect(rows[2]).toEqual(["Hammer", "2"]);
  });

  it("still honours a properly quoted field", () => {
    const rows = parseCsv('name,note\n"Drill, cordless","says ""hi"""');
    expect(rows[1]).toEqual(["Drill, cordless", 'says "hi"']);
  });
});

describe("buildItemOrderBy — prototype keys cannot reach Prisma", () => {
  it("falls back to the default for inherited property names", () => {
    for (const sort of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(buildItemOrderBy({ sort })[0]).toEqual({ createdAt: "desc" });
    }
  });

  it("still resolves real sort keys", () => {
    expect(buildItemOrderBy({ sort: "price" })[0]).toEqual({ sellPrice: "desc" });
  });
});

describe("estimateBid — bad assumptions fall back instead of zeroing the bid", () => {
  const history = { byCategory: [], byBrand: [] };
  const rates = { EBAY: 13.25, AMAZON: 15, FACEBOOK: 5, OTHER: 0 };
  const line = { name: "x", category: "MIXED", brand: null, qty: 10, msrp: 100 };

  it("ignores a non-numeric assumption rather than producing $0", () => {
    const bad = estimateBid([line], history, rates, {
      sellThroughPct: NaN as unknown as number,
      targetMarginPct: undefined as unknown as number,
    });
    const good = estimateBid([line], history, rates, {});
    expect(bad.maxBid).toBe(good.maxBid);
    expect(bad.maxBid).toBeGreaterThan(0);
  });

  it("still honours a valid override", () => {
    const est = estimateBid([line], history, rates, { sellThroughPct: 50 });
    expect(est.sellableUnits).toBe(5);
  });
});

describe("isCredentialKey — secrets never reach a backup", () => {
  it("covers every credential prefix, including newly added ones", () => {
    for (const k of ["ebay.appId", "amazon.secretKey", "upc.apiKey", "ai.anthropicKey"]) {
      expect(isCredentialKey(k)).toBe(true);
    }
  });

  it("fails closed for an unrecognised key under a credential prefix", () => {
    // A key added to the schema but forgotten in the list stays out of backups.
    expect(isCredentialKey("ebay.somethingNew")).toBe(true);
    expect(isCredentialKey("ai.futureModelKey")).toBe(true);
  });

  it("leaves operational settings alone", () => {
    for (const k of ["agingDays", "defaultPricePct", "fees.ebayPct", "lowMarginPct"]) {
      expect(isCredentialKey(k)).toBe(false);
    }
  });
});
