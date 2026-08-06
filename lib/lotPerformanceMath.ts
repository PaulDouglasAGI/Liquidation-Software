// Lot performance: the five metrics that tell us what kind of lots to keep
// buying. Pure (no DB), so every formula below is unit-tested directly.
//
// ─────────────────────────────────────────────────────────────────────────
// A deliberate omission, stated so nobody "fixes" it later:
//
// Lot cost is NEVER divided down to individual units. Not equally, not in
// proportion to manifest retail, not at all. Manifest retail is demonstrably
// unreliable — smart-home items manifested near $187 street at roughly $110 —
// so any allocation would bake that bad data into every per-unit margin
// downstream and make it look like a measurement.
//
// Profit therefore lives at the lot: revenue rolls UP from unit sales, cost
// stays PUT. Nothing in this file reads a per-item cost field.
// ─────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

const cents = (n: number) => Math.round(n * 100);
const fromCents = (n: number) => n / 100;
/** Percentages to one decimal; more would imply precision we don't have. */
const pct1 = (n: number) => Math.round(n * 1000) / 10;
const money2 = (n: number) => Math.round(n * 100) / 100;
const ratio2 = (n: number) => Math.round(n * 100) / 100;

export const VALUE_CLASSES = ["FLOOR", "SPECULATIVE"] as const;
export type ValueClassValue = (typeof VALUE_CLASSES)[number];

export const DUD_REASONS = [
  "NON_FUNCTIONAL",
  "MISSING_PARTS",
  "MISSING_BATTERY",
  "DAMAGED",
  "NOT_AS_MANIFESTED",
  "OTHER",
] as const;
export type DudReasonValue = (typeof DUD_REASONS)[number];

export const LABOR_ACTIVITIES = [
  "PICKUP_TRANSPORT",
  "TESTING_SORTING",
  "PHOTOGRAPHING_LISTING",
  "PACKING_SHIPPING",
  "OTHER",
] as const;
export type LaborActivityValue = (typeof LABOR_ACTIVITIES)[number];

export const CONDITION_GRADES = [
  "NEW",
  "SHELF_PULL",
  "OVERSTOCK",
  "CUSTOMER_RETURNS",
  "SALVAGE",
  "MIXED",
] as const;
export type ConditionGradeValue = (typeof CONDITION_GRADES)[number];

/** The horizons sell-through is reported at. */
export const SELL_THROUGH_DAYS = [30, 60, 90] as const;

/** One unit out of a lot. No cost field — see the note at the top. */
export interface LotUnit {
  category: string;
  valueClass: ValueClassValue | null;
  isDud: boolean;
  dudReason: DudReasonValue | null;
  listedDate: Date | null;
  soldDate: Date | null;
  salePrice: number | null;
}

/** One logged work session. */
export interface LotLabor {
  hours: number;
  activity: LaborActivityValue;
  userName: string;
  date: Date;
}

/** Everything about one purchased lot that the metrics need. */
export interface LotInput {
  id: string;
  code: string;
  source: string;
  sourceLotId: string | null;
  category: string;
  conditionGrade: ConditionGradeValue;
  status: string;
  /** All-in: hammer price plus fees. The only cost figure that exists. */
  totalCost: number;
  fees: number;
  pickupDate: Date | null;
  preBidEstimatedRecovery: number | null;
  manifestUnitCount: number | null;
  actualUnitCount: number | null;
  manifestRetailTotal: number | null;
  units: LotUnit[];
  labor: LotLabor[];
}

export interface HoursByUser {
  userName: string;
  hours: number;
  entries: number;
}

export interface LotPerformance {
  id: string;
  code: string;
  source: string;
  sourceLotId: string | null;
  category: string;
  conditionGrade: ConditionGradeValue;
  status: string;

  // ── Money (lot level only) ───────────────────────────────────────────
  totalCost: number;
  fees: number;
  /** totalCost − fees: what the lot itself went for. */
  purchasePrice: number;
  /** Everything the lot's units have sold for so far. */
  revenue: number;
  /** revenue − totalCost. Negative until the lot pays for itself. */
  profit: number;

  // ── Metric 1: profit per labor hour (the master metric) ──────────────
  hours: number;
  /** null when no hours are logged — a ratio over zero hours is not zero. */
  profitPerHour: number | null;
  hoursByUser: HoursByUser[];
  hoursByActivity: { activity: LaborActivityValue; hours: number }[];

  // ── Metric 2: dud rate ───────────────────────────────────────────────
  units: number;
  duds: number;
  nonDudUnits: number;
  /** 0–100, or null with no units. */
  dudRatePct: number | null;
  dudsByReason: { reason: DudReasonValue; count: number }[];

  // ── Metric 3: sell-through at 30/60/90 days ──────────────────────────
  soldUnits: number;
  /** 0–100 per horizon, or null without a pickup date or sellable units. */
  sellThroughPct: { days: number; pct: number | null; sold: number }[];

  // ── Metric 4: days from pickup to first listing ──────────────────────
  /** null until something is listed, or when no pickup date is recorded. */
  daysToFirstListing: number | null;

  // ── Metric 5: estimate accuracy ──────────────────────────────────────
  preBidEstimatedRecovery: number | null;
  /** revenue ÷ estimate. Below 1.0 means our max bids run high. */
  estimateAccuracy: number | null;

  // ── Supporting: where the recovery actually came from ────────────────
  floorRecovery: number;
  speculativeRecovery: number;
  /** Sales from units nobody has classified yet. */
  unclassifiedRecovery: number;
  /** Share of revenue from floor units — the rate worth bidding against. */
  floorRecoveryPct: number | null;

  /** Manifest promised minus what turned up. Positive means short. */
  unitShortfall: number | null;
  manifestRetailTotal: number | null;
}

/** Everything about a single lot, from its units and its labor log. */
export function analyzeLot(lot: LotInput): LotPerformance {
  const units = lot.units.length;
  const duds = lot.units.filter((u) => u.isDud).length;
  const nonDudUnits = units - duds;

  let revenueC = 0, floorC = 0, specC = 0, unclassC = 0;
  let soldUnits = 0;
  for (const u of lot.units) {
    if (u.soldDate == null || u.salePrice == null) continue;
    const c = cents(u.salePrice);
    revenueC += c;
    soldUnits++;
    if (u.valueClass === "FLOOR") floorC += c;
    else if (u.valueClass === "SPECULATIVE") specC += c;
    else unclassC += c;
  }

  const totalCostC = cents(lot.totalCost);
  const profitC = revenueC - totalCostC;

  // Hours in hundredths, so a hundred half-hour entries still sum exactly.
  const hoursH = lot.labor.reduce((s, l) => s + Math.round(l.hours * 100), 0);
  const hours = hoursH / 100;

  const byUser = new Map<string, HoursByUser>();
  for (const l of lot.labor) {
    const e = byUser.get(l.userName) ?? { userName: l.userName, hours: 0, entries: 0 };
    e.hours = Math.round((e.hours + l.hours) * 100) / 100;
    e.entries++;
    byUser.set(l.userName, e);
  }
  const byActivity = new Map<LaborActivityValue, number>();
  for (const l of lot.labor) {
    byActivity.set(l.activity, Math.round(((byActivity.get(l.activity) ?? 0) + l.hours) * 100) / 100);
  }

  const dudReasons = new Map<DudReasonValue, number>();
  for (const u of lot.units) {
    if (!u.isDud) continue;
    const r = u.dudReason ?? "OTHER";
    dudReasons.set(r, (dudReasons.get(r) ?? 0) + 1);
  }

  // Sell-through counts every unit sold inside the window, but measures it
  // against the units that could realistically sell — duds never could, and
  // leaving them in the denominator would quietly flatter a bad lot.
  const sellThroughPct = SELL_THROUGH_DAYS.map((days) => {
    if (!lot.pickupDate || nonDudUnits === 0) return { days, pct: null, sold: 0 };
    const cutoff = lot.pickupDate.getTime() + days * DAY_MS;
    const sold = lot.units.filter((u) => u.soldDate != null && u.soldDate.getTime() <= cutoff).length;
    return { days, pct: pct1(sold / nonDudUnits), sold };
  });

  const listedTimes = lot.units
    .map((u) => u.listedDate?.getTime())
    .filter((t): t is number => t != null);
  const daysToFirstListing =
    lot.pickupDate && listedTimes.length
      ? Math.round(((Math.min(...listedTimes) - lot.pickupDate.getTime()) / DAY_MS) * 10) / 10
      : null;

  const revenue = fromCents(revenueC);
  const estimate = lot.preBidEstimatedRecovery;

  return {
    id: lot.id,
    code: lot.code,
    source: lot.source,
    sourceLotId: lot.sourceLotId,
    category: lot.category,
    conditionGrade: lot.conditionGrade,
    status: lot.status,

    totalCost: fromCents(totalCostC),
    fees: money2(lot.fees),
    purchasePrice: fromCents(totalCostC - cents(lot.fees)),
    revenue,
    profit: fromCents(profitC),

    hours,
    // Zero hours is "not measured yet", not "infinite return per hour".
    profitPerHour: hoursH > 0 ? money2(fromCents(profitC) / hours) : null,
    hoursByUser: [...byUser.values()].sort((a, b) => b.hours - a.hours),
    hoursByActivity: [...byActivity.entries()]
      .map(([activity, h]) => ({ activity, hours: h }))
      .sort((a, b) => b.hours - a.hours),

    units,
    duds,
    nonDudUnits,
    dudRatePct: units > 0 ? pct1(duds / units) : null,
    dudsByReason: [...dudReasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),

    soldUnits,
    sellThroughPct,

    daysToFirstListing,

    preBidEstimatedRecovery: estimate,
    // A zero estimate is division by zero, not perfect inaccuracy.
    estimateAccuracy: estimate != null && estimate > 0 ? ratio2(revenue / estimate) : null,

    floorRecovery: fromCents(floorC),
    speculativeRecovery: fromCents(specC),
    unclassifiedRecovery: fromCents(unclassC),
    floorRecoveryPct: revenueC > 0 ? pct1(floorC / revenueC) : null,

    unitShortfall:
      lot.manifestUnitCount != null && lot.actualUnitCount != null
        ? lot.manifestUnitCount - lot.actualUnitCount
        : null,
    manifestRetailTotal: lot.manifestRetailTotal,
  };
}

/** One row of the "which kind of lot should we buy?" table. */
export interface GroupPerformance {
  key: string;
  lots: number;
  totalCost: number;
  revenue: number;
  profit: number;
  hours: number;
  /** Pooled, not an average of per-lot ratios — a 40-hour lot must not carry
   *  the same weight as a 2-hour one. */
  profitPerHour: number | null;
  units: number;
  duds: number;
  dudRatePct: number | null;
  /** Mean of the lots that have an accuracy figure at all. */
  avgEstimateAccuracy: number | null;
}

function groupBy(rows: LotPerformance[], keyOf: (r: LotPerformance) => string): GroupPerformance[] {
  const acc = new Map<string, LotPerformance[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const bucket = acc.get(k) ?? [];
    bucket.push(r);
    acc.set(k, bucket);
  }
  return [...acc.entries()]
    .map(([key, group]) => {
      const costC = group.reduce((s, r) => s + cents(r.totalCost), 0);
      const revC = group.reduce((s, r) => s + cents(r.revenue), 0);
      const hoursH = group.reduce((s, r) => s + Math.round(r.hours * 100), 0);
      const units = group.reduce((s, r) => s + r.units, 0);
      const duds = group.reduce((s, r) => s + r.duds, 0);
      const accs = group.map((r) => r.estimateAccuracy).filter((a): a is number => a != null);
      return {
        key,
        lots: group.length,
        totalCost: fromCents(costC),
        revenue: fromCents(revC),
        profit: fromCents(revC - costC),
        hours: hoursH / 100,
        profitPerHour: hoursH > 0 ? money2(fromCents(revC - costC) / (hoursH / 100)) : null,
        units,
        duds,
        dudRatePct: units > 0 ? pct1(duds / units) : null,
        avgEstimateAccuracy: accs.length ? ratio2(accs.reduce((a, b) => a + b, 0) / accs.length) : null,
      };
    })
    .sort((a, b) => (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity));
}

export interface ProcessingTrend {
  /** Mean days-to-first-listing over the most recent lots. */
  recentAvg: number | null;
  /** The same figure over the window before that, for comparison. */
  priorAvg: number | null;
  /** Positive means we are getting slower at getting stock listed. */
  changeDays: number | null;
  /** True when the backlog is growing enough to be worth saying out loud. */
  alarm: boolean;
  window: number;
}

/**
 * Days-to-first-listing, recent vs previous. A rising number means stock is
 * arriving faster than it can be processed — the one metric here that is an
 * operational alarm rather than a buying signal, so it gets its own shape.
 */
export function processingTrend(rows: LotPerformance[], lots: { id: string; pickupDate: Date | null }[], window = 5): ProcessingTrend {
  const order = new Map(lots.map((l) => [l.id, l.pickupDate?.getTime() ?? 0]));
  const timed = rows
    .filter((r) => r.daysToFirstListing != null)
    .sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0));

  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const recentAvg = mean(timed.slice(0, window).map((r) => r.daysToFirstListing!));
  const priorAvg = mean(timed.slice(window, window * 2).map((r) => r.daysToFirstListing!));
  const changeDays = recentAvg != null && priorAvg != null ? Math.round((recentAvg - priorAvg) * 10) / 10 : null;

  return {
    recentAvg,
    priorAvg,
    changeDays,
    // Both a real gap and a meaningful share of the old figure, so a drift
    // from 1.0 to 3.0 days does not raise the same flag as 20 to 22.
    alarm: changeDays != null && priorAvg != null && changeDays >= 2 && changeDays / Math.max(priorAvg, 1) >= 0.25,
    window,
  };
}

export interface AggregateInsights {
  lots: number;
  totalCost: number;
  revenue: number;
  profit: number;
  hours: number;
  profitPerHour: number | null;
  byCategory: GroupPerformance[];
  byConditionGrade: GroupPerformance[];
  /** Dud rate by the UNIT's own category — lots are mixed, so this is the
   *  breakdown that tells us which goods actually arrive broken. */
  dudRateByUnitCategory: { key: string; units: number; duds: number; dudRatePct: number }[];
  dudsByReason: { reason: DudReasonValue; count: number; pct: number }[];
  /** Estimate accuracy over time, oldest first, for the trend chart. */
  accuracyTrend: { id: string; code: string; date: Date | null; accuracy: number }[];
  avgEstimateAccuracy: number | null;
  processing: ProcessingTrend;
  /** Share of all revenue that came from floor stock, across every lot. */
  floorRecoveryPct: number | null;
  /** Lots with no pre-bid estimate: metric 5 cannot see them. */
  lotsMissingEstimate: number;
  /** Lots with no logged hours: metric 1 cannot see them. */
  lotsMissingHours: number;
}

/** The view that answers "what should we bid on next?". */
export function aggregate(lots: LotInput[], window = 5): AggregateInsights {
  const rows = lots.map(analyzeLot);

  const costC = rows.reduce((s, r) => s + cents(r.totalCost), 0);
  const revC = rows.reduce((s, r) => s + cents(r.revenue), 0);
  const hoursH = rows.reduce((s, r) => s + Math.round(r.hours * 100), 0);

  const unitCat = new Map<string, { units: number; duds: number }>();
  for (const lot of lots) {
    for (const u of lot.units) {
      const e = unitCat.get(u.category) ?? { units: 0, duds: 0 };
      e.units++;
      if (u.isDud) e.duds++;
      unitCat.set(u.category, e);
    }
  }

  const reasons = new Map<DudReasonValue, number>();
  for (const r of rows) for (const d of r.dudsByReason) reasons.set(d.reason, (reasons.get(d.reason) ?? 0) + d.count);
  const totalDuds = [...reasons.values()].reduce((a, b) => a + b, 0);

  const pickup = new Map(lots.map((l) => [l.id, l.pickupDate]));
  const accuracyTrend = rows
    .filter((r) => r.estimateAccuracy != null)
    .map((r) => ({ id: r.id, code: r.code, date: pickup.get(r.id) ?? null, accuracy: r.estimateAccuracy! }))
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  const floorC = rows.reduce((s, r) => s + cents(r.floorRecovery), 0);

  return {
    lots: rows.length,
    totalCost: fromCents(costC),
    revenue: fromCents(revC),
    profit: fromCents(revC - costC),
    hours: hoursH / 100,
    profitPerHour: hoursH > 0 ? money2(fromCents(revC - costC) / (hoursH / 100)) : null,
    byCategory: groupBy(rows, (r) => r.category),
    byConditionGrade: groupBy(rows, (r) => r.conditionGrade),
    dudRateByUnitCategory: [...unitCat.entries()]
      .map(([key, v]) => ({ key, units: v.units, duds: v.duds, dudRatePct: pct1(v.duds / v.units) }))
      .sort((a, b) => b.dudRatePct - a.dudRatePct),
    dudsByReason: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count, pct: totalDuds ? pct1(count / totalDuds) : 0 }))
      .sort((a, b) => b.count - a.count),
    accuracyTrend,
    avgEstimateAccuracy: accuracyTrend.length
      ? ratio2(accuracyTrend.reduce((s, a) => s + a.accuracy, 0) / accuracyTrend.length)
      : null,
    processing: processingTrend(rows, lots.map((l) => ({ id: l.id, pickupDate: l.pickupDate })), window),
    floorRecoveryPct: revC > 0 ? pct1(floorC / revC) : null,
    lotsMissingEstimate: rows.filter((r) => r.estimateAccuracy == null).length,
    lotsMissingHours: rows.filter((r) => r.hours === 0).length,
  };
}

/**
 * Plain-English reading of the bidding signal. Accuracy below 1.0 sustained
 * means the max bids are systematically too high, which is the whole point of
 * recording a pre-bid estimate in the first place.
 */
export function accuracyNote(avg: number | null, sampleSize: number): string {
  if (avg == null || sampleSize === 0) {
    return "No lot has both a pre-bid estimate and a sale yet — record an estimate before you bid and this starts working.";
  }
  const off = Math.abs(Math.round((avg - 1) * 100));
  const base = `${sampleSize} lot${sampleSize === 1 ? "" : "s"} scored.`;
  if (sampleSize < 3) return `${base} Too few to draw a conclusion from — treat it as a first reading.`;
  if (avg < 0.9) return `${base} Recovery is landing about ${off}% under estimate — your max bids are running high.`;
  if (avg > 1.1) return `${base} Recovery is beating estimate by about ${off}% — you can likely bid harder.`;
  return `${base} Estimates are tracking reality within 10%.`;
}
