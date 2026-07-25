import { describe, expect, it } from "vitest";
import {
  formatCode,
  itemSkuPrefix,
  maxSuffix,
  palletCodePrefix,
  sequence,
  suffixOf,
} from "@/lib/skuFormat";
import { decidePalletStatus } from "@/lib/palletStatus";

describe("maxSuffix", () => {
  const prefix = "ITM-PAL001-";

  it("finds the highest number in use", () => {
    expect(maxSuffix([`${prefix}001`, `${prefix}007`, `${prefix}003`], prefix)).toBe(7);
  });

  it("is 0 when nothing exists yet, so numbering starts at 1", () => {
    expect(maxSuffix([], prefix)).toBe(0);
  });

  it("keeps counting past 999 instead of wrapping", () => {
    expect(maxSuffix([`${prefix}999`, `${prefix}1000`], prefix)).toBe(1000);
  });

  it("ignores codes belonging to a different pallet", () => {
    expect(maxSuffix([`${prefix}002`, "ITM-PAL002-999"], prefix)).toBe(2);
  });

  it("ignores unparseable suffixes rather than yielding NaN", () => {
    expect(maxSuffix([`${prefix}abc`, `${prefix}004`], prefix)).toBe(4);
  });
});

describe("code formatting", () => {
  it("zero-pads to three digits and grows beyond them", () => {
    expect(formatCode("ITM-PAL001-", 1)).toBe("ITM-PAL001-001");
    expect(formatCode("ITM-PAL001-", 42)).toBe("ITM-PAL001-042");
    expect(formatCode("ITM-PAL001-", 1234)).toBe("ITM-PAL001-1234");
  });

  it("builds the year-scoped pallet prefix", () => {
    expect(palletCodePrefix(2026)).toBe("PAL-2026-");
    expect(formatCode(palletCodePrefix(2026), 1)).toBe("PAL-2026-001");
  });

  it("derives an item prefix from its pallet code", () => {
    expect(itemSkuPrefix("PAL-2026-001")).toBe("ITM-PAL001-");
    expect(itemSkuPrefix("PAL-2026-017")).toBe("ITM-PAL017-");
  });

  it("falls back sanely on a malformed pallet code", () => {
    expect(itemSkuPrefix("")).toBe("ITM-PAL000-");
  });

  it("round-trips through suffixOf", () => {
    const prefix = "ITM-PAL001-";
    expect(suffixOf(formatCode(prefix, 12), prefix)).toBe(12);
    expect(suffixOf("ITM-PAL001-junk", prefix)).toBe(0);
  });
});

describe("sequence", () => {
  it("numbers a multi-unit row consecutively", () => {
    expect(sequence("ITM-PAL001-", 4, 3)).toEqual([
      "ITM-PAL001-004",
      "ITM-PAL001-005",
      "ITM-PAL001-006",
    ]);
  });

  it("returns nothing for a zero-quantity row", () => {
    expect(sequence("ITM-PAL001-", 1, 0)).toEqual([]);
  });

  it("never repeats a SKU within a batch", () => {
    const codes = sequence("ITM-PAL001-", 1, 500);
    expect(new Set(codes).size).toBe(500);
  });
});

describe("decidePalletStatus", () => {
  it("an empty pallet is merely received", () => {
    expect(decidePalletStatus({ anyItems: 0, total: 0, listedOrBeyond: 0 })).toBe("RECEIVED");
  });

  it("items present but none listed means processing", () => {
    expect(decidePalletStatus({ anyItems: 5, total: 5, listedOrBeyond: 0 })).toBe("IN_PROCESSING");
  });

  it("some listed means partially listed", () => {
    expect(decidePalletStatus({ anyItems: 5, total: 5, listedOrBeyond: 2 })).toBe("PARTIALLY_LISTED");
  });

  it("all listed means fully listed", () => {
    expect(decidePalletStatus({ anyItems: 5, total: 5, listedOrBeyond: 5 })).toBe("FULLY_LISTED");
  });

  it("a fully scrapped pallet is done, not stuck part-way", () => {
    // 5 items exist but every one is SCRAPPED, so total (non-scrapped) is 0
    expect(decidePalletStatus({ anyItems: 5, total: 0, listedOrBeyond: 0 })).toBe("FULLY_LISTED");
  });

  it("scrapped units don't hold a pallet open once the rest are listed", () => {
    // 5 items, 2 scrapped, the remaining 3 all listed
    expect(decidePalletStatus({ anyItems: 5, total: 3, listedOrBeyond: 3 })).toBe("FULLY_LISTED");
  });
});
