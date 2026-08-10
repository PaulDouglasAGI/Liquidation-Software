import { describe, expect, it } from "vitest";
import { buildBuyNext, rankSegments, type BuyNextUnit } from "@/lib/buyNextMath";
import { buildQuarterlySeries, buildLotCurves, type RotationUnit, type RotationLot } from "@/lib/rotationMath";

const DAY = 86_400_000;
const base = new Date(Date.UTC(2026, 0, 1));
const at = (d: number) => new Date(base.getTime() + d * DAY);

function unit(over: Partial<BuyNextUnit> = {}): BuyNextUnit {
  return {
    category: "POWER_TOOLS", brand: "DeWalt", supplier: "B-Stock", conditionGrade: "SHELF_PULL",
    cost: 10, salePrice: 30, fees: 4, shippingPaid: 3, shippingCollected: 3,
    receivedAt: at(0), listedAt: at(2), soldAt: at(30),
    isDud: false, scrapped: false, returned: false, listPrice: 30, lotId: "lot1", hours: 0.1,
    ...over,
  };
}

describe("buy-next scoring — margin is only half the question", () => {
  it("prefers the segment that turns its money faster at the same margin", () => {
    // Identical economics; one takes a month to sell, the other six.
    const fast = Array.from({ length: 40 }, (_, i) =>
      unit({ category: "FAST", lotId: `f${i % 3}`, soldAt: at(30) }));
    const slow = Array.from({ length: 40 }, (_, i) =>
      unit({ category: "SLOW", lotId: `s${i % 3}`, soldAt: at(180) }));

    const r = buildBuyNext([...fast, ...slow], at(200));
    const byKey = Object.fromEntries(r.byCategory.map((s) => [s.key, s]));
    expect(byKey.FAST.netMultiple).toBeCloseTo(byKey.SLOW.netMultiple!, 6);
    // Same multiple, six times the turns.
    expect(byKey.FAST.annualisedReturnPct!).toBeGreaterThan(byKey.SLOW.annualisedReturnPct! * 5);
    expect(r.byCategory[0].key).toBe("FAST");
  });

  it("counts fees and postage against the return, not just the purchase price", () => {
    const u = Array.from({ length: 10 }, () => unit({ salePrice: 30, fees: 4, shippingPaid: 3, shippingCollected: 0, cost: 10 }));
    const [s] = buildBuyNext(u, at(60)).byCategory;
    // 30 sold − 4 fees − 3 postage = 23 net on 10 of cost.
    expect(s.netProceeds).toBeCloseTo(230, 2);
    expect(s.netMultiple).toBeCloseTo(2.3, 2);
    expect(s.netProfit).toBeCloseTo(130, 2);
  });

  it("credits postage the buyer paid back to the segment", () => {
    const u = Array.from({ length: 10 }, () => unit({ shippingPaid: 3, shippingCollected: 3 }));
    const [s] = buildBuyNext(u, at(60)).byCategory;
    expect(s.postageCollected).toBeCloseTo(30, 2);
    expect(s.netProceeds).toBeCloseTo(30 * 10 - 4 * 10 - 3 * 10 + 3 * 10, 2);
  });

  it("charges duds and stuck stock against the score", () => {
    const clean = Array.from({ length: 30 }, (_, i) => unit({ category: "CLEAN", lotId: `c${i % 3}` }));
    const risky = [
      ...Array.from({ length: 20 }, (_, i) => unit({ category: "RISKY", lotId: `r${i % 3}` })),
      ...Array.from({ length: 10 }, (_, i) => unit({ category: "RISKY", lotId: `r${i % 3}`, isDud: true, scrapped: true, soldAt: null, salePrice: null })),
    ];
    const r = buildBuyNext([...clean, ...risky], at(200));
    const byKey = Object.fromEntries(r.byCategory.map((s) => [s.key, s]));
    expect(byKey.RISKY.dudRatePct).toBeCloseTo(33.3, 1);
    expect(byKey.RISKY.riskAdjustedReturnPct!).toBeLessThan(byKey.RISKY.annualisedReturnPct!);
    expect(byKey.CLEAN.score!).toBeGreaterThan(byKey.RISKY.score!);
  });

  it("does not let one lucky lot top the table", () => {
    // A spectacular 6-unit result against a merely good 90-unit record.
    const lucky = Array.from({ length: 6 }, () => unit({ category: "LUCKY", lotId: "one", salePrice: 300, fees: 40 }));
    const steady = Array.from({ length: 90 }, (_, i) => unit({ category: "STEADY", lotId: `s${i % 5}`, salePrice: 45, fees: 6 }));
    const r = buildBuyNext([...lucky, ...steady], at(200));
    const byKey = Object.fromEntries(r.byCategory.map((s) => [s.key, s]));
    expect(byKey.LUCKY.annualisedReturnPct!).toBeGreaterThan(byKey.STEADY.annualisedReturnPct!);
    // The lucky one may well still score higher — six units at 26x is real
    // evidence. What it must not do is lead the page, because it is one bet.
    expect(byKey.LUCKY.confidence).toBeLessThan(byKey.STEADY.confidence);
    expect(byKey.LUCKY.recommended).toBe(false);
    expect(byKey.STEADY.recommended).toBe(true);
    expect(r.byCategory[0].key).toBe("STEADY");
    expect(byKey.LUCKY.verdict).toMatch(/too little history/i);
  });

  it("treats many units from a single lot as one bet, not many", () => {
    const oneLot = Array.from({ length: 200 }, () => unit({ category: "ONE", lotId: "solo" }));
    const spread = Array.from({ length: 200 }, (_, i) => unit({ category: "MANY", lotId: `m${i % 8}` }));
    const r = buildBuyNext([...oneLot, ...spread], at(200));
    const byKey = Object.fromEntries(r.byCategory.map((s) => [s.key, s]));
    expect(byKey.ONE.confidence).toBeLessThan(byKey.MANY.confidence);
  });

  it("caps the turn rate so a three-day sale is not an infinite return", () => {
    const instant = Array.from({ length: 30 }, (_, i) => unit({ category: "INSTANT", lotId: `i${i % 3}`, soldAt: at(0) }));
    const [s] = buildBuyNext(instant, at(30)).byCategory;
    expect(Number.isFinite(s.annualisedReturnPct!)).toBe(true);
    // Floored at a 7-day cycle: 52 turns a year, not 365.
    expect(s.annualisedReturnPct!).toBeLessThan((s.netMultiple! - 1) * 53 * 100 + 1);
  });

  it("reports a segment with no sales rather than scoring it", () => {
    const unsold = Array.from({ length: 8 }, () => unit({ category: "NEW", salePrice: null, soldAt: null }));
    const [s] = buildBuyNext(unsold, at(60)).byCategory;
    expect(s.unitsSold).toBe(0);
    expect(s.netMultiple).toBe(0);
    expect(s.verdict).toMatch(/nothing has sold/i);
  });

  it("hides segments too small to mean anything", () => {
    const tiny = Array.from({ length: 3 }, () => unit({ category: "TINY" }));
    const real = Array.from({ length: 20 }, (_, i) => unit({ category: "REAL", lotId: `r${i % 3}` }));
    const r = buildBuyNext([...tiny, ...real], at(90));
    expect(r.byCategory.map((s) => s.key)).not.toContain("TINY");
    expect(r.byCategory.map((s) => s.key)).toContain("REAL");
  });

  it("measures thirty-plus distinct things per segment", () => {
    const [s] = buildBuyNext(Array.from({ length: 20 }, (_, i) => unit({ lotId: `l${i % 3}` })), at(90)).byCategory;
    const measured = Object.entries(s).filter(([k, v]) =>
      !["key", "label", "dimension", "verdict"].includes(k) && v !== null && v !== undefined);
    expect(measured.length).toBeGreaterThanOrEqual(30);
  });

  it("survives an empty history without throwing", () => {
    const r = buildBuyNext([], at(10));
    expect(r.byCategory).toEqual([]);
    expect(r.totalUnits).toBe(0);
  });

  it("leaves an unscoreable list untouched rather than inventing an order", () => {
    expect(rankSegments([])).toEqual([]);
  });
});

describe("quarterly rotation series", () => {
  const ru = (over: Partial<RotationUnit> = {}): RotationUnit => ({
    lotId: "lot1", cost: 10, salePrice: 30, fees: 4, shippingPaid: 3, shippingCollected: 3,
    receivedAt: at(0), soldAt: at(40), scrapped: false, ...over,
  });

  it("puts spend in the quarter the stock arrived and revenue in the quarter it sold", () => {
    const q = buildQuarterlySeries([ru({ receivedAt: at(5), soldAt: at(120) })], at(200));
    expect(q[0].spend).toBe(10);
    expect(q[0].grossRevenue).toBe(0);
    const soldQ = q.find((p) => p.grossRevenue > 0)!;
    expect(soldQ.grossRevenue).toBe(30);
    expect(soldQ.unitsSold).toBe(1);
  });

  it("leaves no gaps, so a dead quarter reads as a dead quarter", () => {
    const q = buildQuarterlySeries([ru({ receivedAt: at(0), soldAt: at(300) })], at(320));
    // Consecutive quarter indices throughout.
    for (let i = 1; i < q.length; i++) expect(q[i].index - q[i - 1].index).toBe(1);
    expect(q.length).toBeGreaterThan(2);
    expect(q.some((p) => p.unitsSold === 0 && p.spend === 0)).toBe(true);
  });

  it("tracks capital still sitting on the shelf at each quarter end", () => {
    const q = buildQuarterlySeries(
      [ru({ cost: 100, receivedAt: at(0), soldAt: at(200) }), ru({ cost: 50, receivedAt: at(0), soldAt: null, salePrice: null })],
      at(220)
    );
    expect(q[0].capitalOnShelf).toBe(150);
    expect(q[q.length - 1].capitalOnShelf).toBe(50); // the unsold one is still there
  });

  it("accumulates profit across quarters", () => {
    const q = buildQuarterlySeries(
      [ru({ soldAt: at(10) }), ru({ soldAt: at(100) }), ru({ soldAt: at(200) })],
      at(220)
    );
    const last = q[q.length - 1];
    expect(last.cumulativeProfit).toBeCloseTo(q.reduce((s, p) => s + p.netProfit, 0), 2);
  });

  it("returns nothing for an empty book rather than a fabricated quarter", () => {
    expect(buildQuarterlySeries([], at(10))).toEqual([]);
  });
});

describe("per-lot cost-recovery curves", () => {
  const lot: RotationLot = { id: "L1", code: "PAL-2026-001", cost: 100, receivedAt: at(0) };
  const ru = (day: number, net: number): RotationUnit => ({
    lotId: "L1", cost: 10, salePrice: net, fees: 0, shippingPaid: 0, shippingCollected: 0,
    receivedAt: at(0), soldAt: at(day), scrapped: false,
  });

  it("rises to the multiple the lot actually returned", () => {
    const [c] = buildLotCurves([lot], [ru(7, 60), ru(14, 60), ru(21, 60)], at(30), 7);
    expect(c.finalMultiple).toBeCloseTo(1.8, 2);
  });

  it("marks the day the lot paid for itself", () => {
    const [c] = buildLotCurves([lot], [ru(7, 60), ru(14, 60)], at(30), 7);
    expect(c.breakEvenDay).toBe(14); // 120 of 100 recovered by day 14
  });

  it("leaves break-even null while a lot is still under water", () => {
    const [c] = buildLotCurves([lot], [ru(7, 30)], at(30), 7);
    expect(c.breakEvenDay).toBeNull();
    expect(c.finalMultiple).toBeCloseTo(0.3, 2);
  });

  it("never decreases — recovery only accumulates", () => {
    const [c] = buildLotCurves([lot], [ru(7, 40), ru(28, 40)], at(60), 7);
    for (let i = 1; i < c.points.length; i++) {
      expect(c.points[i].recovered).toBeGreaterThanOrEqual(c.points[i - 1].recovered);
    }
  });

  it("skips a lot with no cost or no arrival date rather than dividing by zero", () => {
    expect(buildLotCurves([{ ...lot, cost: 0 }], [ru(7, 60)], at(30))).toEqual([]);
    expect(buildLotCurves([{ ...lot, receivedAt: null }], [ru(7, 60)], at(30))).toEqual([]);
  });
});
