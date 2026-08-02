import { describe, expect, it } from "vitest";
import { isClean, missingValue, reconcileCount } from "@/lib/countMath";
import type { ExpectedItem } from "@/lib/countMath";

const item = (sku: string, loc: string | null = "A-1"): ExpectedItem => ({
  id: `id-${sku}`, sku, name: `Item ${sku}`, storageLocation: loc, status: "IN_STOCK",
});
const scan = (sku: string) => ({ sku, itemId: null });

describe("reconcileCount", () => {
  it("a perfect shelf reports everything found and 100% accurate", () => {
    const r = reconcileCount("A-1", [item("S1"), item("S2")], [scan("S1"), scan("S2")]);
    expect(r.found).toHaveLength(2);
    expect(r.missing).toEqual([]);
    expect(r.accuracyPct).toBe(100);
    expect(isClean(r)).toBe(true);
  });

  it("flags expected-but-not-scanned as missing", () => {
    const r = reconcileCount("A-1", [item("S1"), item("S2")], [scan("S1")]);
    expect(r.missing.map((m) => m.sku)).toEqual(["S2"]);
    expect(r.accuracyPct).toBe(50);
    expect(isClean(r)).toBe(false);
  });

  it("calls a scan from another shelf misplaced, not unknown", () => {
    const elsewhere = item("S9", "B-4");
    const r = reconcileCount("A-1", [item("S1")], [scan("S1"), scan("S9")], new Map([["S9", elsewhere]]));
    expect(r.unknown).toEqual([]);
    expect(r.misplaced).toEqual([{ sku: "S9", itemId: "id-S9", expectedLocation: "B-4" }]);
  });

  it("calls a scan matching no item unknown", () => {
    const r = reconcileCount("A-1", [item("S1")], [scan("S1"), scan("MYSTERY")]);
    expect(r.unknown).toEqual(["MYSTERY"]);
    expect(r.misplaced).toEqual([]);
  });

  it("ignores case and stray whitespace on scanned codes", () => {
    const r = reconcileCount("A-1", [item("ITM-PAL001-001")], [{ sku: " itm-pal001-001 ", itemId: null }]);
    expect(r.found).toHaveLength(1);
    expect(r.missing).toEqual([]);
  });

  it("counts a double-scan once rather than inflating the shelf", () => {
    const r = reconcileCount("A-1", [item("S1")], [scan("S1"), scan("S1")]);
    expect(r.scannedCount).toBe(1);
    expect(r.found).toHaveLength(1);
  });

  it("an empty shelf that scans empty is clean, with null accuracy", () => {
    const r = reconcileCount("A-1", [], []);
    expect(isClean(r)).toBe(true);
    expect(r.accuracyPct).toBeNull(); // 0/0 is not 0%
  });

  it("an empty shelf holding stock reports it as misplaced/unknown", () => {
    const r = reconcileCount("A-1", [], [scan("S5")]);
    expect(r.unknown).toEqual(["S5"]);
    expect(isClean(r)).toBe(false);
  });

  it("reports expected and scanned counts for the summary line", () => {
    const r = reconcileCount("A-1", [item("S1"), item("S2"), item("S3")], [scan("S1"), scan("S2"), scan("X")]);
    expect(r.expectedCount).toBe(3);
    expect(r.scannedCount).toBe(3);
    expect(r.accuracyPct).toBeCloseTo(66.7, 1);
  });
});

describe("missingValue", () => {
  it("totals what the missing units cost us", () => {
    const missing = [item("S1"), item("S2")];
    expect(missingValue(missing, new Map([["S1", 12.5], ["S2", 7.25]]))).toBe(19.75);
  });

  it("treats unknown costs as zero rather than NaN", () => {
    expect(missingValue([item("S1")], new Map())).toBe(0);
  });

  it("sums in cents so many small costs do not drift", () => {
    const missing = Array.from({ length: 10 }, (_, n) => item(`S${n}`));
    const costs = new Map(missing.map((m) => [m.sku, 0.1]));
    expect(missingValue(missing, costs)).toBe(1);
  });
});
