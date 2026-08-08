import { describe, expect, it } from "vitest";
import { isOnShelf } from "@/lib/orders";
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
