import { describe, expect, it } from "vitest";
import {
  classifyAction,
  throughputByDay,
  throughputByPerson,
  throughputSummary,
} from "@/lib/throughputMath";
import type { ActivityRecord } from "@/lib/throughputMath";

const rec = (actor: string, action: string, d: Date): ActivityRecord => ({ actor, action, createdAt: d });
const day = (n: number, hour = 12) => new Date(2026, 6, n, hour);

describe("classifyAction", () => {
  it("maps log actions to the jobs people actually do", () => {
    expect(classifyAction("item.create")).toBe("intake");
    expect(classifyAction("pallet.import")).toBe("intake");
    expect(classifyAction("item.list.ebay")).toBe("listing");
    expect(classifyAction("lot.create")).toBe("listing");
    expect(classifyAction("order.shipped")).toBe("fulfillment");
    expect(classifyAction("item.status")).toBe("fulfillment");
    expect(classifyAction("count.close")).toBe("counting");
  });

  it("buckets anything unrecognised as admin rather than dropping it", () => {
    expect(classifyAction("settings.update")).toBe("admin");
    expect(classifyAction("")).toBe("admin");
  });
});

describe("throughputByPerson", () => {
  const records = [
    rec("Paul", "item.create", day(20)),
    rec("Paul", "item.create", day(20)),
    rec("Paul", "order.shipped", day(21)),
    rec("Sam", "item.create", day(20)),
  ];

  it("totals per person, busiest first", () => {
    const rows = throughputByPerson(records);
    expect(rows.map((r) => [r.actor, r.total])).toEqual([["Paul", 3], ["Sam", 1]]);
  });

  it("splits each person's work by kind", () => {
    const paul = throughputByPerson(records)[0];
    expect(paul.byKind.intake).toBe(2);
    expect(paul.byKind.fulfillment).toBe(1);
    expect(paul.byKind.listing).toBe(0);
  });

  it("averages over days actually worked, not calendar days", () => {
    const paul = throughputByPerson(records)[0];
    expect(paul.activeDays).toBe(2);
    expect(paul.perActiveDay).toBe(1.5);
  });

  it("records the first and last activity", () => {
    const paul = throughputByPerson(records)[0];
    expect(paul.firstAt.getDate()).toBe(20);
    expect(paul.lastAt.getDate()).toBe(21);
  });

  it("counts a late-evening shift as one day, not two", () => {
    const rows = throughputByPerson([rec("Paul", "item.create", day(20, 8)), rec("Paul", "item.create", day(20, 23))]);
    expect(rows[0].activeDays).toBe(1);
  });

  it("returns nothing for no activity", () => {
    expect(throughputByPerson([])).toEqual([]);
  });
});

describe("throughputByDay", () => {
  it("returns the full window oldest-first", () => {
    const rows = throughputByDay([], 7, day(20));
    expect(rows).toHaveLength(7);
    expect(rows[6].day).toBe("2026-07-20");
    expect(rows[0].day).toBe("2026-07-14");
  });

  it("includes quiet days as zeros so gaps are visible", () => {
    const rows = throughputByDay([rec("Paul", "item.create", day(20))], 3, day(20));
    expect(rows.map((r) => r.total)).toEqual([0, 0, 1]);
  });

  it("ignores activity outside the window", () => {
    const rows = throughputByDay([rec("Paul", "item.create", day(1))], 3, day(20));
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(0);
  });

  it("splits the day by work kind", () => {
    const rows = throughputByDay(
      [rec("Paul", "item.create", day(20)), rec("Sam", "order.shipped", day(20))], 2, day(20)
    );
    expect(rows[1].byKind.intake).toBe(1);
    expect(rows[1].byKind.fulfillment).toBe(1);
  });
});

describe("throughputSummary", () => {
  it("gives headline totals for the period", () => {
    const s = throughputSummary([
      rec("Paul", "item.create", day(20)),
      rec("Sam", "item.create", day(20)),
      rec("Paul", "order.shipped", day(21)),
    ]);
    expect(s.total).toBe(3);
    expect(s.people).toBe(2);
    expect(s.activeDays).toBe(2);
    expect(s.perDay).toBe(1.5);
    expect(s.byKind.intake).toBe(2);
  });

  it("is all zeros on an empty log, not NaN", () => {
    const s = throughputSummary([]);
    expect(s.total).toBe(0);
    expect(s.perDay).toBe(0);
    expect(s.people).toBe(0);
  });
});
