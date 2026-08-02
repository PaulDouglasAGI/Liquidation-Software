import { describe, expect, it } from "vitest";
import {
  allPicked,
  buildPickList,
  daysUntilShipBy,
  detectCarrier,
  locationSortKey,
  shipByFrom,
  shippingMargin,
  sortByLocation,
  sortQueue,
  urgencyOf,
} from "@/lib/fulfillmentMath";
import type { PickableOrder } from "@/lib/fulfillmentMath";

const line = (sku: string, loc: string | null, picked = false) => ({
  itemId: `i-${sku}`, sku, name: sku, storageLocation: loc, picked,
});

describe("sortByLocation — the picker walks the racks once", () => {
  it("orders shelves numerically, not as strings", () => {
    const sorted = sortByLocation([line("a", "A-10"), line("b", "A-2"), line("c", "A-1")]);
    expect(sorted.map((l) => l.storageLocation)).toEqual(["A-1", "A-2", "A-10"]);
  });

  it("groups by aisle before shelf number", () => {
    const sorted = sortByLocation([line("a", "B-1"), line("b", "A-9"), line("c", "A-3")]);
    expect(sorted.map((l) => l.storageLocation)).toEqual(["A-3", "A-9", "B-1"]);
  });

  it("handles multi-level codes like A-02-3", () => {
    const sorted = sortByLocation([line("a", "A-2-10"), line("b", "A-2-2"), line("c", "A-1-9")]);
    expect(sorted.map((l) => l.storageLocation)).toEqual(["A-1-9", "A-2-2", "A-2-10"]);
  });

  it("puts unlocated items last — they need a hunt, not a walk", () => {
    const sorted = sortByLocation([line("a", null), line("b", "Z-99"), line("c", "A-1")]);
    expect(sorted.map((l) => l.storageLocation)).toEqual(["A-1", "Z-99", null]);
  });

  it("is case- and separator-insensitive", () => {
    expect(locationSortKey("a-1")).toEqual(locationSortKey("A_1"));
  });

  it("breaks ties by SKU so the order is stable", () => {
    const sorted = sortByLocation([line("z", "A-1"), line("a", "A-1")]);
    expect(sorted.map((l) => l.sku)).toEqual(["a", "z"]);
  });
});

describe("buildPickList", () => {
  const order = (id: string, status: PickableOrder["status"], items: PickableOrder["items"]): PickableOrder => ({
    id, orderNumber: `ORD-${id}`, status, shipByDate: null, soldAt: null, buyerName: null, items,
  });

  it("merges every open order into one shelf-ordered walk", () => {
    const list = buildPickList([
      order("1", "AWAITING_PICK", [line("a", "C-1")]),
      order("2", "AWAITING_PICK", [line("b", "A-1")]),
    ]);
    expect(list.map((l) => l.sku)).toEqual(["b", "a"]);
    expect(list[0].orderNumber).toBe("ORD-2");
  });

  it("skips lines already picked", () => {
    const list = buildPickList([order("1", "PICKED", [line("a", "A-1", true), line("b", "A-2")])]);
    expect(list.map((l) => l.sku)).toEqual(["b"]);
  });

  it("ignores shipped and cancelled orders", () => {
    const list = buildPickList([
      order("1", "SHIPPED", [line("a", "A-1")]),
      order("2", "CANCELLED", [line("b", "A-2")]),
      order("3", "PACKED", [line("c", "A-3")]),
    ]);
    expect(list).toEqual([]);
  });
});

describe("ship-by deadlines", () => {
  it("adds the handling window and runs to end of day", () => {
    const by = shipByFrom(new Date(2026, 6, 20, 9, 0));
    expect(by!.getDate()).toBe(22);
    expect(by!.getHours()).toBe(23);
  });

  it("is null when the sale has no date", () => {
    expect(shipByFrom(null)).toBeNull();
  });

  it("counts days remaining, negative once overdue", () => {
    const now = new Date(2026, 6, 20, 12, 0);
    expect(daysUntilShipBy(new Date(2026, 6, 22, 23, 59), now)).toBe(2);
    expect(daysUntilShipBy(new Date(2026, 6, 19, 23, 59), now)).toBe(-1);
  });

  it("grades urgency for the queue", () => {
    const now = new Date(2026, 6, 20, 12, 0);
    expect(urgencyOf(new Date(2026, 6, 18), now)).toBe("late");
    expect(urgencyOf(new Date(2026, 6, 20, 23, 59), now)).toBe("today");
    expect(urgencyOf(new Date(2026, 6, 21, 23, 59), now)).toBe("soon");
    expect(urgencyOf(new Date(2026, 6, 25, 23, 59), now)).toBe("ok");
    expect(urgencyOf(null, now)).toBe("none");
  });
});

describe("sortQueue", () => {
  it("puts the most urgent deadline first", () => {
    const q = sortQueue([
      { shipByDate: new Date(2026, 6, 25), soldAt: null },
      { shipByDate: new Date(2026, 6, 20), soldAt: null },
    ]);
    expect(q[0].shipByDate!.getDate()).toBe(20);
  });

  it("puts orders with no deadline last, oldest sale first among them", () => {
    const q = sortQueue([
      { shipByDate: null, soldAt: new Date(2026, 6, 10) },
      { shipByDate: new Date(2026, 6, 25), soldAt: null },
      { shipByDate: null, soldAt: new Date(2026, 6, 1) },
    ]);
    expect(q[0].shipByDate!.getDate()).toBe(25);
    expect(q[1].soldAt!.getDate()).toBe(1);
  });
});

describe("allPicked", () => {
  it("is true only when every line is done", () => {
    expect(allPicked([line("a", "A", true), line("b", "B", true)])).toBe(true);
    expect(allPicked([line("a", "A", true), line("b", "B")])).toBe(false);
  });

  it("is false for an empty order rather than vacuously true", () => {
    expect(allPicked([])).toBe(false);
  });
});

describe("shippingMargin", () => {
  it("is what the buyer paid minus real postage", () => {
    expect(shippingMargin(12, 8.45)).toBe(3.55);
    expect(shippingMargin(5, 9)).toBe(-4); // we ate the difference
  });

  it("treats a missing side as zero, but null when both are absent", () => {
    expect(shippingMargin(10, null)).toBe(10);
    expect(shippingMargin(null, null)).toBeNull();
  });
});

describe("detectCarrier", () => {
  it("recognises common tracking formats", () => {
    expect(detectCarrier("1Z999AA10123456784")).toBe("UPS");
    expect(detectCarrier("9400111899223197428490")).toBe("USPS");
    expect(detectCarrier("123456789012")).toBe("FedEx");
  });

  it("ignores spacing", () => {
    expect(detectCarrier("1Z 999AA1 0123456784")).toBe("UPS");
  });

  it("returns null rather than guessing wrong", () => {
    expect(detectCarrier("hello")).toBeNull();
    expect(detectCarrier("")).toBeNull();
  });
});
