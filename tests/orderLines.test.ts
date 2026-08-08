import { describe, expect, it } from "vitest";
import { isOnShelf } from "@/lib/orders";
import { splitEvenly } from "@/lib/fulfillmentMath";
import { ITEM_STATUSES } from "@/lib/constants";

describe("isOnShelf — what makes a unit available to sell", () => {
  it("counts the two states where the unit is physically there and unclaimed", () => {
    expect(isOnShelf("IN_STOCK")).toBe(true);
    expect(isOnShelf("LISTED")).toBe(true);
  });

  it("does not count a unit that is gone, spoken for, or being processed", () => {
    // RETURNED is deliberately false: a unit mid-return has not been put back
    // yet. Restocking it to IN_STOCK is the act that frees it.
    expect(isOnShelf("SOLD")).toBe(false);
    expect(isOnShelf("RESERVED")).toBe(false);
    expect(isOnShelf("RETURNED")).toBe(false);
    expect(isOnShelf("SCRAPPED")).toBe(false);
  });

  it("has an answer for every status the schema allows", () => {
    for (const s of ITEM_STATUSES) expect(typeof isOnShelf(s)).toBe("boolean");
  });

  it("treats an unknown status as unavailable rather than sellable", () => {
    // Fail closed: a status added later must not become silently sellable.
    expect(isOnShelf("SOME_NEW_STATUS")).toBe(false);
    expect(isOnShelf("")).toBe(false);
  });
});

describe("pallet cost allocation — unit costs must add up to what was paid", () => {
  const totalOf = (shares: number[]) => Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100;

  it("reconciles exactly on the split that used to drift", () => {
    // $2450 over 16 units: a flat round() gives $153.13 each, which is
    // $2450.08 of COGS against $2450 actually spent.
    expect(totalOf(splitEvenly(2450, 16))).toBe(2450);
    expect(Math.round((2450 / 16) * 100) / 100 * 16).toBeCloseTo(2450.08, 2);
  });

  it("reconciles for awkward pallet sizes generally", () => {
    for (const [total, n] of [[3100, 34], [1999.99, 7], [0.05, 3], [12345.67, 101]] as const) {
      expect(totalOf(splitEvenly(total, n))).toBe(Math.round(total * 100) / 100);
    }
  });

  it("keeps every share within a cent of an even split", () => {
    const shares = splitEvenly(2450, 16);
    const even = 2450 / 16;
    for (const s of shares) expect(Math.abs(s - even)).toBeLessThanOrEqual(0.01);
  });

  it("handles a pallet with a single unit, and with none", () => {
    expect(splitEvenly(2450, 1)).toEqual([2450]);
    expect(splitEvenly(2450, 0)).toEqual([]);
  });
});
