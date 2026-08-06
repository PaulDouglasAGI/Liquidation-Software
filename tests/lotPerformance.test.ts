import { describe, expect, it } from "vitest";
import {
  accuracyNote,
  aggregate,
  analyzeLot,
  processingTrend,
  type LotInput,
  type LotLabor,
  type LotUnit,
} from "@/lib/lotPerformanceMath";

const d = (s: string) => new Date(`${s}T12:00:00.000Z`);

const unit = (o: Partial<LotUnit> = {}): LotUnit => ({
  category: "POWER_TOOLS",
  valueClass: null,
  isDud: false,
  dudReason: null,
  listedDate: null,
  soldDate: null,
  salePrice: null,
  ...o,
});

const labor = (hours: number, o: Partial<LotLabor> = {}): LotLabor => ({
  hours,
  activity: "TESTING_SORTING",
  userName: "Paul",
  date: d("2026-01-10"),
  ...o,
});

const lot = (o: Partial<LotInput> = {}): LotInput => ({
  id: "l1",
  code: "PAL-2026-001",
  source: "Liquidation.com",
  sourceLotId: null,
  category: "POWER_TOOLS",
  conditionGrade: "CUSTOMER_RETURNS",
  status: "IN_PROCESSING",
  totalCost: 1000,
  fees: 0,
  pickupDate: d("2026-01-01"),
  preBidEstimatedRecovery: null,
  manifestUnitCount: null,
  actualUnitCount: null,
  manifestRetailTotal: null,
  units: [],
  labor: [],
  ...o,
});

// ── Metric 1 ────────────────────────────────────────────────────────────
describe("metric 1 — profit per labor hour", () => {
  it("is (revenue − lot cost) ÷ hours, exactly", () => {
    const r = analyzeLot(lot({
      totalCost: 1000,
      units: [
        unit({ soldDate: d("2026-01-15"), salePrice: 900 }),
        unit({ soldDate: d("2026-01-20"), salePrice: 600 }),
      ],
      labor: [labor(6), labor(4)],
    }));
    expect(r.revenue).toBe(1500);
    expect(r.profit).toBe(500);
    expect(r.hours).toBe(10);
    expect(r.profitPerHour).toBe(50);
  });

  it("reports a loss per hour rather than clamping at zero", () => {
    const r = analyzeLot(lot({
      totalCost: 1000,
      units: [unit({ soldDate: d("2026-01-15"), salePrice: 200 })],
      labor: [labor(8)],
    }));
    expect(r.profit).toBe(-800);
    expect(r.profitPerHour).toBe(-100);
  });

  it("is null with no hours logged — not zero, and never Infinity", () => {
    const r = analyzeLot(lot({ units: [unit({ soldDate: d("2026-01-15"), salePrice: 5000 })] }));
    expect(r.hours).toBe(0);
    expect(r.profitPerHour).toBeNull();
  });

  it("sums fractional hours without drift over many short sessions", () => {
    const r = analyzeLot(lot({ labor: Array.from({ length: 30 }, () => labor(0.1)) }));
    expect(r.hours).toBe(3);
  });

  it("attributes hours to each team member", () => {
    const r = analyzeLot(lot({
      labor: [labor(3, { userName: "Paul" }), labor(1.5, { userName: "Sam" }), labor(2, { userName: "Paul" })],
    }));
    expect(r.hoursByUser).toEqual([
      { userName: "Paul", hours: 5, entries: 2 },
      { userName: "Sam", hours: 1.5, entries: 1 },
    ]);
  });

  it("breaks hours down by what the work was", () => {
    const r = analyzeLot(lot({
      labor: [labor(2, { activity: "PICKUP_TRANSPORT" }), labor(6, { activity: "PHOTOGRAPHING_LISTING" })],
    }));
    expect(r.hoursByActivity[0]).toEqual({ activity: "PHOTOGRAPHING_LISTING", hours: 6 });
  });

  it("counts only units that actually sold as revenue", () => {
    // A price on an unsold unit is an asking price, not money in the bank.
    const r = analyzeLot(lot({
      units: [unit({ salePrice: 400 }), unit({ soldDate: d("2026-02-01"), salePrice: 100 })],
      labor: [labor(1)],
    }));
    expect(r.revenue).toBe(100);
    expect(r.soldUnits).toBe(1);
  });
});

// ── Metric 2 ────────────────────────────────────────────────────────────
describe("metric 2 — dud rate", () => {
  it("is duds ÷ all units", () => {
    const r = analyzeLot(lot({
      units: [unit({ isDud: true }), unit({ isDud: true }), unit(), unit()],
    }));
    expect(r.duds).toBe(2);
    expect(r.dudRatePct).toBe(50);
    expect(r.nonDudUnits).toBe(2);
  });

  it("breaks duds out by reason", () => {
    const r = analyzeLot(lot({
      units: [
        unit({ isDud: true, dudReason: "MISSING_BATTERY" }),
        unit({ isDud: true, dudReason: "MISSING_BATTERY" }),
        unit({ isDud: true, dudReason: "NOT_AS_MANIFESTED" }),
      ],
    }));
    expect(r.dudsByReason).toEqual([
      { reason: "MISSING_BATTERY", count: 2 },
      { reason: "NOT_AS_MANIFESTED", count: 1 },
    ]);
  });

  it("files an unexplained dud under OTHER rather than dropping it", () => {
    const r = analyzeLot(lot({ units: [unit({ isDud: true })] }));
    expect(r.dudsByReason).toEqual([{ reason: "OTHER", count: 1 }]);
  });

  it("is null on an empty lot, not 0%", () => {
    expect(analyzeLot(lot()).dudRatePct).toBeNull();
  });
});

// ── Metric 3 ────────────────────────────────────────────────────────────
describe("metric 3 — sell-through at 30/60/90 days", () => {
  it("counts sales inside each window against the sellable units", () => {
    const r = analyzeLot(lot({
      pickupDate: d("2026-01-01"),
      units: [
        unit({ soldDate: d("2026-01-20") }), // within 30
        unit({ soldDate: d("2026-02-20") }), // within 60
        unit({ soldDate: d("2026-03-25") }), // within 90
        unit(), // unsold
      ],
    }));
    const at = (n: number) => r.sellThroughPct.find((s) => s.days === n)!;
    expect(at(30)).toEqual({ days: 30, pct: 25, sold: 1 });
    expect(at(60)).toEqual({ days: 60, pct: 50, sold: 2 });
    expect(at(90)).toEqual({ days: 90, pct: 75, sold: 3 });
  });

  it("excludes duds from the denominator so a broken lot cannot look slow-but-fine", () => {
    // 2 sellable, 1 sold inside 30 days, plus 8 duds that never could sell.
    const r = analyzeLot(lot({
      units: [
        unit({ soldDate: d("2026-01-10") }),
        unit(),
        ...Array.from({ length: 8 }, () => unit({ isDud: true })),
      ],
    }));
    expect(r.sellThroughPct.find((s) => s.days === 30)!.pct).toBe(50);
  });

  it("is null without a pickup date — the window has no start", () => {
    const r = analyzeLot(lot({ pickupDate: null, units: [unit({ soldDate: d("2026-01-10") })] }));
    expect(r.sellThroughPct.every((s) => s.pct === null)).toBe(true);
  });

  it("does not count a sale that landed before the lot arrived", () => {
    const r = analyzeLot(lot({ pickupDate: d("2026-06-01"), units: [unit({ soldDate: d("2026-01-10") }), unit()] }));
    // The early sale is inside the cutoff by construction, which is correct:
    // anything at or before pickup+N days counts, including day zero.
    expect(r.sellThroughPct.find((s) => s.days === 30)!.sold).toBe(1);
  });
});

// ── Metric 4 ────────────────────────────────────────────────────────────
describe("metric 4 — days from pickup to first listing", () => {
  it("measures from pickup to the earliest listing, not the latest", () => {
    const r = analyzeLot(lot({
      pickupDate: d("2026-01-01"),
      units: [unit({ listedDate: d("2026-01-30") }), unit({ listedDate: d("2026-01-08") })],
    }));
    expect(r.daysToFirstListing).toBe(7);
  });

  it("is null until something is listed", () => {
    expect(analyzeLot(lot({ units: [unit(), unit()] })).daysToFirstListing).toBeNull();
  });

  it("raises the alarm when processing is slipping", () => {
    const rows = [
      { id: "a", daysToFirstListing: 12 }, { id: "b", daysToFirstListing: 14 },
      { id: "c", daysToFirstListing: 4 }, { id: "d", daysToFirstListing: 4 },
    ] as never as ReturnType<typeof analyzeLot>[];
    const lots = [
      { id: "a", pickupDate: d("2026-04-01") }, { id: "b", pickupDate: d("2026-03-01") },
      { id: "c", pickupDate: d("2026-02-01") }, { id: "d", pickupDate: d("2026-01-01") },
    ];
    const t = processingTrend(rows, lots, 2);
    expect(t.recentAvg).toBe(13);
    expect(t.priorAvg).toBe(4);
    expect(t.changeDays).toBe(9);
    expect(t.alarm).toBe(true);
  });

  it("does not cry wolf over a small absolute slip", () => {
    const rows = [
      { id: "a", daysToFirstListing: 1.5 }, { id: "b", daysToFirstListing: 1.5 },
      { id: "c", daysToFirstListing: 1 }, { id: "d", daysToFirstListing: 1 },
    ] as never as ReturnType<typeof analyzeLot>[];
    const lots = [
      { id: "a", pickupDate: d("2026-04-01") }, { id: "b", pickupDate: d("2026-03-01") },
      { id: "c", pickupDate: d("2026-02-01") }, { id: "d", pickupDate: d("2026-01-01") },
    ];
    expect(processingTrend(rows, lots, 2).alarm).toBe(false);
  });

  it("has no trend to report from a single lot", () => {
    const t = processingTrend(
      [{ id: "a", daysToFirstListing: 5 }] as never as ReturnType<typeof analyzeLot>[],
      [{ id: "a", pickupDate: d("2026-01-01") }],
      5
    );
    expect(t.priorAvg).toBeNull();
    expect(t.alarm).toBe(false);
  });
});

// ── Metric 5 ────────────────────────────────────────────────────────────
describe("metric 5 — estimate accuracy", () => {
  it("is actual recovery ÷ the pre-bid estimate", () => {
    const r = analyzeLot(lot({
      preBidEstimatedRecovery: 2000,
      units: [unit({ soldDate: d("2026-02-01"), salePrice: 1600 })],
    }));
    expect(r.estimateAccuracy).toBe(0.8);
  });

  it("is null when nobody recorded an estimate", () => {
    const r = analyzeLot(lot({ units: [unit({ soldDate: d("2026-02-01"), salePrice: 500 })] }));
    expect(r.estimateAccuracy).toBeNull();
  });

  it("treats a zero estimate as unusable rather than dividing by it", () => {
    const r = analyzeLot(lot({
      preBidEstimatedRecovery: 0,
      units: [unit({ soldDate: d("2026-02-01"), salePrice: 500 })],
    }));
    expect(r.estimateAccuracy).toBeNull();
  });

  it("splits recovery into floor and speculative", () => {
    const r = analyzeLot(lot({
      units: [
        unit({ valueClass: "FLOOR", soldDate: d("2026-02-01"), salePrice: 750 }),
        unit({ valueClass: "SPECULATIVE", soldDate: d("2026-02-01"), salePrice: 200 }),
        unit({ soldDate: d("2026-02-01"), salePrice: 50 }),
      ],
    }));
    expect(r.floorRecovery).toBe(750);
    expect(r.speculativeRecovery).toBe(200);
    expect(r.unclassifiedRecovery).toBe(50);
    expect(r.floorRecoveryPct).toBe(75);
  });

  it("says plainly when the bids are running high", () => {
    expect(accuracyNote(0.78, 6)).toContain("max bids are running high");
    expect(accuracyNote(1.3, 6)).toContain("bid harder");
    expect(accuracyNote(1.02, 6)).toContain("within 10%");
    expect(accuracyNote(0.5, 2)).toContain("Too few");
    expect(accuracyNote(null, 0)).toContain("record an estimate");
  });
});

// ── The prohibition ─────────────────────────────────────────────────────
describe("cost stays at the lot", () => {
  it("exposes no per-unit cost anywhere in the result", () => {
    const r = analyzeLot(lot({
      totalCost: 1000,
      units: [unit({ soldDate: d("2026-02-01"), salePrice: 300 }), unit(), unit()],
      labor: [labor(5)],
    }));
    const keys = JSON.stringify(r);
    expect(keys).not.toMatch(/perUnit|unitCost|costPerUnit|allocated/i);
    // Profit is revenue against the WHOLE lot cost, so a half-sold lot reads
    // as the loss it currently is rather than a fabricated per-item margin.
    expect(r.profit).toBe(-700);
  });

  it("keeps manifest retail as context and never prices from it", () => {
    const r = analyzeLot(lot({ manifestRetailTotal: 9999, units: [unit()] }));
    expect(r.manifestRetailTotal).toBe(9999);
    expect(r.revenue).toBe(0);
    expect(r.profit).toBe(-1000);
  });

  it("splits the purchase price out of the all-in cost", () => {
    const r = analyzeLot(lot({ totalCost: 1150.5, fees: 150.5 }));
    expect(r.purchasePrice).toBe(1000);
    expect(r.totalCost).toBe(1150.5);
  });

  it("reports the shortfall between manifest and reality", () => {
    expect(analyzeLot(lot({ manifestUnitCount: 37, actualUnitCount: 34 })).unitShortfall).toBe(3);
    expect(analyzeLot(lot({ manifestUnitCount: 37 })).unitShortfall).toBeNull();
  });
});

// ── Aggregate ───────────────────────────────────────────────────────────
describe("aggregate — what should we buy next", () => {
  const tools = lot({
    id: "t", code: "PAL-1", category: "POWER_TOOLS", conditionGrade: "CUSTOMER_RETURNS",
    totalCost: 500, preBidEstimatedRecovery: 1000, pickupDate: d("2026-01-01"),
    units: [
      unit({ category: "POWER_TOOLS", soldDate: d("2026-01-10"), salePrice: 900, listedDate: d("2026-01-03"), valueClass: "FLOOR" }),
      unit({ category: "POWER_TOOLS", isDud: true, dudReason: "MISSING_BATTERY" }),
    ],
    labor: [labor(4)],
  });
  const lighting = lot({
    id: "g", code: "PAL-2", category: "ELECTRICAL_LIGHTING", conditionGrade: "SHELF_PULL",
    totalCost: 800, preBidEstimatedRecovery: 1000, pickupDate: d("2026-02-01"),
    units: [
      unit({ category: "ELECTRICAL_LIGHTING", soldDate: d("2026-02-10"), salePrice: 1000, listedDate: d("2026-02-06"), valueClass: "SPECULATIVE" }),
      unit({ category: "ELECTRICAL_LIGHTING" }),
    ],
    labor: [labor(20)],
  });

  it("ranks lot categories by profit per hour", () => {
    const a = aggregate([tools, lighting]);
    // Tools: (900−500)/4 = 100/hr. Lighting: (1000−800)/20 = 10/hr.
    expect(a.byCategory.map((c) => [c.key, c.profitPerHour])).toEqual([
      ["POWER_TOOLS", 100],
      ["ELECTRICAL_LIGHTING", 10],
    ]);
  });

  it("pools profit and hours per group rather than averaging ratios", () => {
    // Two lots in one category: a good 1-hour lot and a bad 99-hour one. The
    // honest group figure is dominated by where the hours actually went.
    const good = lot({ id: "a", category: "HARDWARE", totalCost: 0, units: [unit({ soldDate: d("2026-01-02"), salePrice: 100 })], labor: [labor(1)] });
    const bad = lot({ id: "b", category: "HARDWARE", totalCost: 0, units: [unit({ soldDate: d("2026-01-02"), salePrice: 99 })], labor: [labor(99)] });
    const g = aggregate([good, bad]).byCategory[0];
    expect(g.profitPerHour).toBe(1.99); // 199 / 100, not (100 + 1)/2
  });

  it("groups by condition grade too — the axis that predicts duds", () => {
    const a = aggregate([tools, lighting]);
    expect(a.byConditionGrade.map((c) => c.key).sort()).toEqual(["CUSTOMER_RETURNS", "SHELF_PULL"]);
    expect(a.byConditionGrade.find((c) => c.key === "CUSTOMER_RETURNS")!.dudRatePct).toBe(50);
    expect(a.byConditionGrade.find((c) => c.key === "SHELF_PULL")!.dudRatePct).toBe(0);
  });

  it("reports dud rate by the unit's own category, since lots are mixed", () => {
    const mixed = lot({
      id: "m", category: "MIXED",
      units: [
        unit({ category: "PLUMBING", isDud: true }),
        unit({ category: "PLUMBING" }),
        unit({ category: "HAND_TOOLS" }),
      ],
    });
    const a = aggregate([mixed]);
    expect(a.dudRateByUnitCategory).toEqual([
      { key: "PLUMBING", units: 2, duds: 1, dudRatePct: 50 },
      { key: "HAND_TOOLS", units: 1, duds: 0, dudRatePct: 0 },
    ]);
  });

  it("ranks dud reasons across the whole business", () => {
    const a = aggregate([tools, lighting]);
    expect(a.dudsByReason).toEqual([{ reason: "MISSING_BATTERY", count: 1, pct: 100 }]);
  });

  it("orders the accuracy trend oldest first so it can be plotted", () => {
    const a = aggregate([lighting, tools]);
    expect(a.accuracyTrend.map((p) => p.code)).toEqual(["PAL-1", "PAL-2"]);
    expect(a.avgEstimateAccuracy).toBe(0.95); // (0.9 + 1.0) / 2
  });

  it("says how much of the total recovery came from floor stock", () => {
    expect(aggregate([tools, lighting]).floorRecoveryPct).toBeCloseTo(47.4, 1); // 900 / 1900
  });

  it("counts the lots the metrics cannot see", () => {
    const blind = lot({ id: "x", preBidEstimatedRecovery: null, labor: [] });
    const a = aggregate([tools, blind]);
    expect(a.lotsMissingEstimate).toBe(1);
    expect(a.lotsMissingHours).toBe(1);
  });

  it("is all nulls and zeros with nothing bought yet, never NaN", () => {
    const a = aggregate([]);
    expect(a.lots).toBe(0);
    expect(a.profitPerHour).toBeNull();
    expect(a.avgEstimateAccuracy).toBeNull();
    expect(a.floorRecoveryPct).toBeNull();
    expect(a.processing.alarm).toBe(false);
    expect(Number.isNaN(a.profit)).toBe(false);
  });

  it("answers the 200-unit-lighting vs 40-unit-tools question directly", () => {
    const a = aggregate([tools, lighting]);
    const best = a.byCategory[0];
    expect(best.key).toBe("POWER_TOOLS");
    expect(best.profitPerHour).toBeGreaterThan(a.byCategory[1].profitPerHour!);
  });
});
