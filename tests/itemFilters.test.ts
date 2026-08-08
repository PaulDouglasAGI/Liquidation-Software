import { describe, expect, it } from "vitest";
import { buildItemOrderBy, buildItemWhere } from "@/lib/itemFilters";

const now = new Date(2026, 6, 15);

describe("buildItemWhere", () => {
  it("no params means no filtering", () => {
    expect(buildItemWhere({}, 30, now)).toEqual({});
  });

  it("searches across the fields a warehouse actually types", () => {
    const w = buildItemWhere({ q: "dewalt" }, 30, now);
    const or = (w.AND as Record<string, unknown>[])[0].OR as Record<string, unknown>[];
    expect(or).toHaveLength(5);
    expect(JSON.stringify(or)).toContain("name");
    expect(JSON.stringify(or)).toContain("sku");
    expect(JSON.stringify(or)).toContain("upc");
    expect(JSON.stringify(or)).toContain("brand");
    expect(JSON.stringify(or)).toContain("storageLocation");
  });

  it("ignores a whitespace-only search", () => {
    expect(buildItemWhere({ q: "   " }, 30, now)).toEqual({});
  });

  it("accepts valid enum values and drops junk ones", () => {
    expect(buildItemWhere({ status: "LISTED" }, 30, now).status).toBe("LISTED");
    expect(buildItemWhere({ status: "DROP TABLE" }, 30, now).status).toBeUndefined();
    expect(buildItemWhere({ category: "POWER_TOOLS" }, 30, now).category).toBe("POWER_TOOLS");
    expect(buildItemWhere({ category: "bogus" }, 30, now).category).toBeUndefined();
    expect(buildItemWhere({ platform: "EBAY" }, 30, now).platform).toBe("EBAY");
    expect(buildItemWhere({ platform: "MYSPACE" }, 30, now).platform).toBeUndefined();
  });

  it("takes the first value when a param repeats", () => {
    expect(buildItemWhere({ status: ["LISTED", "SOLD"] }, 30, now).status).toBe("LISTED");
  });

  it("covers the whole end day in a date range", () => {
    const w = buildItemWhere({ dateFrom: "2026-07-01", dateTo: "2026-07-31" }, 30, now);
    const range = w.createdAt as { gte: Date; lte: Date };
    expect(range.gte.getDate()).toBe(1);
    expect(range.lte.getDate()).toBe(31);
    expect(range.lte.getHours()).toBe(23);
  });

  it("supports an open-ended price bound", () => {
    expect(buildItemWhere({ priceMin: "10" }, 30, now).sellPrice).toEqual({ gte: 10 });
    expect(buildItemWhere({ priceMax: "99.5" }, 30, now).sellPrice).toEqual({ lte: 99.5 });
    expect(buildItemWhere({ priceMin: "10", priceMax: "20" }, 30, now).sellPrice).toEqual({ gte: 10, lte: 20 });
  });

  it("ignores non-numeric price input", () => {
    expect(buildItemWhere({ priceMin: "abc" }, 30, now).sellPrice).toBeUndefined();
  });

  const agingArms = (agingDays: number) => {
    const w = buildItemWhere({ aging: "1" }, agingDays, now);
    const clause = (w.AND as Record<string, unknown>[])[0] as {
      OR: Record<string, unknown>[];
    };
    return clause.OR;
  };

  it("aging covers listed stock older than the threshold", () => {
    const listedArm = agingArms(30)[0] as { status: string; dateListed: { lte: Date } };
    expect(listedArm.status).toBe("LISTED");
    expect(listedArm.dateListed.lte.getTime()).toBe(now.getTime() - 30 * 86_400_000);
  });

  it("aging also covers stock that was never listed at all", () => {
    // The worst dead stock is the unit nobody ever got round to listing.
    // Keying aging on dateListed alone left it out of every aging view.
    const neverListedArm = agingArms(30)[1] as {
      status: { in: string[] };
      dateListed: null;
      pallet: { is: { pickupDate: { lte: Date } } };
    };
    expect(neverListedArm.status.in).toContain("IN_STOCK");
    expect(neverListedArm.dateListed).toBeNull();
    // Ages from arrival, since there is no listing date to age from.
    expect(neverListedArm.pallet.is.pickupDate.lte.getTime()).toBe(now.getTime() - 30 * 86_400_000);
  });

  it("aging never counts sold or scrapped stock as sitting on the shelf", () => {
    const statuses = agingArms(30).flatMap((arm) => {
      const a = arm as { status: string | { in: string[] } };
      return typeof a.status === "string" ? [a.status] : a.status.in;
    });
    expect(statuses).not.toContain("SOLD");
    expect(statuses).not.toContain("SCRAPPED");
    expect(statuses).not.toContain("RETURNED");
  });

  it("respects a custom aging threshold on both arms", () => {
    const arms = agingArms(60);
    const listedArm = arms[0] as { dateListed: { lte: Date } };
    const neverListedArm = arms[1] as { pallet: { is: { pickupDate: { lte: Date } } } };
    expect(listedArm.dateListed.lte.getTime()).toBe(now.getTime() - 60 * 86_400_000);
    expect(neverListedArm.pallet.is.pickupDate.lte.getTime()).toBe(now.getTime() - 60 * 86_400_000);
  });

  it("combines a search and an aging filter without either winning", () => {
    const w = buildItemWhere({ q: "drill", aging: "1", status: "LISTED" }, 30, now);
    expect(w.AND).toHaveLength(2);
    expect(w.status).toBe("LISTED");
  });
});

describe("buildItemOrderBy", () => {
  it("defaults to newest first", () => {
    expect(buildItemOrderBy({})).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
  });

  it("always appends an id tiebreaker so paging can't repeat rows", () => {
    for (const sort of ["sku", "name", "cost", "price", "status", "location", "listed"]) {
      expect(buildItemOrderBy({ sort })[1]).toEqual({ id: "asc" });
    }
  });

  it("maps a known sort key to its column", () => {
    expect(buildItemOrderBy({ sort: "price" })[0]).toEqual({ sellPrice: "desc" });
    expect(buildItemOrderBy({ sort: "sku" })[0]).toEqual({ sku: "asc" });
  });

  it("an explicit direction overrides the column default", () => {
    expect(buildItemOrderBy({ sort: "price", dir: "asc" })[0]).toEqual({ sellPrice: "asc" });
    expect(buildItemOrderBy({ sort: "sku", dir: "desc" })[0]).toEqual({ sku: "desc" });
  });

  it("falls back to the default for an unknown sort key", () => {
    expect(buildItemOrderBy({ sort: "nonsense" })[0]).toEqual({ createdAt: "desc" });
  });

  it("ignores a bogus direction", () => {
    expect(buildItemOrderBy({ sort: "price", dir: "sideways" })[0]).toEqual({ sellPrice: "desc" });
  });
});
